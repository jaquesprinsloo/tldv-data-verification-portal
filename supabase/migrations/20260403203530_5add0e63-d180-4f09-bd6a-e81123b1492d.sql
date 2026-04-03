-- Allow anon to read invitation by token (for candidate access)
CREATE POLICY "Anon can read invitation by token"
ON public.candex_invitations
FOR SELECT
TO anon
USING (true);

-- Allow anon to insert applications (candidate submissions)
CREATE POLICY "Anon can create candex application"
ON public.candex_applications
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to update invitation status (opened/completed via token)
CREATE POLICY "Anon can update invitation status"
ON public.candex_invitations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Grant execute on the mark_candex_invitation_opened function to anon
GRANT EXECUTE ON FUNCTION public.mark_candex_invitation_opened TO anon;