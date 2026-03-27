-- 015: Add Stripe billing columns to organizations

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
