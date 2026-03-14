-- 014: Add invite_token column to org_members for invite flow

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS invite_token uuid DEFAULT gen_random_uuid();

-- Allow unauthenticated users to read their own invite by token (for accept flow)
CREATE POLICY "org_members_select_by_invite_token" ON org_members
  FOR SELECT USING (
    invite_token IS NOT NULL
    AND user_id IS NULL
  );

-- Allow authenticated users to update their own invite (accept flow)
CREATE POLICY "org_members_update_accept_invite" ON org_members
  FOR UPDATE USING (
    user_id IS NULL
    AND invite_token IS NOT NULL
  )
  WITH CHECK (
    user_id = auth.uid()
  );
