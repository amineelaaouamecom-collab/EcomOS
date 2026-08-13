-- ============================================================
-- ECOM OS — 24/7 Backend Shipping & Webhook Sync Schema
-- ============================================================

-- 1. Add background sync tracking columns to orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS sync_attempts INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
ADD COLUMN IF NOT EXISTS provider_status TEXT,
ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_locked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_locked_by TEXT;

-- 2. Create tracking events log table for exact 24/7 chronology
CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_event_id TEXT, -- e.g., 'event_94029'
    status TEXT NOT NULL,
    description TEXT,
    location TEXT,
    event_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Idempotency constraint ensuring we never insert the same event code twice
    CONSTRAINT uq_shipment_tracking_events_event UNIQUE NULLS NOT DISTINCT (order_id, provider_event_id, description, status)
);

ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace tracking events"
ON public.shipment_tracking_events FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_users 
        WHERE workspace_users.workspace_id = shipment_tracking_events.workspace_id 
        AND workspace_users.user_id = auth.uid()
    )
);

-- 3. Create backend health monitor table
CREATE TABLE IF NOT EXISTS public.background_services (
    service_name TEXT PRIMARY KEY,
    last_started_at TIMESTAMP WITH TIME ZONE,
    last_completed_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    status TEXT DEFAULT 'idle'
);

ALTER TABLE public.background_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read background services" ON public.background_services FOR SELECT TO authenticated USING (true);


-- 4. Fast partial index for the ~30s worker query (finding shipments due for sync)
CREATE INDEX IF NOT EXISTS active_shipments_next_sync_idx
ON public.orders (shipping_provider, next_sync_at)
WHERE shipping_status NOT IN ('DELIVERED', 'REFUSED', 'CANCELED', 'RETURNED_TO_SENDER', 'RETURN_DONE');

-- 5. Helper function for atomic claim (Advisory style locking pattern via UPDATE)
CREATE OR REPLACE FUNCTION claim_shipments_for_sync(
    batch_size INT,
    worker_id TEXT,
    lock_timeout_minutes INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    order_id TEXT,
    workspace_id UUID,
    shipping_provider TEXT,
    tracking_number TEXT,
    coliaty_parcel_code TEXT,
    ameex_order_id TEXT,
    forcelog_order_id TEXT,
    sendit_order_id TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH targets AS (
        SELECT o.id 
        FROM public.orders o
        WHERE 
            o.shipping_status NOT IN ('DELIVERED', 'REFUSED', 'CANCELED', 'RETURNED_TO_SENDER', 'RETURN_DONE')
            AND o.shipping_provider IS NOT NULL
            AND (
                -- Safe to sync if next_sync_at is passed
                o.next_sync_at <= NOW()
                OR o.next_sync_at IS NULL
            )
            AND (
                -- Not currently locked, or lock has expired (worker crashed)
                o.sync_locked_by IS NULL
                OR o.sync_locked_at < NOW() - (lock_timeout_minutes || ' minutes')::interval
            )
        ORDER BY o.next_sync_at ASC NULLS FIRST
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.orders
    SET 
        sync_locked_at = NOW(),
        sync_locked_by = worker_id
    WHERE public.orders.id IN (SELECT t.id FROM targets t)
    RETURNING 
        public.orders.id, 
        public.orders."Order ID", 
        public.orders.workspace_id, 
        public.orders.shipping_provider, 
        public.orders.tracking_number,
        public.orders.coliaty_parcel_code,
        public.orders.ameex_order_id,
        public.orders.forcelog_order_id,
        public.orders.sendit_order_id;
END;
$$;
