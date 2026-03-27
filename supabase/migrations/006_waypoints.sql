-- 006: waypoints table

CREATE TABLE IF NOT EXISTS waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  target_scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  label text NOT NULL,
  icon text,
  position_3d jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;

-- Waypoints of published tours are publicly readable
CREATE POLICY "waypoints_select_published" ON waypoints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      WHERE scenes.id = waypoints.scene_id
        AND tours.status = 'published'
    )
  );

-- Org members can read waypoints
CREATE POLICY "waypoints_select_org_members" ON waypoints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = waypoints.scene_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Editors, admins, owners can insert waypoints
CREATE POLICY "waypoints_insert" ON waypoints
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = waypoints.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Editors, admins, owners can update waypoints
CREATE POLICY "waypoints_update" ON waypoints
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = waypoints.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Only admins and owners can delete waypoints
CREATE POLICY "waypoints_delete" ON waypoints
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = waypoints.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
