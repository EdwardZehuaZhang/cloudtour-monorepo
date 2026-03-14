import Stripe from "stripe";
import { getServerEnv } from "./env";

/**
 * Lazy-initialized Stripe client — server-only.
 * Uses STRIPE_SECRET_KEY from environment.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const env = getServerEnv();
    _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

/**
 * Stripe price IDs for each plan.
 * In production, these should come from environment variables.
 * For now, they're placeholder IDs that map to Stripe products.
 */
export const STRIPE_PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID ?? "price_pro_monthly",
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? "price_enterprise_monthly",
};
