-- 005: scenes table

CREATE TABLE IF NOT EXISTS scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  splat_url text,
  splat_file_format text,
  thumbnail_url text,
  default_camera_position jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenes_splat_file_format_check CHECK (
    splat_file_format IS NULL OR splat_file_format IN ('ply', 'splat', 'spz')
  )
);

ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

-- Scenes of published tours are publicly readable
CREATE POLICY "scenes_select_published" ON scenes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tours
      WHERE tours.id = scenes.tour_id
        AND tours.status = 'published'
    )
  );

-- Org members can read scenes of their org's tours
CREATE POLICY "scenes_select_org_members" ON scenes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = scenes.tour_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Editors, admins, owners can insert scenes
CREATE POLICY "scenes_insert" ON scenes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = scenes.tour_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Editors, admins, owners can update scenes
CREATE POLICY "scenes_update" ON scenes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = scenes.tour_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Only admins and owners can delete scenes
CREATE POLICY "scenes_delete" ON scenes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = scenes.tour_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
