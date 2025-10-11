-- Add invitation_method column to employee_invitations
ALTER TABLE public.employee_invitations
ADD COLUMN invitation_method text DEFAULT 'email' CHECK (invitation_method IN ('email', 'whatsapp', 'qr_coupon'));

-- Add index for faster queries
CREATE INDEX idx_employee_invitations_created_at ON public.employee_invitations(created_at DESC);