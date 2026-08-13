import { CanonicalStatus } from "./normalization.ts";

export interface SyncTarget {
    id: string; // Order UUID
    order_id: string;
    workspace_id: string;
    shipping_provider: string;
    tracking_number: string;
    coliaty_parcel_code?: string;
    ameex_order_id?: string;
    forcelog_order_id?: string;
    sendit_order_id?: string;
}

export interface SyncResult {
    success: boolean;
    orderId: string;
    provider: string;
    rawStatus?: string;
    normalizedStatus?: CanonicalStatus;
    eventAt?: Date; // Last event date if available
    trackingEvent?: {
        provider_event_id: string;
        description: string;
        location?: string;
    };
    error?: string;
    shouldRetry?: boolean;
}

export interface ProviderAdapter {
    id: string;
    batchSize: number;
    syncShipments(targets: SyncTarget[], credentials?: any): Promise<SyncResult[]>;
}
