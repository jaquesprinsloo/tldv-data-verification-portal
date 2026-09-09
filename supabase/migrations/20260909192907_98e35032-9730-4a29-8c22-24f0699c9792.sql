ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS is_archive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archive_batch_label text,
  ADD COLUMN IF NOT EXISTS archive_report_path text,
  ADD COLUMN IF NOT EXISTS archive_report_name text;

CREATE INDEX IF NOT EXISTS manual_risk_submissions_is_archive_idx
  ON public.manual_risk_submissions (is_archive);