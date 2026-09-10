-- 1. Order-level evidence dates
ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS sent_to_supplier_at timestamptz,
  ADD COLUMN IF NOT EXISTS compliance_flag text,
  ADD COLUMN IF NOT EXISTS compliance_flag_at timestamptz,
  ADD COLUMN IF NOT EXISTS compliance_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS compliance_reviewed_at timestamptz;

-- 2. Extraction attribution on each candidate
ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS outcome_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_extracted_by uuid,
  ADD COLUMN IF NOT EXISTS outcome_extracted_by_name text,
  ADD COLUMN IF NOT EXISTS outcome_extracted_source text;

-- 3. Change trail on risk-assessment records (reuses existing audit_log + trigger fn)
DROP TRIGGER IF EXISTS mr_submissions_audit ON public.manual_risk_submissions;
CREATE TRIGGER mr_submissions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.manual_risk_submissions
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();

DROP TRIGGER IF EXISTS mr_candidates_audit ON public.manual_risk_candidates;
CREATE TRIGGER mr_candidates_audit
AFTER INSERT OR UPDATE OR DELETE ON public.manual_risk_candidates
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();

-- 4. Who looked at what (documents / reports)
CREATE TABLE IF NOT EXISTS public.manual_risk_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  submission_id uuid REFERENCES public.manual_risk_submissions(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES public.manual_risk_candidates(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.manual_risk_access_log TO authenticated;
GRANT ALL ON public.manual_risk_access_log TO service_role;
ALTER TABLE public.manual_risk_access_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mral insert own" ON public.manual_risk_access_log;
CREATE POLICY "mral insert own" ON public.manual_risk_access_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "mral admin read" ON public.manual_risk_access_log;
CREATE POLICY "mral admin read" ON public.manual_risk_access_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  );
CREATE INDEX IF NOT EXISTS mral_submission_idx ON public.manual_risk_access_log(submission_id);
CREATE INDEX IF NOT EXISTS mral_created_idx ON public.manual_risk_access_log(created_at DESC);

-- 5. Sanctions list snapshots
CREATE TABLE IF NOT EXISTS public.manual_risk_sanctions_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_name text NOT NULL,
  source text NOT NULL DEFAULT 'UN Security Council Consolidated List',
  version_label text,
  file_name text,
  individual_count integer NOT NULL DEFAULT 0,
  entity_count integer NOT NULL DEFAULT 0,
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_sanctions_lists TO authenticated;
GRANT ALL ON public.manual_risk_sanctions_lists TO service_role;
ALTER TABLE public.manual_risk_sanctions_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mrsl admin all" ON public.manual_risk_sanctions_lists;
CREATE POLICY "mrsl admin all" ON public.manual_risk_sanctions_lists
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  );

CREATE TABLE IF NOT EXISTS public.manual_risk_sanctions_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.manual_risk_sanctions_lists(id) ON DELETE CASCADE,
  entry_type text NOT NULL DEFAULT 'individual',
  reference_number text,
  full_name text NOT NULL,
  normalized_name text NOT NULL,
  aliases text,
  date_of_birth text,
  nationality text,
  listed_on text,
  documents text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_sanctions_entries TO authenticated;
GRANT ALL ON public.manual_risk_sanctions_entries TO service_role;
ALTER TABLE public.manual_risk_sanctions_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mrse admin all" ON public.manual_risk_sanctions_entries;
CREATE POLICY "mrse admin all" ON public.manual_risk_sanctions_entries
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  );
CREATE INDEX IF NOT EXISTS mrse_list_idx ON public.manual_risk_sanctions_entries(list_id);
CREATE INDEX IF NOT EXISTS mrse_norm_idx ON public.manual_risk_sanctions_entries(normalized_name);

CREATE TABLE IF NOT EXISTS public.manual_risk_sanctions_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.manual_risk_sanctions_lists(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.manual_risk_sanctions_entries(id) ON DELETE SET NULL,
  candidate_id uuid REFERENCES public.manual_risk_candidates(id) ON DELETE CASCADE,
  candidate_name text,
  candidate_id_number text,
  matched_name text,
  match_reason text,
  score numeric,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_sanctions_matches TO authenticated;
GRANT ALL ON public.manual_risk_sanctions_matches TO service_role;
ALTER TABLE public.manual_risk_sanctions_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mrsm admin all" ON public.manual_risk_sanctions_matches;
CREATE POLICY "mrsm admin all" ON public.manual_risk_sanctions_matches
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')
  );
CREATE INDEX IF NOT EXISTS mrsm_status_idx ON public.manual_risk_sanctions_matches(status);