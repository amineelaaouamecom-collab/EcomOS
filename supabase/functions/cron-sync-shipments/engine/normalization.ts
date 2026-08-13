export type CanonicalStatus =
    | 'NEW_PARCEL'
    | 'WAITING_PICKUP'
    | 'PICKED_UP'
    | 'RECEIVED_AT_WAREHOUSE'
    | 'IN_DISTRIBUTION'
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'REFUSED'
    | 'CANCELED'
    | 'RETURN_TO_DEPOT'
    | 'RETURNED_TO_SENDER'
    | 'RETURN_DONE'
    | 'DELIVERY_FAILED'
    | 'CUSTOMER_UNREACHABLE'
    | 'RESCHEDULE_REQUESTED'
    | 'UNKNOWN';

export function normalizeOzonStatus(raw: string): CanonicalStatus {
    const s = String(raw).trim().toLowerCase();

    if (s.includes('nouveau colis')) return 'NEW_PARCEL';
    if (s.includes('ramassé')) return 'PICKED_UP';
    if (s.includes('en transit')) return 'IN_DISTRIBUTION';
    if (s.includes('en livraison')) return 'OUT_FOR_DELIVERY';
    if (s.includes('livré')) return 'DELIVERED';
    if (s.includes('refusé')) return 'REFUSED';
    if (s.includes('retourné')) return 'RETURNED_TO_SENDER';
    if (s.includes('annulé') || s.includes('canceled')) return 'CANCELED';

    return 'UNKNOWN';
}

export function normalizeAmeexStatus(raw: string): CanonicalStatus {
    const s = String(raw).trim().toLowerCase();

    // Very broad matches reflecting common Ameex states
    if (s.includes('livré')) return 'DELIVERED';
    if (s.includes('annulé')) return 'CANCELED';
    if (s.includes('refusé')) return 'REFUSED';
    if (s.includes('en livraison') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY';
    if (s.includes('ramassé')) return 'PICKED_UP';
    if (s.includes('retour')) return 'RETURNED_TO_SENDER';
    if (s.includes('reçu') || s.includes('warehouse')) return 'RECEIVED_AT_WAREHOUSE';

    return 'UNKNOWN';
}

export function isTerminalStatus(status: CanonicalStatus): boolean {
    return ['DELIVERED', 'REFUSED', 'CANCELED', 'RETURNED_TO_SENDER', 'RETURN_DONE'].includes(status);
}
