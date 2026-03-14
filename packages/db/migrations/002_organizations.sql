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

-- Org members can read their organizations
CREATE POLICY "organizations_select_members" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
    )
  );

-- Only owners can update their organization
CREATE POLICY "organizations_update_owner" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

-- Insert allowed (for auto-create personal org trigger)
CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (true);
