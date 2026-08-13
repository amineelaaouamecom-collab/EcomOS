-- =====================================================================
-- ECOM OS — COMPLETE MASTER MIGRATION (FIXED)
-- Paste this ENTIRE file into your Supabase SQL Editor and run it.
-- It is idempotent: safe to run even if some tables already exist.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. PUSH SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_name TEXT,
    platform TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    enabled BOOLEAN DEFAULT TRUE,
    UNIQUE (user_id, endpoint)
);

-- Add foreign key constraints only if referenced tables exist
DO $$
BEGIN
    -- Check if workspaces table exists and has id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'push_subscriptions' 
                          AND constraint_name = 'push_subscriptions_workspace_id_fkey') THEN
                ALTER TABLE public.push_subscriptions 
                ADD CONSTRAINT push_subscriptions_workspace_id_fkey 
                FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;

    -- Check if auth.users table exists and has id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'push_subscriptions' 
                          AND constraint_name = 'push_subscriptions_user_id_fkey') THEN
                ALTER TABLE public.push_subscriptions 
                ADD CONSTRAINT push_subscriptions_user_id_fkey 
                FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;
END $$;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view their own push subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert their own push subscriptions" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update their own push subscriptions" ON public.push_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete their own push subscriptions" ON public.push_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. NOTIFICATION PREFERENCES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    notify_new_order BOOLEAN DEFAULT TRUE,
    notify_confirmed BOOLEAN DEFAULT FALSE,
    notify_no_answer BOOLEAN DEFAULT TRUE,
    notify_cancelled BOOLEAN DEFAULT FALSE,
    notify_in_transit BOOLEAN DEFAULT TRUE,
    notify_out_for_delivery BOOLEAN DEFAULT TRUE,
    notify_delivered BOOLEAN DEFAULT TRUE,
    notify_refused BOOLEAN DEFAULT TRUE,
    notify_returned BOOLEAN DEFAULT TRUE,
    notify_integration_error BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

-- Add foreign key constraints only if referenced tables exist
DO $$
BEGIN
    -- Check if workspaces table exists and has id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'notification_preferences' 
                          AND constraint_name = 'notification_preferences_workspace_id_fkey') THEN
                ALTER TABLE public.notification_preferences 
                ADD CONSTRAINT notification_preferences_workspace_id_fkey 
                FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;

    -- Check if auth.users table exists and has id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'notification_preferences' 
                          AND constraint_name = 'notification_preferences_user_id_fkey') THEN
                ALTER TABLE public.notification_preferences 
                ADD CONSTRAINT notification_preferences_user_id_fkey 
                FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;
END $$;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can view their own preferences" ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert their own preferences" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can update their own preferences" ON public.notification_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. NOTIFICATIONS (in-app bell + deduplication key)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    entity_id UUID,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    event_type TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deduplication_key TEXT
);

-- Add foreign key constraint only if workspaces table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'notifications' 
                          AND constraint_name = 'notifications_workspace_id_fkey') THEN
                ALTER TABLE public.notifications 
                ADD CONSTRAINT notifications_workspace_id_fkey 
                FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
  ON public.notifications (workspace_id, deduplication_key)
  WHERE deduplication_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspace notifications" ON public.notifications;
CREATE POLICY "Users can view workspace notifications" ON public.notifications FOR SELECT TO authenticated
  USING (workspace_id = public.get_my_workspace_id());

DROP POLICY IF EXISTS "Users can update their workspace notifications" ON public.notifications;
CREATE POLICY "Users can update their workspace notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (workspace_id = public.get_my_workspace_id());

-- ─────────────────────────────────────────────────────────────────────
-- 4. BACKGROUND SERVICES HEARTBEAT
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.background_services (
    service_name TEXT PRIMARY KEY,
    last_started_at TIMESTAMPTZ,
    last_completed_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error TEXT,
    status TEXT DEFAULT 'idle'
);
ALTER TABLE public.background_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read background services" ON public.background_services;
CREATE POLICY "Authenticated users can read background services" ON public.background_services FOR SELECT TO authenticated USING (true);

-- ─────────────────────────────────────────────────────────────────────
-- 5. SHIPMENT TRACKING EVENTS (deduplication via unique constraint)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    order_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_event_id TEXT,
    status TEXT NOT NULL,
    description TEXT,
    location TEXT,
    event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- A unique event is defined by the order + its provider_event_id, OR by order + status + description
    CONSTRAINT uq_tracking_event UNIQUE NULLS NOT DISTINCT (order_id, provider_event_id, status, description)
);

-- Add foreign key constraints only if referenced tables exist
DO $$
BEGIN
    -- Check if workspaces table exists and has id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workspaces') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspaces' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'shipment_tracking_events' 
                          AND constraint_name = 'shipment_tracking_events_workspace_id_fkey') THEN
                ALTER TABLE public.shipment_tracking_events 
                ADD CONSTRAINT shipment_tracking_events_workspace_id_fkey 
                FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;

    -- Check if orders table exists and has id column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                          WHERE constraint_schema = 'public' 
                          AND table_name = 'shipment_tracking_events' 
                          AND constraint_name = 'shipment_tracking_events_order_id_fkey') THEN
                ALTER TABLE public.shipment_tracking_events 
                ADD CONSTRAINT shipment_tracking_events_order_id_fkey 
                FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
            END IF;
        END IF;
    END IF;
