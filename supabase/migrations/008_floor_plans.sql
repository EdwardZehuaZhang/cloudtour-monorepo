-- 008: floor_plans table

CREATE TABLE IF NOT EXISTS floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  scene_positions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE floor_plans ENABLE ROW LEVEL SECURITY;

-- Floor plans of published tours are publicly readable
CREATE POLICY "floor_plans_select_published" ON floor_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tours
      WHERE tours.id = floor_plans.tour_id
        AND tours.status = 'published'
    )
  );

-- Org members can read floor plans
CREATE POLICY "floor_plans_select_org_members" ON floor_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = floor_plans.tour_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Editors, admins, owners can insert floor plans
CREATE POLICY "floor_plans_insert" ON floor_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = floor_plans.tour_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Editors, admins, owners can update floor plans
CREATE POLICY "floor_plans_update" ON floor_plans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = floor_plans.tour_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Only admins and owners can delete floor plans
CREATE POLICY "floor_plans_delete" ON floor_plans
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = floor_plans.tour_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
