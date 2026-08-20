import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { conf } from "@/setup/config";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = conf();
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = conf();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured");
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export function tryGetSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  try {
    return getSupabase();
  } catch {
    return null;
  }
}
