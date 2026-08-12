import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc("exec_sql", { query: "SELECT 1" });
  console.log("RPC exec_sql:", { data, error });
  
  // Alternatively, let's see if coliaty_public_key already exists by selecting it
  const { data: d2, error: e2 } = await supabase.from("workspaces").select("coliaty_public_key").limit(1);
  console.log("Check columns:", { data: d2, error: e2 });
}
check();
