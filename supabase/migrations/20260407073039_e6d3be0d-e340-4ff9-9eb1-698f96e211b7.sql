-- Allow examiners to upload to polygraph-reports storage bucket
CREATE POLICY "Examiners can upload polygraph reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'polygraph-reports'
  AND has_role(auth.uid(), 'examiner'::app_role)
);

-- Allow examiners to view their own uploads in polygraph-reports
CREATE POLICY "Examiners can view polygraph reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'polygraph-reports'
  AND has_role(auth.uid(), 'examiner'::app_role)
);