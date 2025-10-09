-- Add detailed address fields to submissions table
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS house_number text,
ADD COLUMN IF NOT EXISTS floor_number text,
ADD COLUMN IF NOT EXISTS street_name text,
ADD COLUMN IF NOT EXISTS complex_name text,
ADD COLUMN IF NOT EXISTS suburb text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS province text,
ADD COLUMN IF NOT EXISTS postal_code text,
ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_method text;

-- Update RLS policy to only show verified submissions to admins
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.submissions;

CREATE POLICY "Admins can view verified submissions"
ON public.submissions
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) AND 
  (email_verified = true OR whatsapp_verified = true)
);

-- Update the anonymous insert policy to set initial verification status
DROP POLICY IF EXISTS "Anonymous users can submit verification" ON public.submissions;

CREATE POLICY "Anonymous users can submit verification"
ON public.submissions
FOR INSERT
WITH CHECK (true);