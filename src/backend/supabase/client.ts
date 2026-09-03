import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { conf } from "@/setup/config";

let client: SupabaseClient | null = null;

/** After a Fair Use 402, pause client calls so we don't keep burning retries. */
const RESTRICTED_COOLDOWN_MS = 6 * 60 * 60 * 1000;
let restrictedUntil = 0;

export class SupabaseRestrictedError extends Error {
  constructor() {
    super("Supabase API restricted (HTTP 402 Fair Use)");
    this.name = "SupabaseRestrictedError";
  }
}

export function isSupabaseApiRestricted(): boolean {
  return Date.now() < restrictedUntil;
}

export function markSupabaseApiRestricted(
  cooldownMs: number = RESTRICTED_COOLDOWN_MS,
): void {
  restrictedUntil = Math.max(restrictedUntil, Date.now() + cooldownMs);
}

/** Test helper — clear the 402 cooldown. */
export function clearSupabaseApiRestrictionForTests(): void {
  restrictedUntil = 0;
}

export function isSupabaseConfigured(): boolean {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = conf();
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function gatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isSupabaseApiRestricted()) {
    throw new SupabaseRestrictedError();
  }
  const res = await fetch(input, init);
  if (res.status === 402) {
    markSupabaseApiRestricted();
  }
  return res;
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
    global: {
      fetch: gatedFetch,
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
