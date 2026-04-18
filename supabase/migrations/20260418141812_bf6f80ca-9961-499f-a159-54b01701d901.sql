-- Allow admins who created an appointment to update (needed for soft-delete)
CREATE POLICY "Admins can update own polygraph appointments"
ON public.polygraph_appointments
FOR UPDATE
TO authenticated
USING (is_master_admin(auth.uid()) OR requested_by = auth.uid())
WITH CHECK (is_master_admin(auth.uid()) OR requested_by = auth.uid());