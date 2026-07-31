CREATE TABLE public.manual_risk_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.manual_risk_clients(id) ON DELETE CASCADE,
  name text,
  email text NOT NULL,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX manual_risk_contacts_client_email_idx
  ON public.manual_risk_contacts (client_id, lower(email));
CREATE INDEX manual_risk_contacts_client_idx ON public.manual_risk_contacts (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_contacts TO authenticated;
GRANT ALL ON public.manual_risk_contacts TO service_role;

ALTER TABLE public.manual_risk_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins manage manual_risk_contacts"
  ON public.manual_risk_contacts FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));

CREATE TRIGGER manual_risk_contacts_updated_at
  BEFORE UPDATE ON public.manual_risk_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS recipients jsonb NOT NULL DEFAULT '[]'::jsonb;