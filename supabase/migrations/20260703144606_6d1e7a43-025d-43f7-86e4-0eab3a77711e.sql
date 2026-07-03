
-- Clients directory
CREATE TABLE public.manual_risk_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_clients TO authenticated;
GRANT ALL ON public.manual_risk_clients TO service_role;
ALTER TABLE public.manual_risk_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admins manage manual_risk_clients"
  ON public.manual_risk_clients FOR ALL
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- Submissions (orders)
CREATE TABLE public.manual_risk_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  client_id uuid REFERENCES public.manual_risk_clients(id) ON DELETE SET NULL,
  submission_type text NOT NULL CHECK (submission_type IN ('single','batch')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manual_risk_submissions_client_idx ON public.manual_risk_submissions(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_submissions TO authenticated;
GRANT ALL ON public.manual_risk_submissions TO service_role;
ALTER TABLE public.manual_risk_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admins manage manual_risk_submissions"
  ON public.manual_risk_submissions FOR ALL
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- Candidates on each submission
CREATE TABLE public.manual_risk_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.manual_risk_submissions(id) ON DELETE CASCADE,
  id_number text NOT NULL,
  surname text NOT NULL,
  first_name text NOT NULL,
  id_verification_result text CHECK (id_verification_result IN ('valid','invalid','deceased','pending') OR id_verification_result IS NULL),
  id_verification_notes text,
  credit_result text CHECK (credit_result IN ('low','medium','high','very_high','pending') OR credit_result IS NULL),
  credit_notes text,
  criminal_result text CHECK (criminal_result IN ('clear','record_found','pending') OR criminal_result IS NULL),
  criminal_notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manual_risk_candidates_submission_idx ON public.manual_risk_candidates(submission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_candidates TO authenticated;
GRANT ALL ON public.manual_risk_candidates TO service_role;
ALTER TABLE public.manual_risk_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admins manage manual_risk_candidates"
  ON public.manual_risk_candidates FOR ALL
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- Global report settings (T&Cs)
CREATE TABLE public.manual_risk_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  terms_and_conditions text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_settings TO authenticated;
GRANT ALL ON public.manual_risk_settings TO service_role;
ALTER TABLE public.manual_risk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admins manage manual_risk_settings"
  ON public.manual_risk_settings FOR ALL
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

INSERT INTO public.manual_risk_settings (singleton, terms_and_conditions)
VALUES (true, 'This report is issued by PreAppliCheck. The information contained herein is confidential and intended solely for the addressee. PreAppliCheck accepts no liability for decisions taken based on the results contained in this report.')
ON CONFLICT (singleton) DO NOTHING;

-- updated_at triggers
CREATE TRIGGER manual_risk_clients_updated_at BEFORE UPDATE ON public.manual_risk_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER manual_risk_submissions_updated_at BEFORE UPDATE ON public.manual_risk_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER manual_risk_candidates_updated_at BEFORE UPDATE ON public.manual_risk_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER manual_risk_settings_updated_at BEFORE UPDATE ON public.manual_risk_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
