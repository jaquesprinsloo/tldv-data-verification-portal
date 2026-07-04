
ALTER TABLE public.manual_risk_submissions
  ADD COLUMN IF NOT EXISTS supplier_report_files jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE POLICY "MRA supplier: auth read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manual-risk-supplier-reports');

CREATE POLICY "MRA supplier: auth insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manual-risk-supplier-reports');

CREATE POLICY "MRA supplier: auth update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manual-risk-supplier-reports')
  WITH CHECK (bucket_id = 'manual-risk-supplier-reports');

CREATE POLICY "MRA supplier: auth delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manual-risk-supplier-reports');
