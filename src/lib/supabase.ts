import { createClient } from "@supabase/supabase-js";

// IMPORTANT: only the PUBLISHABLE key belongs here. It is safe to ship to the
// browser because Row Level Security (RLS) policies on every table decide
// what an authenticated user is actually allowed to read/write.
// The SERVICE_ROLE key and all OAuth client secrets must never be imported
// into this file or anything under src/ — they only live in Supabase Edge
// Function secrets (see supabase/functions/*).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;
