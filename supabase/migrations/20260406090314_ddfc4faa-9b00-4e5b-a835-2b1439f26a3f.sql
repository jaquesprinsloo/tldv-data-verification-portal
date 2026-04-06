CREATE POLICY "Admin update candex applications status"
ON public.candex_applications
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));