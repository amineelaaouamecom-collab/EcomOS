-- ============================================================
-- ECOM OS — Push Notifications Schema
-- ============================================================

-- 1. Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    enabled BOOLEAN DEFAULT TRUE,
    UNIQUE (user_id, endpoint)
);

-- RLS for push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push subscriptions"
ON public.push_subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push subscriptions"
ON public.push_subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
ON public.push_subscriptions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
ON public.push_subscriptions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 2. Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

-- RLS for notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Notifications/Events Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entity_id UUID, -- References order_id or external ID
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    event_type TEXT NOT NULL, -- e.g., 'IN_TRANSIT', 'DELIVERED', 'NEW_ORDER'
    action_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deduplication_key TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx ON public.notifications (workspace_id, deduplication_key) WHERE deduplication_key IS NOT NULL;

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_users 
        WHERE workspace_users.workspace_id = notifications.workspace_id 
        AND workspace_users.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their workspace notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.workspace_users 
        WHERE workspace_users.workspace_id = notifications.workspace_id 
        AND workspace_users.user_id = auth.uid()
    )
);
