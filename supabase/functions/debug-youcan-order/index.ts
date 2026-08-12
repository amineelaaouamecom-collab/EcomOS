// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { workspace_id, youcan_order_id } = await req.json();
    if (!workspace_id) throw new Error("workspace_id is required");
    if (!youcan_order_id) throw new Error("youcan_order_id is required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load workspace tokens
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select(
        "youcan_access_token, youcan_refresh_token, youcan_token_expires_at"
      )
      .eq("id", workspace_id)
      .single();

    if (wsError || !workspace) throw new Error("Workspace not found");
    if (!workspace.youcan_access_token) {
      throw new Error("YouCan not connected");
    }

    // Fetch single order from YouCan API
    const res = await fetch(`https://api.youcan.shop/orders/${youcan_order_id}`, {
      headers: {
        Authorization: `Bearer ${workspace.youcan_access_token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouCan API error (${res.status}): ${text}`);
    }

    const orderData = await res.json();

    // Extract customer name from the payload
    const customerName = orderData.data?.customer?.name || orderData.data?.billing?.name || null;

    return new Response(JSON.stringify({
      success: true,
      youcan_order_id,
      customer_name: customerName,
      raw_payload: orderData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[Debug YouCan Order] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
