-- 004: tours table

CREATE TABLE IF NOT EXISTS tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  category text NOT NULL DEFAULT 'other',
  tags text[] NOT NULL DEFAULT '{}',
  location text,
  cover_image_url text,
  view_count bigint NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tours_slug_unique UNIQUE (slug),
  CONSTRAINT tours_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT tours_category_check CHECK (category IN ('real_estate', 'tourism', 'museum', 'education', 'other'))
);

ALTER TABLE tours ENABLE ROW LEVEL SECURITY;

-- Published tours are publicly readable (no JWT needed)
CREATE POLICY "tours_select_published" ON tours
  FOR SELECT USING (status = 'published');

-- Org members can read all tours in their org
CREATE POLICY "tours_select_org_members" ON tours
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = tours.org_id
        AND org_members.user_id = auth.uid()
    )
  );

-- Editors, admins, owners can insert tours
CREATE POLICY "tours_insert" ON tours
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = tours.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Editors, admins, owners can update tours
CREATE POLICY "tours_update" ON tours
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = tours.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin', 'editor')
    )
  );

-- Only admins and owners can delete tours
CREATE POLICY "tours_delete" ON tours
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = tours.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role IN ('owner', 'admin')
    )
  );
