
CREATE TABLE IF NOT EXISTS public.user_badge_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  seen_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

ALTER TABLE public.user_badge_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own badge state"
  ON public.user_badge_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users upsert own badge state"
  ON public.user_badge_state FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own badge state"
  ON public.user_badge_state FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own badge state"
  ON public.user_badge_state FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
