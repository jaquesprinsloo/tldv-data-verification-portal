-- Allow examiners to view candex_applications for candidates in their assigned appointments
CREATE POLICY "Examiners can view assigned candidate applications"
ON public.candex_applications
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'examiner'::app_role)
  AND id IN (
    SELECT pac.application_id
    FROM polygraph_appointment_candidates pac
    JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
    WHERE pa.assigned_examiner_user_id = auth.uid()
  )
);

-- Allow examiners to view risk request candidates for their assigned appointments
CREATE POLICY "Examiners can view assigned risk request candidates"
ON public.candex_risk_request_candidates
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'examiner'::app_role)
  AND application_id IN (
    SELECT pac.application_id
    FROM polygraph_appointment_candidates pac
    JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
    WHERE pa.assigned_examiner_user_id = auth.uid()
  )
);