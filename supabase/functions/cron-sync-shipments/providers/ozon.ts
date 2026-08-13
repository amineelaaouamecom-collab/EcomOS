import { ProviderAdapter, SyncTarget, SyncResult } from "../engine/ProviderAdapter.ts";
import { normalizeOzonStatus } from "../engine/normalization.ts";

export class OzonAdapter implements ProviderAdapter {
    id = "ozon";
    batchSize = 20; // Example safe batch size

    async syncShipments(targets: SyncTarget[], credentials?: any): Promise<SyncResult[]> {
        const results: SyncResult[] = [];

        // Ozon currently might only support individual lookup in this architecture
        for (const target of targets) {
            if (!target.tracking_number) {
                results.push({ orderId: target.id, provider: this.id, success: false, error: "No tracking number" });
                continue;
            }

            try {
                const response = await fetch(`https://api.ozonexpress.ma/api/v1/tracking/${target.tracking_number}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10000)
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        results.push({ orderId: target.id, provider: this.id, success: false, error: "Rate limit", shouldRetry: true });
                        continue;
                    }
                    throw new Error(`Ozon API Error: ${response.status}`);
                }

                const data = await response.json();

                // Ozon response structure extraction
                let rawStatus = "UNKNOWN";
                if (data.status) rawStatus = data.status;
                else if (data.data?.status) rawStatus = data.data.status;
                else if (data.current_status) rawStatus = data.current_status;

                results.push({
                    orderId: target.id,
                    provider: this.id,
                    success: true,
                    rawStatus,
                    normalizedStatus: normalizeOzonStatus(rawStatus),
                    trackingEvent: {
                        provider_event_id: `ozon-${target.tracking_number}-${Date.now()}`, // fallback id
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
