-- 009: billing_events table

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_events_stripe_event_id_unique UNIQUE (stripe_event_id)
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Only org owners can read billing events
CREATE POLICY "billing_events_select_owner" ON billing_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = billing_events.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

-- Billing events are inserted by the server (service role), not by users directly.
-- No INSERT policy needed for anon/authenticated — webhooks use service role key.
