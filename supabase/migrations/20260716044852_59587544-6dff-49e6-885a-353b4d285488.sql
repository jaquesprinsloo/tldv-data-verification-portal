
ALTER TABLE public.manual_risk_clients
  ADD COLUMN IF NOT EXISTS is_regular boolean NOT NULL DEFAULT false;

ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS is_tldv_internal boolean NOT NULL DEFAULT false;

ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS override_client_id uuid NULL
    REFERENCES public.manual_risk_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manual_risk_candidates_override_client_id
  ON public.manual_risk_candidates(override_client_id);
