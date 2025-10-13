-- Fix Critical Security Issue: Implement proper employee authentication
-- This replaces sessionStorage-based auth with proper Supabase Auth

-- Update validate_invitation_token to create Supabase auth user and link to employee
CREATE OR REPLACE FUNCTION public.validate_invitation_token_and_create_user(
  _token text,
  _employee_number text,
  _id_number text,
  _otp text,
  _email text,
  _password text
)
RETURNS TABLE(is_valid boolean, employee_id uuid, email text, user_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_employee record;
  v_auth_user_id uuid;
BEGIN
  -- Get invitation by token
  SELECT * INTO v_invitation
  FROM public.employee_invitations
  WHERE token = _token
    AND NOT used;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, false;
    RETURN;
  END IF;
  
  -- Check if invitation is locked due to too many failed attempts
  IF v_invitation.locked_until IS NOT NULL AND v_invitation.locked_until > now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, false;
    RETURN;
  END IF;
  
  -- Check if invitation has expired
  IF v_invitation.expires_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, false;
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
    
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, false;
    RETURN;
  END IF;
  
  -- Check if employee already has a user_id (already registered)
  IF v_employee.user_id IS NOT NULL THEN
    -- Mark invitation as used
    UPDATE public.employee_invitations
    SET used = true,
        used_at = now(),
        failed_attempts = 0,
        locked_until = NULL
    WHERE id = v_invitation.id;
    
    RETURN QUERY SELECT true, v_employee.id, v_invitation.email, false;
    RETURN;
  END IF;
  
  -- Success: Mark invitation as used
  UPDATE public.employee_invitations
  SET used = true,
      used_at = now(),
      failed_attempts = 0,
      locked_until = NULL
  WHERE id = v_invitation.id;
  
  RETURN QUERY SELECT true, v_employee.id, v_invitation.email, true;
END;
$$;

-- Update can_access_submission to use auth.uid() for proper authentication
CREATE OR REPLACE FUNCTION public.can_access_submission(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = _employee_id
      AND employment_status = 'active'
      AND (user_id = auth.uid() OR auth.uid() IS NULL)
  )
$$;

-- Add RLS policy for employees to access their own data via auth.uid()
DROP POLICY IF EXISTS "Employees via auth can view own submissions" ON public.submissions;
CREATE POLICY "Employees via auth can view own submissions"
ON public.submissions
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Employees via auth can insert own submissions" ON public.submissions;
CREATE POLICY "Employees via auth can insert own submissions"
ON public.submissions
FOR INSERT
WITH CHECK (
  employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Employees via auth can update own submissions" ON public.submissions;
CREATE POLICY "Employees via auth can update own submissions"
ON public.submissions
FOR UPDATE
USING (
  employee_id IN (
    SELECT id FROM public.employees WHERE user_id = auth.uid()
  )
);