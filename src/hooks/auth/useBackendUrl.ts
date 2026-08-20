import { isSupabaseConfigured } from "@/backend/supabase/client";
import { conf } from "@/setup/config";
import { useAuthStore } from "@/stores/auth";

/** Returns a sync target URL. When Supabase is configured, returns a sentinel so syncers run without a movie-web backend. */
export function useBackendUrl(): string | null {
  const backendUrl = useAuthStore((s) => s.backendUrl);
  const config = conf();
  if (isSupabaseConfigured()) {
    return backendUrl ?? "supabase";
  }
  return (
    backendUrl ??
    config.BACKEND_URL ??
    (config.BACKEND_URLS.length > 0 ? config.BACKEND_URLS[0] : null)
  );
}
