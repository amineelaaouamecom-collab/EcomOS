import { ProviderAdapter, SyncTarget, SyncResult } from "../engine/ProviderAdapter.ts";
import { normalizeAmeexStatus } from "../engine/normalization.ts";

export class AmeexAdapter implements ProviderAdapter {
    id = "ameex";
    batchSize = 10;

    async syncShipments(targets: SyncTarget[], credentials?: any): Promise<SyncResult[]> {
        const results: SyncResult[] = [];

        if (!credentials?.client_api_key) {
            return targets.map(t => ({ orderId: t.id, provider: this.id, success: false, error: "Missing ameex credentials" }));
        }

        // Processing targets sequentially or in limited concurrency to respect Ameex API limits
        for (const target of targets) {
            const trackCode = target.ameex_order_id || target.tracking_number;
            if (!trackCode) {
                results.push({ orderId: target.id, provider: this.id, success: false, error: "No Ameex ID or tracking number" });
                continue;
            }

            try {
                // Hitting Ameex API via the Ecom OS Ameex Edge Function or directly. 
                // For direct robust scraping:
                const response = await fetch(`https://api.ameex.app/api/client/parcels/${trackCode}`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${credentials.client_api_key}`
                    },
                    signal: AbortSignal.timeout(10000)
                });

                if (!response.ok) throw new Error(`Ameex API Error: ${response.status}`);
                const data = await response.json();

                let rawStatus = "UNKNOWN";
                if (data?.data?.status) rawStatus = data.data.status;
                else if (typeof data?.status === 'string') rawStatus = data.status;

                results.push({
                    orderId: target.id,
                    provider: this.id,
                    success: true,
                    rawStatus,
                    normalizedStatus: normalizeAmeexStatus(rawStatus),
                    trackingEvent: {
                        provider_event_id: `ameex-${trackCode}-${rawStatus}`, // ID based on status state
                        description: rawStatus
                    }
                });
            } catch (error: any) {
                results.push({
                    orderId: target.id,
                    provider: this.id,
                    success: false,
                    error: error.message,
                    shouldRetry: true
                });
            }
        }

        return results;
    }
}
