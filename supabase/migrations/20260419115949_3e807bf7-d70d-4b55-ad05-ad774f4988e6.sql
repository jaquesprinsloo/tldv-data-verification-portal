ALTER TABLE public.pending_polygraph_uploads
  ADD COLUMN IF NOT EXISTS onedrive_recordings jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.polygraph_reports
  ADD COLUMN IF NOT EXISTS onedrive_recordings jsonb NOT NULL DEFAULT '[]'::jsonb;