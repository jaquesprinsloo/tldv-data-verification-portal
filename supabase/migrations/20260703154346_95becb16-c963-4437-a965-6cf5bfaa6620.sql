
ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS requested_checks text[] NOT NULL DEFAULT ARRAY['id_verification','credit','criminal']::text[];

ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS risk_assessment_result text,
  ADD COLUMN IF NOT EXISTS risk_assessment_notes text,
  ADD COLUMN IF NOT EXISTS drivers_license_result text,
  ADD COLUMN IF NOT EXISTS drivers_license_notes text,
  ADD COLUMN IF NOT EXISTS pdp_result text,
  ADD COLUMN IF NOT EXISTS pdp_notes text,
  ADD COLUMN IF NOT EXISTS qualification_result text,
  ADD COLUMN IF NOT EXISTS qualification_notes text;
