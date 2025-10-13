-- Fix Critical Security Issue: Add OTP brute-force protection
-- Add failed_attempts tracking to employee_invitations table
ALTER TABLE public.employee_invitations
ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until timestamp with time zone;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_employee_invitations_token ON public.employee_invitations(token) WHERE NOT used;

-- Update validate_invitation_token function with rate limiting
CREATE OR REPLACE FUNCTION public.validate_invitation_token(
  _token text,
  _employee_number text,
  _id_number text,
  _otp text
)
RETURNS TABLE(is_valid boolean, employee_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_employee record;
BEGIN
  -- Get invitation by token
  SELECT * INTO v_invitation
  FROM public.employee_invitations
  WHERE token = _token
    AND NOT used;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Check if invitation is locked due to too many failed attempts
  IF v_invitation.locked_until IS NOT NULL AND v_invitation.locked_until > now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Check if invitation has expired
  IF v_invitation.expires_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Verify OTP, employee credentials, and active status
  SELECT * INTO v_employee
  FROM public.employees
  WHERE id = v_invitation.employee_id
    AND employee_number = _employee_number
    AND id_number = _id_number
    AND employment_status = 'active';
  
  -- If credentials don't match OR OTP is wrong, increment failed attempts
  IF NOT FOUND OR v_invitation.otp != _otp THEN
    -- Increment failed attempts
    UPDATE public.employee_invitations
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE 
          WHEN failed_attempts + 1 >= 5 THEN now() + interval '2 hours'
          ELSE locked_until
        END
    WHERE id = v_invitation.id;
    
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Success: Mark invitation as used and reset failed attempts
  UPDATE public.employee_invitations
  SET used = true,
      used_at = now(),
      failed_attempts = 0,
      locked_until = NULL
  WHERE id = v_invitation.id;
  
  RETURN QUERY SELECT true, v_employee.id, v_invitation.email;
END;
$$;

-- Add function to check and clean up expired locks
CREATE OR REPLACE FUNCTION public.cleanup_expired_invitation_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.employee_invitations
  SET locked_until = NULL,
      failed_attempts = 0
  WHERE locked_until IS NOT NULL 
    AND locked_until < now()
    AND NOT used;
END;
$$;