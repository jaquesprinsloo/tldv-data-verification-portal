-- Add per-check tracking to risk requests and candidate rows
ALTER TABLE public.candex_risk_requests
  ADD COLUMN IF NOT EXISTS requested_checks jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.candex_risk_request_candidates
  ADD COLUMN IF NOT EXISTS check_results jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.candex_risk_requests.requested_checks IS
  'Array of check keys requested for this batch. Allowed values: id_verification, pre_crim, credit, pdp, drivers_license, tertiary, matric';

COMMENT ON COLUMN public.candex_risk_request_candidates.check_results IS
  'Per-check outcomes keyed by check key. Shape: { check_key: { status: "pending"|"clear"|"flagged", url?: string, notes?: string, processed_at?: timestamp } }';