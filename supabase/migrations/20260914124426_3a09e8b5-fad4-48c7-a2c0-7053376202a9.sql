CREATE TABLE IF NOT EXISTS public.client_facing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  user_name text,
  event_type text NOT NULL,
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_facing_audit_log TO authenticated;
GRANT ALL ON public.client_facing_audit_log TO service_role;

ALTER TABLE public.client_facing_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cfal insert own" ON public.client_facing_audit_log;
CREATE POLICY "cfal insert own" ON public.client_facing_audit_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cfal read own or admin" ON public.client_facing_audit_log;
CREATE POLICY "cfal read own or admin" ON public.client_facing_audit_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'master_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE INDEX IF NOT EXISTS cfal_user_idx ON public.client_facing_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cfal_created_idx ON public.client_facing_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS cfal_event_idx ON public.client_facing_audit_log(event_type);