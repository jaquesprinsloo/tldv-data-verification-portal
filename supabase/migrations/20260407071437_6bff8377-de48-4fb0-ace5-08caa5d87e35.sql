-- Allow examiners to read files from employee-documents bucket (for risk assessment PDFs)
CREATE POLICY "Examiners can view assigned candidate documents"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND has_role(auth.uid(), 'examiner'::app_role)
);