ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS id_verification_data jsonb;