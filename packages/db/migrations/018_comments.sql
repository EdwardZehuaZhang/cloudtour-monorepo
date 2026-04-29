-- 018: comments table — pinch-anchored annotations on a scene
--
-- Each comment lives at a splat-local position (matching the existing
-- waypoint / hotspot pattern). `parent_id` enables threaded replies; a
-- top-level comment has parent_id = NULL. `resolved` is a boolean flag
-- the editor can flip to hide threads from the active markers without
-- deleting them.

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  position_3d jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_scene_id_idx ON comments(scene_id);
CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON comments(parent_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Comments on published tours are publicly readable (read-only viewer mode).
CREATE POLICY "comments_select_published" ON comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      WHERE scenes.id = comments.scene_id
        AND tours.status = 'published'
    )
  );

-- Org members of any role can read comments on tours their org owns.
CREATE POLICY "comments_select_org_members" ON comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = comments.scene_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Org members (any role) can insert comments. Author must be the
-- authenticated user — no impersonation.
CREATE POLICY "comments_insert" ON comments
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = comments.scene_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Comment authors can edit their own comment body. Editors+ can also
-- toggle `resolved` on any comment in their org's tours.
CREATE POLICY "comments_update_author" ON comments
  FOR UPDATE USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "comments_update_org_resolver" ON comments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = comments.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Authors can delete their own comments. Admins/owners can delete any.
CREATE POLICY "comments_delete_author" ON comments
  FOR DELETE USING (author_id = auth.uid());

CREATE POLICY "comments_delete_org_admin" ON comments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = comments.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
