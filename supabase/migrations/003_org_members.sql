-- 003: org_members table

CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text,
  role text NOT NULL DEFAULT 'viewer',
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_members_role_check CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members in their org
CREATE POLICY "org_members_select" ON org_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
    )
  );

-- Owners and admins can insert members (invite)
CREATE POLICY "org_members_insert" ON org_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can update members (role changes)
CREATE POLICY "org_members_update" ON org_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Owners and admins can delete members
CREATE POLICY "org_members_delete" ON org_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
