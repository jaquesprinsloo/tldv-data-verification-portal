
ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_file_path text;

CREATE INDEX IF NOT EXISTS manual_risk_submissions_sent_idx
  ON public.manual_risk_submissions (client_id, sent_at)
  WHERE sent_at IS NOT NULL;
