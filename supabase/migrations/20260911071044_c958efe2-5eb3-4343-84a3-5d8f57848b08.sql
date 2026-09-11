ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS report_matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_matched_file text;

CREATE TABLE IF NOT EXISTS public.manual_risk_report_unmatched_names (
  id uuid primary key default gen_random_uuid(),
  report_file_name text not null,
  report_date date,
  store_label text,
  linked_submission_id uuid references public.manual_risk_submissions(id) on delete set null,
  first_names text,
  surname text,
  full_name text not null,
  id_prefix text,
  raw jsonb,
  status text not null default 'open',
  notes text,
  resolved_candidate_id uuid references public.manual_risk_candidates(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  created_at timestamptz not null default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mr_unmatched_names_uniq
  ON public.manual_risk_report_unmatched_names (lower(full_name), coalesce(id_prefix,''), lower(report_file_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_report_unmatched_names TO authenticated;
GRANT ALL ON public.manual_risk_report_unmatched_names TO service_role;

ALTER TABLE public.manual_risk_report_unmatched_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins manage unmatched report names"
  ON public.manual_risk_report_unmatched_names FOR ALL
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));