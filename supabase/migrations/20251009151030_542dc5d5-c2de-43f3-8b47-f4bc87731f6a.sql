-- Remove WhatsApp verification requirements from submissions table
ALTER TABLE public.submissions 
ALTER COLUMN whatsapp_verified DROP NOT NULL,
ALTER COLUMN whatsapp_verified SET DEFAULT NULL;

-- Update the admin view policy to only require email verification
DROP POLICY IF EXISTS "Admins can view verified submissions" ON public.submissions;
CREATE POLICY "Admins can view verified submissions"
ON public.submissions
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND email_verified = true);