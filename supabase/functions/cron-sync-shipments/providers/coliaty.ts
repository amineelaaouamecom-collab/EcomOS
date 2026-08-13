import { ProviderAdapter, SyncTarget, SyncResult } from "../engine/ProviderAdapter.ts";
import type { CanonicalStatus } from "../engine/normalization.ts";

export function mapColiatyStatus(raw: string): CanonicalStatus {
    const s = String(raw ?? "").trim().toLowerCase();
    if (s.includes("livré") || s === "delivered" || s.includes("6")) return "DELIVERED";
    if (s.includes("en livraison") || s.includes("out for delivery") || s === "5") return "OUT_FOR_DELIVERY";
    if (s.includes("ramassé") || s.includes("picked up") || s === "2") return "PICKED_UP";
    if (s.includes("en transit") || s.includes("in transit") || s === "3") return "IN_TRANSIT";
    if (s.includes("refusé") || s.includes("refused") || s === "7") return "REFUSED";
    if (s.includes("retour") || s.includes("returned") || s === "8") return "RETURNED_TO_SENDER";
    if (s.includes("annulé") || s.includes("canceled")) return "CANCELED";
    if (s.includes("nouveau") || s.includes("new") || s === "1") return "NEW_PARCEL";
    if (s.includes("retour dépôt") || s.includes("return to depot")) return "RETURN_TO_DEPOT";
    return "UNKNOWN";
}

export class ColiatyAdapter implements ProviderAdapter {
    id = "coliaty";
    batchSize = 20;

    async syncShipments(targets: SyncTarget[], credentials?: { public_key: string; secret_key: string; api_url?: string }): Promise<SyncResult[]> {
        if (!credentials?.public_key || !credentials?.secret_key) {
            return targets.map(t => ({ orderId: t.id, provider: this.id, success: false, error: "Missing Coliaty credentials" }));
        }

        const baseUrl = credentials.api_url || "https://customer-api-v1.coliaty.com";
        const authHeader = `Bearer ${credentials.public_key}:${credentials.secret_key}`;
        const results: SyncResult[] = [];

        // Coliaty has no batch status endpoint — process concurrently with limited pool
        const CONCURRENCY = 5;
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
            const chunk = targets.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(
                chunk.map(async (target) => {
                    const code = target.coliaty_parcel_code || target.tracking_number;
                    if (!code) {
                        return { orderId: target.id, provider: this.id, success: false, error: "No Coliaty parcel code" } as SyncResult;
                    }
                    try {
                        const res = await fetch(`${baseUrl}/parcel/status/${code}`, {
                            headers: { "Authorization": authHeader },
                            signal: AbortSignal.timeout(10_000),
                        });
                        if (!res.ok) throw new Error(`Coliaty HTTP ${res.status}`);
                        const data = await res.json();
                        const rawStatus = data?.data?.status?.name ?? data?.status ?? data?.data?.status ?? "UNKNOWN";
                        const normalized = mapColiatyStatus(String(rawStatus));
                        return {
                            orderId: target.id, provider: this.id, success: true,
                            rawStatus: String(rawStatus), normalizedStatus: normalized,
                            trackingEvent: { provider_event_id: `coliaty-${code}-${normalized}`, description: String(rawStatus) },
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
