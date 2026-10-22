CREATE TABLE public.manual_risk_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  client_id uuid REFERENCES public.manual_risk_clients(id) ON DELETE SET NULL,
  submission_type text NOT NULL DEFAULT 'single',
  submitter_name text NOT NULL,
  submitter_email text NOT NULL,
  submitter_phone text,
  consent_confirmed_at timestamptz NOT NULL DEFAULT now(),
  indemnity_files jsonb,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  processed_submission_id uuid,
  source text NOT NULL DEFAULT 'public_form',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.manual_risk_intake_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES public.manual_risk_intakes(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  surname text NOT NULL,
  id_number text NOT NULL,
  gender text,
  date_of_birth text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_risk_intake_candidates_intake_idx ON public.manual_risk_intake_candidates (intake_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_intakes TO authenticated;
GRANT ALL ON public.manual_risk_intakes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_intake_candidates TO authenticated;
GRANT ALL ON public.manual_risk_intake_candidates TO service_role;

ALTER TABLE public.manual_risk_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_risk_intake_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage manual_risk_intakes"
  ON public.manual_risk_intakes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Admins manage manual_risk_intake_candidates"
  ON public.manual_risk_intake_candidates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));

CREATE TRIGGER manual_risk_intakes_updated_at BEFORE UPDATE ON public.manual_risk_intakes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manual_risk_candidates ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.manual_risk_candidates ADD COLUMN IF NOT EXISTS date_of_birth text;

CREATE POLICY "MRA indemnities: anon intake insert" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'manual-risk-indemnities'
    AND (storage.foldername(name))[1] = 'intake'
  );