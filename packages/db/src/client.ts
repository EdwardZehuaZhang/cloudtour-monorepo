import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicEnv } from "./env";

/**
 * Creates a typed Supabase client for use in browser/client components.
 * Uses the anon key — safe for client-side code.
 */
export function createBrowserClient() {
  const env = getPublicEnv();
  return createSupabaseBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
