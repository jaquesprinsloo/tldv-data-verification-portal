CREATE POLICY "MRA indemnities: authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manual-risk-indemnities');

CREATE POLICY "MRA indemnities: authenticated insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manual-risk-indemnities');

CREATE POLICY "MRA indemnities: authenticated update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manual-risk-indemnities')
  WITH CHECK (bucket_id = 'manual-risk-indemnities');

CREATE POLICY "MRA indemnities: authenticated delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manual-risk-indemnities');