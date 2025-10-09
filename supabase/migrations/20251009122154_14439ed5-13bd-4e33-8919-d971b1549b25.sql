-- Add contact number and verification fields to submissions table
ALTER TABLE public.submissions 
ADD COLUMN contact_number text,
ADD COLUMN whatsapp_verified boolean DEFAULT false,
ADD COLUMN verification_token text,
ADD COLUMN verification_token_expires_at timestamp with time zone,
ADD COLUMN document_verification_status text DEFAULT 'pending',
ADD COLUMN document_verification_details jsonb,
ADD COLUMN id_verification_status text DEFAULT 'pending',
ADD COLUMN id_verification_details jsonb;

-- Add comment to contact_number
COMMENT ON COLUMN public.submissions.contact_number IS 'Contact number for WhatsApp verification';

-- Add comment to verification fields
COMMENT ON COLUMN public.submissions.whatsapp_verified IS 'Whether the contact number has been verified via WhatsApp';
COMMENT ON COLUMN public.submissions.verification_token IS 'Token for WhatsApp verification link';
COMMENT ON COLUMN public.submissions.verification_token_expires_at IS 'Expiration time for verification token';
COMMENT ON COLUMN public.submissions.document_verification_status IS 'AI verification status for proof of residence: pending, verified, rejected';
COMMENT ON COLUMN public.submissions.document_verification_details IS 'Details from AI document verification';
COMMENT ON COLUMN public.submissions.id_verification_status IS 'AI verification status for ID photo: pending, verified, rejected';
COMMENT ON COLUMN public.submissions.id_verification_details IS 'Details from AI ID verification';