-- 010: tour_views table

CREATE TABLE IF NOT EXISTS tour_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id uuid NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  viewer_ip_hash text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tour_views ENABLE ROW LEVEL SECURITY;

-- Tour views are inserted by the server (service role) on public page visits.
-- No user-facing INSERT policy needed.

-- Org members can read view analytics for their tours
CREATE POLICY "tour_views_select_org_members" ON tour_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tours
      JOIN org_members ON org_members.org_id = tours.org_id
      WHERE tours.id = tour_views.tour_id
        AND org_members.user_id = auth.uid()
    )
  );
