import { z } from "zod";

/**
 * Public environment variables — safe for client-side use.
 * These are validated on both client and server.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

/**
 * Server-only environment variables — NEVER expose to client bundle.
 * Validated only on the server (extends public schema).
 */
const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatErrors(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
}

let cachedPublicEnv: PublicEnv | undefined;
let cachedServerEnv: ServerEnv | undefined;

/**
 * Validates and returns public (client-safe) environment variables.
 * Throws with a clear error message if any are missing or invalid.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!result.success) {
    throw new Error(
      `Missing or invalid public environment variables:\n${formatErrors(result.error.issues)}\n\nSee .env.local.example for required variables.`
    );
  }

  cachedPublicEnv = result.data;
  return cachedPublicEnv;
}

/**
 * Validates and returns all environment variables (public + server-only).
 * Must only be called on the server — throws with a clear error message if any are missing.
 *
 * WARNING: SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * and RESEND_API_KEY must NEVER be exposed to client code or NEXT_PUBLIC_ env vars.
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const result = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  });

  if (!result.success) {
    throw new Error(
      `Missing or invalid server environment variables:\n${formatErrors(result.error.issues)}\n\nSee .env.local.example for required variables.`
    );
  }

  cachedServerEnv = result.data;
  return cachedServerEnv;
}
