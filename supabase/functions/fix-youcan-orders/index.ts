// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("[fix-youcan-orders] Starting execution");
    const { workspace_id } = await req.json();
    console.log("[fix-youcan-orders] workspace_id:", workspace_id);

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get YouCan tokens from workspaces table
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("youcan_access_token, youcan_refresh_token, youcan_token_expires_at")
      .eq("id", workspace_id)
      .single();

    console.log("[fix-youcan-orders] Workspace query result:", { wsError, hasWorkspace: !!workspace, hasToken: !!workspace?.youcan_access_token });

    if (wsError || !workspace || !workspace.youcan_access_token) {
      console.error("[fix-youcan-orders] YouCan integration not found:", wsError);
      return new Response(
        JSON.stringify({ error: "YouCan integration not found for this workspace" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = workspace.youcan_access_token;
    let refreshToken = workspace.youcan_refresh_token;

    // Refresh token if expired - only if env vars are available
    const clientId = Deno.env.get("YOUCAN_CLIENT_ID");
    const clientSecret = Deno.env.get("YOUCAN_CLIENT_SECRET");

    if (workspace.youcan_token_expires_at && new Date(workspace.youcan_token_expires_at) < new Date()) {
      console.log("[fix-youcan-orders] Token expired, attempting refresh");
      if (!clientId || !clientSecret) {
        console.error("[fix-youcan-orders] Cannot refresh token: YOUCAN_CLIENT_ID or YOUCAN_CLIENT_SECRET not set");
        return new Response(
          JSON.stringify({ error: "Token expired but refresh credentials not configured" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshRes = await fetch("https://api.youcan.shop/auth/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      console.log("[fix-youcan-orders] Token refresh status:", refreshRes.status);

      if (!refreshRes.ok) {
        console.error("[fix-youcan-orders] Token refresh failed:", refreshRes.status);
        return new Response(
          JSON.stringify({ error: "Failed to refresh token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      refreshToken = refreshData.refresh_token;

      // Update tokens in DB
      await supabase
        .from("workspaces")
        .update({
          youcan_access_token: accessToken,
          youcan_refresh_token: refreshToken,
          youcan_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        })
        .eq("id", workspace_id);

      console.log("[fix-youcan-orders] Token refreshed successfully");
    }

    // Get orders to fix
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("order_number, youcan_order_id")
      .eq("source", "youcan")
      .is("customer_name", null)
      .not("phone", "is", null);

    console.log("[fix-youcan-orders] Orders query result:", { ordersError, orderCount: orders?.length || 0 });

    if (ordersError || !orders || orders.length === 0) {
      console.log("[fix-youcan-orders] No orders to fix");
      return new Response(
        JSON.stringify({ message: "No orders to fix" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[fix-youcan-orders] Processing", orders.length, "orders");
    const results = [];

    // Collect all target order IDs to search for
    const targetOrderIds = new Map<string, any>(); // youcan_order_id -> order object
    for (const order of orders) {
      targetOrderIds.set(order.youcan_order_id, order);
    }

    console.log("[fix-youcan-orders] Target order IDs to search:", Array.from(targetOrderIds.keys()));
    console.log("[fix-youcan-orders] Token preview (first 50 chars):", accessToken?.substring(0, 50) || "no token");
    console.log("[fix-youcan-orders] Token length:", accessToken?.length || 0);

    // Paginate through all pages to find the target orders
    let page = 1;
    let totalPages = 1;
    let foundOrders = new Map<string, any>(); // youcan_order_id -> youcanOrder data

    do {
      console.log(`[fix-youcan-orders] Fetching page ${page}...`);
      const pageRes = await fetch(
        `https://api.youcan.shop/orders?page=${page}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!pageRes.ok) {
        console.error(`[fix-youcan-orders] Failed to fetch page ${page}:`, pageRes.status);
        break;
      }

      const pageData = await pageRes.json();
      const pageOrders = pageData.data || pageData.orders || [];
      totalPages = pageData.meta?.last_page || pageData.last_page || 1;

      console.log(`[fix-youcan-orders] Page ${page} received: ${pageOrders.length} orders, total pages: ${totalPages}`);
      
      // Detailed logging for page 1 to understand response structure
      if (page === 1) {
        console.log("[fix-youcan-orders] Page 1 response structure:", JSON.stringify(Object.keys(pageData)));
        console.log("[fix-youcan-orders] Page 1 order count:", pageData.data?.length || pageData.orders?.length || 'unknown');
        console.log("[fix-youcan-orders] Page 1 raw response (first 500 chars):", JSON.stringify(pageData).substring(0, 500));
      }

      // Check if any target orders are in this page
      for (const youcanOrder of pageOrders) {
        if (targetOrderIds.has(youcanOrder.id)) {
          console.log(`[fix-youcan-orders] Found order ${youcanOrder.id} on page ${page}`);
          foundOrders.set(youcanOrder.id, youcanOrder);
          targetOrderIds.delete(youcanOrder.id);
        }
      }

      page++;

      // Stop if we found all orders or reached max pages (safety limit)
      if (targetOrderIds.size === 0 || page > 50) {
        break;
      }
    } while (page <= totalPages);

    console.log(`[fix-youcan-orders] Searched ${page - 1} pages, found ${foundOrders.size}/${orders.length} orders`);

    // Process the found orders
    for (const order of orders) {
      try {
        const youcanOrder = foundOrders.get(order.youcan_order_id);

        if (!youcanOrder) {
          console.error("[fix-youcan-orders] Order not found after pagination:", order.youcan_order_id);
          results.push({
            order_number: order.order_number,
            error: `Order not found in YouCan after searching ${page - 1} pages`,
          });
          continue;
        }

        console.log("[fix-youcan-orders] YouCan order data received:", JSON.stringify(youcanOrder.customer));

        // Apply same mapping as webhook
        const customer = youcanOrder.customer || {};
        const customerName = customer.full_name?.trim() ||
          [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() ||
          null;

        const addr = customer.address?.[0];
        const addressParts = [
          addr?.first_line && typeof addr.first_line === 'string' ? addr.first_line.trim() : null,
          addr?.second_line && typeof addr.second_line === 'string' ? addr.second_line.trim() : null,
        ].filter(Boolean);
        const address = addressParts.length > 0 ? addressParts.join(', ') : null;

        console.log("[fix-youcan-orders] Mapped values:", { customerName, address });

        // Update order in DB
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            customer_name: customerName,
            address: address,
          })
          .eq("order_number", order.order_number);

        if (updateError) {
          console.error("[fix-youcan-orders] Failed to update DB:", order.order_number, updateError);
          results.push({
            order_number: order.order_number,
            error: `Failed to update DB: ${updateError.message}`,
          });
        } else {
          console.log("[fix-youcan-orders] Successfully updated:", order.order_number);
          results.push({
            order_number: order.order_number,
            success: true,
            customer_name: customerName,
            address: address,
          });
        }
      } catch (err) {
        console.error("[fix-youcan-orders] Error processing order:", order.order_number, err);
        results.push({
          order_number: order.order_number,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log("[fix-youcan-orders] Complete. Results:", JSON.stringify(results));
    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fix-youcan-orders] UNHANDLED ERROR:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
