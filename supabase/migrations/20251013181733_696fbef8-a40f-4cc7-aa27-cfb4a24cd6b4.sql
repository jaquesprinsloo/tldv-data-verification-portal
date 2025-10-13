-- Update validate_invitation_token to also verify OTP and active status, and mark invitation as used
CREATE OR REPLACE FUNCTION public.validate_invitation_token(
  _token text,
  _employee_number text,
  _id_number text,
  _otp text
)
RETURNS TABLE(is_valid boolean, employee_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation record;
  v_employee record;
BEGIN
  -- Get invitation by token with constraints (unused, not expired, matching OTP)
  SELECT * INTO v_invitation
  FROM public.employee_invitations
  WHERE token = _token
    AND NOT used
    AND expires_at > now()
    AND otp = _otp;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Verify employee credentials match and employee is active
  SELECT * INTO v_employee
  FROM public.employees
  WHERE id = v_invitation.employee_id
    AND employee_number = _employee_number
    AND id_number = _id_number
    AND employment_status = 'active';
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Mark invitation as used
  UPDATE public.employee_invitations
  SET used = true, used_at = now()
  WHERE id = v_invitation.id;
  
  RETURN QUERY SELECT true, v_employee.id, v_invitation.email;
END;
$function$;