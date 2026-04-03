CREATE POLICY "Admins can update own invitations"
ON public.candex_invitations
FOR UPDATE
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid())
)
WITH CHECK (
  is_master_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid())
);

CREATE POLICY "Admins can delete own invitations"
ON public.candex_invitations
FOR DELETE
TO authenticated
USING (
  is_master_admin(auth.uid())
  OR (has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid())
);

CREATE OR REPLACE FUNCTION public.mark_candex_invitation_opened(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE candex_invitations
  SET status = 'opened', updated_at = now()
  WHERE token = _token
    AND status = 'sent';
  RETURN FOUND;
END;
$$;