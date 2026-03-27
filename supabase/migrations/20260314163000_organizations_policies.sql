-- 0035: organizations policies that depend on org_members

CREATE POLICY "organizations_select_members" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "organizations_update_owner" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );