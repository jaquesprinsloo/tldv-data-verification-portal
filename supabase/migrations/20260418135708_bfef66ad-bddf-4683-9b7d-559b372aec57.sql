ALTER TABLE public.candex_applications
  DROP CONSTRAINT IF EXISTS candex_applications_invitation_id_fkey;

ALTER TABLE public.candex_applications
  ADD CONSTRAINT candex_applications_invitation_id_fkey
  FOREIGN KEY (invitation_id)
  REFERENCES public.candex_invitations(id)
  ON DELETE CASCADE;