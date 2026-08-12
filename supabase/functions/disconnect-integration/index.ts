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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { provider } = await req.json();
    if (!provider) throw new Error("Missing provider");

    const authHeader = req.headers.get("authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) throw new Error("Not authenticated");

    if (provider === "youcan") {
      // Get workspace_id for the user
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.workspace_id) {
        throw new Error("Could not find workspace for user");
      }

      // Delete YouCan credentials and tokens for this workspace
      await supabase
        .from("youcan_credentials")
        .delete()
        .eq("workspace_id", profile.workspace_id);

      await supabase
        .from("youcan_tokens")
        .delete()
        .eq("workspace_id", profile.workspace_id);
    } else {
      // Original behavior for other providers
      await supabase
        .from("integrations")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
