CREATE POLICY "Examiners can view assigned candidate risk assessments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'employee-documents'
  AND has_role(auth.uid(), 'examiner'::app_role)
  AND EXISTS (
    SELECT 1
    FROM polygraph_appointment_candidates pac
    JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
    JOIN candex_risk_request_candidates rrc ON rrc.application_id = pac.application_id
    WHERE pa.assigned_examiner_user_id = auth.uid()
      AND POSITION(rrc.id::text IN objects.name) > 0
  )
);