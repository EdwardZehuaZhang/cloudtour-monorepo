-- 002: organizations table

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  plan text NOT NULL DEFAULT 'free',
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_unique UNIQUE (slug),
  CONSTRAINT organizations_plan_check CHECK (plan IN ('free', 'pro', 'enterprise'))
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Insert allowed (for auto-create personal org trigger)
CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (true);
