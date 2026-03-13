import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getPublicEnv } from "./env";

/**
 * Creates a typed Supabase client for use in server components and API routes.
 * Uses the anon key with cookie-based auth via @supabase/ssr.
 * Must be called within a Next.js server context (where `cookies()` is available).
 */
export async function createServerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll can throw in Server Components when called from a read-only context.
            // This is safe to ignore if middleware is refreshing sessions.
          }
        },
      },
    }
  );
}
