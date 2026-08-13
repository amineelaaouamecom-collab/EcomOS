import { ProviderAdapter, SyncTarget, SyncResult } from "../engine/ProviderAdapter.ts";
import type { CanonicalStatus } from "../engine/normalization.ts";

export function mapForcelogStatus(raw: string): CanonicalStatus {
    const s = String(raw ?? "").trim().toLowerCase();
    if (s.includes("livré") || s.includes("delivered")) return "DELIVERED";
    if (s.includes("en livraison") || s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
    if (s.includes("ramassé") || s.includes("picked")) return "PICKED_UP";
    if (s.includes("transit")) return "IN_TRANSIT";
    if (s.includes("refusé") || s.includes("refused")) return "REFUSED";
    if (s.includes("retour") || s.includes("return")) return "RETURNED_TO_SENDER";
    if (s.includes("annulé") || s.includes("cancel")) return "CANCELED";
    if (s.includes("nouveau") || s.includes("new")) return "NEW_PARCEL";
    return "UNKNOWN";
}

export class ForcelogAdapter implements ProviderAdapter {
    id = "forcelog";
    batchSize = 10;

    async syncShipments(targets: SyncTarget[], credentials?: { api_token: string }): Promise<SyncResult[]> {
        if (!credentials?.api_token) {
            return targets.map(t => ({ orderId: t.id, provider: this.id, success: false, error: "Missing ForceLog credentials" }));
        }

        const results: SyncResult[] = [];
        const CONCURRENCY = 5;
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
            const chunk = targets.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(
                chunk.map(async (target) => {
                    const code = target.forcelog_order_id || target.tracking_number;
                    if (!code) return { orderId: target.id, provider: this.id, success: false, error: "No ForceLog ID" } as SyncResult;
                    try {
                        const res = await fetch(`https://api.forcelog.ma/tracking/${code}`, {
                            headers: { "Authorization": `Bearer ${credentials.api_token}`, "Accept": "application/json" },
                            signal: AbortSignal.timeout(10_000),
                        });
                        if (!res.ok) throw new Error(`ForceLog HTTP ${res.status}`);
                        const data = await res.json();
                        const rawStatus = data?.status ?? data?.current_status ?? "UNKNOWN";
                        const normalized = mapForcelogStatus(String(rawStatus));
                        return {
                            orderId: target.id, provider: this.id, success: true,
                            rawStatus: String(rawStatus), normalizedStatus: normalized,
                            trackingEvent: { provider_event_id: `forcelog-${code}-${normalized}`, description: String(rawStatus) },
                        } as SyncResult;
                    } catch (err: any) {
                        return { orderId: target.id, provider: this.id, success: false, error: err.message, shouldRetry: true } as SyncResult;
                    }
                })
            );
            batchResults.forEach(r => results.push(r.status === "fulfilled" ? r.value : { orderId: "", provider: this.id, success: false, error: "Error" }));
        }
        return results;
    }
}
