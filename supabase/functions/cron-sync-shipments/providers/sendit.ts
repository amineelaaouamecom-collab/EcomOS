import { ProviderAdapter, SyncTarget, SyncResult } from "../engine/ProviderAdapter.ts";
import type { CanonicalStatus } from "../engine/normalization.ts";

export function mapSenditStatus(raw: string): CanonicalStatus {
    const s = String(raw ?? "").trim().toLowerCase();
    if (s.includes("livré") || s.includes("delivered")) return "DELIVERED";
    if (s.includes("en livraison") || s.includes("out for delivery")) return "OUT_FOR_DELIVERY";
    if (s.includes("ramassé") || s.includes("picked up")) return "PICKED_UP";
    if (s.includes("en transit") || s.includes("in transit")) return "IN_TRANSIT";
    if (s.includes("refusé") || s.includes("refused")) return "REFUSED";
    if (s.includes("retour") || s.includes("returned")) return "RETURNED_TO_SENDER";
    if (s.includes("annulé") || s.includes("canceled")) return "CANCELED";
    if (s.includes("nouveau") || s.includes("new")) return "NEW_PARCEL";
    return "UNKNOWN";
}

export class SenditAdapter implements ProviderAdapter {
    id = "sendit";
    batchSize = 20;

    async syncShipments(targets: SyncTarget[], credentials?: { api_key: string; api_url?: string }): Promise<SyncResult[]> {
        if (!credentials?.api_key) {
            return targets.map(t => ({ orderId: t.id, provider: this.id, success: false, error: "Missing Sendit credentials" }));
        }

        const baseUrl = credentials.api_url || "https://api.sendit.ma";
        const results: SyncResult[] = [];

        const CONCURRENCY = 5;
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
            const chunk = targets.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(
                chunk.map(async (target) => {
                    const code = target.sendit_order_id || target.tracking_number;
                    if (!code) {
                        return { orderId: target.id, provider: this.id, success: false, error: "No Sendit ID or tracking number" } as SyncResult;
                    }
                    try {
                        const res = await fetch(`${baseUrl}/shipment/track/${code}`, {
                            headers: { "Authorization": `Bearer ${credentials.api_key}`, "Accept": "application/json" },
                            signal: AbortSignal.timeout(10_000),
                        });
                        if (!res.ok) throw new Error(`Sendit HTTP ${res.status}`);
                        const data = await res.json();
                        const rawStatus = data?.status ?? data?.data?.status ?? "UNKNOWN";
                        const normalized = mapSenditStatus(String(rawStatus));
                        return {
                            orderId: target.id, provider: this.id, success: true,
                            rawStatus: String(rawStatus), normalizedStatus: normalized,
                            trackingEvent: { provider_event_id: `sendit-${code}-${normalized}`, description: String(rawStatus) },
                        } as SyncResult;
                    } catch (err: any) {
                        return { orderId: target.id, provider: this.id, success: false, error: err.message, shouldRetry: true } as SyncResult;
                    }
                })
            );
            batchResults.forEach(r => results.push(r.status === "fulfilled" ? r.value : { orderId: "", provider: this.id, success: false, error: "Processing error" }));
        }
        return results;
    }
}
