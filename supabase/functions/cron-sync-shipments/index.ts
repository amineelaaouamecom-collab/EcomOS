// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — Deno globals (Deno.env, Deno.cron) are not in the tsconfig.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OzonAdapter } from "./providers/ozon.ts";
import { AmeexAdapter } from "./providers/ameex.ts";
import { ColiatyAdapter } from "./providers/coliaty.ts";
import { SenditAdapter } from "./providers/sendit.ts";
import { ForcelogAdapter } from "./providers/forcelog.ts";
import type { SyncTarget } from "./engine/ProviderAdapter.ts";
import { isTerminalStatus, type CanonicalStatus } from "./engine/normalization.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Provider adapters registry — add new providers here only
const ADAPTERS: Record<string, any> = {
    "ozon": new OzonAdapter(),
    "ameex": new AmeexAdapter(),
    "coliaty": new ColiatyAdapter(),
    "sendit": new SenditAdapter(),
    "forcelog": new ForcelogAdapter(),
    // digylog / livo: add when API is documented
};

// ── Fetch workspace credentials for a given provider ──────────────────────────
async function fetchCredentials(supabase: any, workspaceId: string, provider: string): Promise<Record<string, any> | null> {
    const { data } = await supabase
        .from("workspaces")
        .select("coliaty_public_key,coliaty_secret_key,coliaty_api_url,ozon_api_url,ameex_client_api_id,ameex_client_api_key,sendit_api_key,forcelog_api_token")
        .eq("id", workspaceId)
        .single();

    if (!data) return null;

    switch (provider) {
        case "coliaty": return data.coliaty_public_key ? { public_key: data.coliaty_public_key, secret_key: data.coliaty_secret_key, api_url: data.coliaty_api_url } : null;
        case "ozon": return data.ozon_api_url ? { api_url: data.ozon_api_url } : null;
        case "ameex": return data.ameex_client_api_key ? { client_api_id: data.ameex_client_api_id, client_api_key: data.ameex_client_api_key } : null;
        case "sendit": return data.sendit_api_key ? { api_key: data.sendit_api_key } : null;
        case "forcelog": return data.forcelog_api_token ? { api_token: data.forcelog_api_token } : null;
        default: return null;
    }
}

// ── Invoke the push-notification-worker ───────────────────────────────────────
async function triggerPush(supabase: any, workspaceId: string, orderId: string, orderNumber: string, status: CanonicalStatus) {
    const titles: Partial<Record<CanonicalStatus, string>> = {
        "DELIVERED": "✅ Livré",
        "REFUSED": "❌ Refusé",
        "OUT_FOR_DELIVERY": "🚚 En livraison",
        "PICKED_UP": "📦 Ramassé",
        "RETURNED_TO_SENDER": "↩️ Retourné",
    };
    const title = titles[status] ?? `📦 Mise à jour: ${status}`;
    const body = `Commande #${orderNumber}`;

    await supabase.functions.invoke("push-notification-worker", {
        body: { workspace_id: workspaceId, event_type: status, entity_id: orderId, title, body },
    }).catch((e: any) => console.warn("push-notification-worker invoke failed:", e.message));
}

