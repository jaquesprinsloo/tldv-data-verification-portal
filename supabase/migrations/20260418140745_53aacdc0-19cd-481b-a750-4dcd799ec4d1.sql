-- Allow admins to delete their own applications
CREATE POLICY "Admins can delete own candex applications"
ON public.candex_applications FOR DELETE
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.candex_clients c
      WHERE c.id = candex_applications.client_id
        AND c.created_by = auth.uid()
    )
  )
);

-- Allow admins to delete risk request candidates for their requests
CREATE POLICY "Admins can delete own risk request candidates"
ON public.candex_risk_request_candidates FOR DELETE
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.candex_risk_requests r
    WHERE r.id = candex_risk_request_candidates.request_id
      AND r.requested_by = auth.uid()
  )
);

-- Allow admins to delete their own polygraph appointments
CREATE POLICY "Admins can delete own polygraph appointments"
ON public.polygraph_appointments FOR DELETE
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR requested_by = auth.uid()
);

-- Allow admins to delete appointment candidates for their appointments
CREATE POLICY "Admins can delete own appointment candidates"
ON public.polygraph_appointment_candidates FOR DELETE
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.polygraph_appointments pa
    WHERE pa.id = polygraph_appointment_candidates.appointment_id
      AND pa.requested_by = auth.uid()
  )
);