CREATE POLICY "Anon can read candex applications they just submitted"
ON public.candex_applications
FOR SELECT
TO anon
USING (
  invitation_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.candex_invitations
    WHERE candex_invitations.id = candex_applications.invitation_id
  )
);