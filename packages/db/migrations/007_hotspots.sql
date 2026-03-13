-- 007: hotspots table

CREATE TABLE IF NOT EXISTS hotspots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_type text NOT NULL DEFAULT 'text',
  content_markdown text,
  media_url text,
  icon text,
  position_3d jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotspots_content_type_check CHECK (
    content_type IN ('text', 'image', 'video', 'audio', 'link')
  )
);

ALTER TABLE hotspots ENABLE ROW LEVEL SECURITY;

-- Hotspots of published tours are publicly readable
CREATE POLICY "hotspots_select_published" ON hotspots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      WHERE scenes.id = hotspots.scene_id
        AND tours.status = 'published'
    )
  );

-- Org members can read hotspots
CREATE POLICY "hotspots_select_org_members" ON hotspots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = hotspots.scene_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Editors, admins, owners can insert hotspots
CREATE POLICY "hotspots_insert" ON hotspots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = hotspots.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Editors, admins, owners can update hotspots
CREATE POLICY "hotspots_update" ON hotspots
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = hotspots.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Only admins and owners can delete hotspots
CREATE POLICY "hotspots_delete" ON hotspots
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM scenes
      JOIN tours ON tours.id = scenes.tour_id
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE scenes.id = hotspots.scene_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
