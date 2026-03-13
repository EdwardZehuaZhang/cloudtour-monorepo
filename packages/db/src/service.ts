import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getServerEnv } from "./env";

/**
 * ⚠️  SERVER-ONLY — DO NOT import this in client components or pages.
 *
 * Creates a Supabase client with the service role key, bypassing RLS.
 * Use ONLY for admin operations that require elevated privileges
 * (e.g., writing billing_events, tour_views, or admin data seeding).
 *
 * The SUPABASE_SERVICE_ROLE_KEY must NEVER appear in client-side code
 * or NEXT_PUBLIC_ environment variables.
 */
export function createServiceClient() {
  const env = getServerEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
