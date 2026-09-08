ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS report_shared_onedrive_web_url text,
  ADD COLUMN IF NOT EXISTS report_shared_onedrive_item_id text,
  ADD COLUMN IF NOT EXISTS report_shared_onedrive_path text;