import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().default(3001),
  STRIPE_PRO_PRICE_ID: z.string().default("price_pro_monthly"),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().default("price_enterprise_monthly"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Missing or invalid environment variables:\n${errors}\n\nSee .env.example`);
  }
  cached = result.data;
  return cached;
}
