ALTER TABLE public.manual_risk_candidates
  ADD COLUMN IF NOT EXISTS tfs_result text,
  ADD COLUMN IF NOT EXISTS tfs_notes text,
  ADD COLUMN IF NOT EXISTS tfs_screened_at timestamptz,
  ADD COLUMN IF NOT EXISTS tfs_list_id uuid REFERENCES public.manual_risk_sanctions_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tfs_list_version text,
  ADD COLUMN IF NOT EXISTS tfs_match_basis text;

ALTER TABLE public.manual_risk_sanctions_matches
  ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES public.manual_risk_submissions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS list_version text,
  ADD COLUMN IF NOT EXISTS matched_via text;

INSERT INTO public.manual_risk_pricing (item_key, label, supplier_cost, client_price)
SELECT 'tfs', 'TFS Check (UN Sanctions Screening)', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.manual_risk_pricing WHERE item_key = 'tfs');