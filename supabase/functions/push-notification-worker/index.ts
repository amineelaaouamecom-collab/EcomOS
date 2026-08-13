import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7"; // Using npm module in Deno via esm.sh/npm specifier

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;

// Configure Web Push with VAPID keys
if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(
        "mailto:support@ecomos.app",
        VAPID_PUBLIC,
        VAPID_PRIVATE
    );
}

serve(async (req) => {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    try {
        const payload = await req.json();
        const { workspace_id, event_type, title, body, entity_id } = payload;

        if (!workspace_id || !event_type || !title || !body) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Get enabled notification preferences for this event type
        const prefFieldMap: Record<string, string> = {
            NEW_ORDER: "notify_new_order",
            CONFIRMED: "notify_confirmed",
            PAS_DE_REPONSE: "notify_no_answer",
            CANCELLED: "notify_cancelled",
            IN_TRANSIT: "notify_in_transit",
            OUT_FOR_DELIVERY: "notify_out_for_delivery",
            DELIVERED: "notify_delivered",
            REFUSED: "notify_refused",
            RETURNED: "notify_returned",
            INTEGRATION_ERROR: "notify_integration_error",
        };

        const prefField = prefFieldMap[event_type];
        if (!prefField) {
            console.log(`Unmapped event_type: ${event_type}`);
            return new Response(JSON.stringify({ error: "Unmapped event type" }), { status: 400 });
        }

        const { data: preferences, error: prefError } = await supabase
            .from("notification_preferences")
            .select("user_id")
            .eq("workspace_id", workspace_id)
            .eq("enabled", true)
            .eq(prefField, true);

        if (prefError || !preferences || preferences.length === 0) {
            return new Response(JSON.stringify({ status: "No users prefer this notification" }));
        }

        const userIds = preferences.map((p) => p.user_id);

        // 2. Fetch active subscriptions for these users
        const { data: subscriptions, error: subError } = await supabase
            .from("push_subscriptions")
            .select("id, user_id, endpoint, p256dh, auth")
            .eq("workspace_id", workspace_id)
            .eq("enabled", true)
            .in("user_id", userIds);

        if (subError || !subscriptions || subscriptions.length === 0) {
            return new Response(JSON.stringify({ status: "No active push subscriptions" }));
        }

        // 3. Insert notification into DB for in-app bell
        const deduplication_key = `${workspace_id}_${entity_id}_${event_type}`;
        const { error: insertError } = await supabase.from("notifications").insert({
            workspace_id,
            entity_id,
            title,
            body,
            event_type,
            deduplication_key,
        });

        if (insertError?.code === "23505") {
            // Duplicate key - we already sent this event notification once!
            return new Response(JSON.stringify({ status: "Notification deduplicated" }));
        }

        // 4. Send Web Push
        const notificationPayload = JSON.stringify({
            title,
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            data: {
                entity_id,
                event_type,
                workspace_id,
                url: `/orders?order=${entity_id}`,
            },
        });

        const sendPromises = subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
            };

            try {
                await webpush.sendNotification(pushSubscription, notificationPayload);
            } catch (err: any) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription has expired or is no longer valid, remove it
                    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
                } else {
                    console.error("Push Error:", err);
                }
            }
        });

        await Promise.all(sendPromises);

        return new Response(JSON.stringify({ status: "Success", sent: subscriptions.length }));
    } catch (error: any) {
        console.error("Worker error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
