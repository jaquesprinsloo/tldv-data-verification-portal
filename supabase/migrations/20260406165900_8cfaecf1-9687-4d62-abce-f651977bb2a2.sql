-- Allow examiners to insert pending polygraph uploads (for report submission)
CREATE POLICY "Examiners can insert pending uploads"
ON public.pending_polygraph_uploads
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'examiner'::app_role)
);

-- Allow examiners to view their own uploads
CREATE POLICY "Examiners can view own pending uploads"
ON public.pending_polygraph_uploads
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'examiner'::app_role) AND uploaded_by = auth.uid()
);