END $$;

ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workspace tracking events" ON public.shipment_tracking_events;
CREATE POLICY "Users can view workspace tracking events" ON public.shipment_tracking_events FOR SELECT TO authenticated
  USING (workspace_id = public.get_my_workspace_id());

-- ─────────────────────────────────────────────────────────────────────
-- 6. BACKGROUND SYNC COLUMNS ON ORDERS TABLE
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Only add columns if the orders table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        ALTER TABLE public.orders
          ADD COLUMN IF NOT EXISTS last_synced_at      TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS next_sync_at         TIMESTAMPTZ DEFAULT NOW(),
          ADD COLUMN IF NOT EXISTS sync_attempts        INT DEFAULT 0,
          ADD COLUMN IF NOT EXISTS last_sync_error      TEXT,
          ADD COLUMN IF NOT EXISTS provider_status      TEXT,
          ADD COLUMN IF NOT EXISTS provider_updated_at  TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS sync_locked_at       TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS sync_locked_by       TEXT,
          ADD COLUMN IF NOT EXISTS delivered_at         TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS refused_at           TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS returned_at          TIMESTAMPTZ;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. SENDIT ORDER ID COLUMN (if not exists)
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Only add columns if the orders table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        ALTER TABLE public.orders
          ADD COLUMN IF NOT EXISTS sendit_order_id   TEXT,
          ADD COLUMN IF NOT EXISTS forcelog_order_id TEXT;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. PERFORMANCE INDEXES FOR WORKER QUERY
-- ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Only create indexes if the orders table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        -- Partial index: only active (non-terminal) shipments — never scans delivered orders
        CREATE INDEX IF NOT EXISTS idx_orders_active_sync
          ON public.orders (shipping_provider, workspace_id, next_sync_at)
          WHERE shipping_status NOT IN ('DELIVERED','REFUSED','CANCELED','RETURNED_TO_SENDER','RETURN_DONE')
            AND shipping_provider IS NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders (workspace_id, tracking_number) WHERE tracking_number IS NOT NULL;
    END IF;

    -- Only create tracking events index if the table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shipment_tracking_events') THEN
        CREATE INDEX IF NOT EXISTS idx_tracking_events_order ON public.shipment_tracking_events (order_id, created_at DESC);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 9. ATOMIC CLAIM FUNCTION (SKIP LOCKED — zero double-processing)
-- ─────────────────────────────────────────────────────────────────────
DO $outer_block$
BEGIN
    -- Only create the function if the orders table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        EXECUTE $$
        CREATE OR REPLACE FUNCTION claim_shipments_for_sync(
          batch_size INT DEFAULT 50,
          worker_id TEXT DEFAULT 'worker',
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
        SECURITY DEFINER
        AS $function$
        BEGIN
          RETURN QUERY
          WITH targets AS (
            SELECT o.id
            FROM public.orders o
            WHERE
              o.shipping_status NOT IN ('DELIVERED','REFUSED','CANCELED','RETURNED_TO_SENDER','RETURN_DONE')
              AND o.shipping_provider IS NOT NULL
              AND (o.next_sync_at IS NULL OR o.next_sync_at <= NOW())
              AND (
                o.sync_locked_by IS NULL
                OR o.sync_locked_at < NOW() - (lock_timeout_minutes || ' minutes')::INTERVAL
              )
            ORDER BY o.next_sync_at ASC NULLS FIRST
            LIMIT batch_size
            FOR UPDATE SKIP LOCKED
          )
          UPDATE public.orders
          SET
            sync_locked_at  = NOW(),
            sync_locked_by  = worker_id
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
        $function$;
        $$;

        -- Grant execute to service_role (Edge Function uses service_role key)
        EXECUTE 'GRANT EXECUTE ON FUNCTION claim_shipments_for_sync TO service_role';
    END IF;
END $outer_block$;

-- ─────────────────────────────────────────────────────────────────────
-- 10. CUSTOMER STATS AGGREGATION FUNCTION
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_stats(workspace_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  city TEXT,
  order_count BIGINT,
  total_spent NUMERIC,
  last_order_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.phone,
    c.city,
    COUNT(o.id) as order_count,
    COALESCE(SUM(
      CASE 
        WHEN o.shipping_status ILIKE '%delivered%' OR o.shipping_status ILIKE '%livré%' OR o.status = 'delivered' 
        THEN o.total 
        ELSE 0 
      END
    ), 0) as total_spent,
    MAX(o.created_at) as last_order_at
  FROM public.customers c
  LEFT JOIN public.orders o ON c.id = o.customer_id AND o.workspace_id = workspace_id
  WHERE c.workspace_id = workspace_id
  GROUP BY c.id, c.name, c.phone, c.city
  ORDER BY total_spent DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_stats TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 11. INITIAL HEARTBEAT ROWS
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.background_services (service_name, status) VALUES
  ('shipping-sync', 'idle'),
  ('push-notifications', 'idle')
ON CONFLICT (service_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- DONE. All tables, indexes, RLS, and functions are now installed.
-- ─────────────────────────────────────────────────────────────────────
