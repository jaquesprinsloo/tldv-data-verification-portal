-- Update validation function to allow retry if user creation failed
CREATE OR REPLACE FUNCTION public.validate_invitation_token_and_create_user(_token text, _employee_number text, _id_number text, _otp text, _email text, _password text)
RETURNS TABLE(is_valid boolean, employee_id uuid, email text, user_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation record;
  v_employee record;
BEGIN
  -- Get invitation by token (allow retry if employee has no user_id)
  SELECT * INTO v_invitation
  FROM public.employee_invitations
  WHERE token = _token
    AND (NOT used OR (used AND EXISTS (
      SELECT 1 FROM public.employees 
      WHERE id = employee_invitations.employee_id 
      AND user_id IS NULL
    )));
  
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
$function$;