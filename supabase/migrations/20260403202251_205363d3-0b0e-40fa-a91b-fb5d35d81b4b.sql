CREATE POLICY "Admins can create own invitations"
ON public.candex_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  is_master_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND created_by = auth.uid()
  )
);