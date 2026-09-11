ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS archive_report_files jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.manual_risk_submissions
SET archive_report_files = jsonb_build_array(
  jsonb_strip_nulls(jsonb_build_object(
    'path', archive_report_path,
    'name', COALESCE(archive_report_name, archive_report_path),
    'uploaded_at', created_at,
    'onedrive_item_id', report_onedrive_item_id,
    'shared_onedrive_item_id', report_shared_onedrive_item_id
  ))
)
WHERE archive_report_path IS NOT NULL
  AND (archive_report_files IS NULL OR jsonb_array_length(archive_report_files) = 0);