// ── Main sync cycle ────────────────────────────────────────────────────────────
async function processSyncCycle() {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const workerId = `cron-${Date.now()}`;
    console.log(`[Sync] Cycle started — worker ${workerId}`);

    // Heartbeat start
    await supabase.from("background_services").upsert({
        service_name: "shipping-sync", last_started_at: new Date().toISOString(), status: "running"
    }).catch(() => null);

    // 1. Claim eligible shipments atomically using FOR UPDATE SKIP LOCKED via RPC
    const { data: claims, error: claimErr } = await supabase.rpc("claim_shipments_for_sync", {
        batch_size: 50, worker_id: workerId,
    });

    if (claimErr) { console.error("[Sync] Claim failed:", claimErr); return; }
    if (!claims?.length) { console.log("[Sync] No active shipments due for sync."); return; }
    console.log(`[Sync] Claimed ${claims.length} shipments.`);

    // 2. Group by (workspace_id, provider) for credential caching & fair batching
    type Group = { workspaceId: string; provider: string; targets: SyncTarget[] };
    const groups: Group[] = [];
    const seen = new Map<string, Group>();
    for (const c of claims) {
        const key = `${c.workspace_id}::${(c.shipping_provider || "").toLowerCase()}`;
        if (!seen.has(key)) {
            const g: Group = { workspaceId: c.workspace_id, provider: (c.shipping_provider || "").toLowerCase(), targets: [] };
            seen.set(key, g);
            groups.push(g);
        }
        seen.get(key)!.targets.push(c as SyncTarget);
    }

    // 3. Process each (workspace × provider) group — isolated, failures don't block others
    const groupResults = await Promise.allSettled(groups.map(async (group) => {
        const adapter = ADAPTERS[group.provider];
        const releaseWithBackoff = async (ids: string[], minutesBackoff = 10) => {
            await supabase.from("orders").update({
                sync_locked_by: null,
                next_sync_at: new Date(Date.now() + minutesBackoff * 60_000).toISOString(),
            }).in("id", ids);
        };

        if (!adapter) {
            console.warn(`[Sync] No adapter for provider "${group.provider}", skipping ${group.targets.length} orders`);
            await releaseWithBackoff(group.targets.map(t => t.id), 60);
            return;
        }

        // Fetch credentials once per (workspace, provider) pair
        let credentials: any = null;
        try {
            credentials = await fetchCredentials(supabase, group.workspaceId, group.provider);
        } catch (e: any) {
            console.error(`[Sync] Credential fetch failed for ${group.provider}/${group.workspaceId}:`, e.message);
            await releaseWithBackoff(group.targets.map(t => t.id), 30);
            return;
        }

        // Call provider adapter
        let results: Awaited<ReturnType<typeof adapter.syncShipments>> = [];
        try {
            results = await adapter.syncShipments(group.targets, credentials);
        } catch (err: any) {
            console.error(`[Sync] Adapter fatal error [${group.provider}]:`, err.message);
            await releaseWithBackoff(group.targets.map(t => t.id), 10);
            return;
        }

        // 4. Apply results transactionally per order
        for (const result of results) {
            const target = group.targets.find(t => t.id === result.orderId);
            if (!target) continue;

            if (!result.success || !result.normalizedStatus || result.normalizedStatus === "UNKNOWN") {
                // Backoff failed orders
                const backoffMins = result.shouldRetry ? 5 : 60;
                await supabase.from("orders").update({
                    sync_locked_by: null,
                    last_sync_error: result.error ?? "Sync failed",
                    sync_attempts: supabase.rpc("coalesce_increment", { col: "sync_attempts", row_id: target.id }) as any,
                    next_sync_at: new Date(Date.now() + backoffMins * 60_000).toISOString(),
                }).eq("id", target.id).catch(console.error);
                continue;
            }

            // Read existing status to detect meaningful change
            const { data: current } = await supabase.from("orders").select("shipping_status").eq("id", target.id).single();
            const prevStatus = current?.shipping_status;
            const newStatus = result.normalizedStatus;
            const changed = prevStatus !== newStatus;

            // Set next sync time based on urgency
            let nextSyncAt: string | null;
            if (isTerminalStatus(newStatus)) {
                nextSyncAt = null; // stop polling permanently
            } else {
                const delaySecs = newStatus === "OUT_FOR_DELIVERY" ? 600 : 1800; // 10 min vs 30 min
                nextSyncAt = new Date(Date.now() + delaySecs * 1000).toISOString();
            }

            const updatePayload: any = {
                sync_locked_by: null,
                last_synced_at: new Date().toISOString(),
                provider_status: result.rawStatus,
                last_sync_error: null,
                sync_attempts: 0,
                next_sync_at: nextSyncAt,
            };
            if (changed) {
                updatePayload.shipping_status = newStatus;
                if (newStatus === "DELIVERED") updatePayload.delivered_at = new Date().toISOString();
                if (newStatus === "REFUSED") updatePayload.refused_at = new Date().toISOString();
                if (newStatus === "RETURNED_TO_SENDER") updatePayload.returned_at = new Date().toISOString();
            }

            await supabase.from("orders").update(updatePayload).eq("id", target.id).catch(console.error);

            // Insert tracking event (unique constraint suppresses dupes)
            if (result.trackingEvent) {
                await supabase.from("shipment_tracking_events").insert({
                    workspace_id: group.workspaceId,
                    order_id: target.id,
                    provider: group.provider,
                    provider_event_id: result.trackingEvent.provider_event_id,
                    status: newStatus,
                    description: result.trackingEvent.description,
                    event_at: result.eventAt?.toISOString() ?? new Date().toISOString(),
                }).catch(() => null); // unique-constraint violations are expected and safe to ignore
            }

            // Push notification only on meaningful status change
            if (changed) {
                await triggerPush(supabase, group.workspaceId, target.id, target.order_id, newStatus);
            }
        }
    }));

    // Log any group-level failures
    groupResults.forEach(r => { if (r.status === "rejected") console.error("[Sync] Group processing rejected:", r.reason); });

    // Heartbeat success
    await supabase.from("background_services").upsert({
        service_name: "shipping-sync",
        last_completed_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        status: "idle",
    }).catch(() => null);

    console.log("[Sync] Cycle complete.");
}

// ── Cron schedule ─────────────────────────────────────────────────────────────
// Supabase Edge Function cron runs minimum every 1 minute.
// We run two cycles inside one invocation to get ~30-second granularity.
Deno.cron("sync-active-shipments", "* * * * *", async () => {
    await processSyncCycle();
    // Wait 30 s then run a second cycle within the same minute window
    await new Promise(r => setTimeout(r, 29_500));
    await processSyncCycle();
});

// ── Manual / webhook trigger endpoint ────────────────────────────────────────
serve(async (req: Request) => {
    if (req.method === "POST") {
        // Fire-and-forget so we respond immediately (< 500ms)
        processSyncCycle().catch(console.error);
        return new Response(JSON.stringify({ status: "sync_triggered" }), {
            headers: { "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ status: "cron-sync-shipments active" }), {
        headers: { "Content-Type": "application/json" },
    });
});
