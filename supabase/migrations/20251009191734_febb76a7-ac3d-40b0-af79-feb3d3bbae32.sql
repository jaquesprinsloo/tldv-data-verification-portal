-- Security Fix #1: Create employee invitations system for secure onboarding
-- This allows admins to invite employees to create accounts

CREATE TABLE IF NOT EXISTS public.employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  email text NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  used boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on employee_invitations
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage invitations
CREATE POLICY "Admins can view all invitations"
ON public.employee_invitations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create invitations"
ON public.employee_invitations
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invitations"
ON public.employee_invitations
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to validate and use invitation token
CREATE OR REPLACE FUNCTION public.validate_invitation_token(_token text, _employee_number text, _id_number text)
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
    AND NOT used
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Verify employee credentials match
  SELECT * INTO v_employee
  FROM public.employees
  WHERE id = v_invitation.employee_id
    AND employee_number = _employee_number
    AND id_number = _id_number;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  
  -- Mark invitation as used
  UPDATE public.employee_invitations
  SET used = true
  WHERE id = v_invitation.id;
  
  RETURN QUERY SELECT true, v_employee.id, v_invitation.email;
END;
$$;

-- Function to link employee to authenticated user
CREATE OR REPLACE FUNCTION public.link_employee_to_user(_employee_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update employee record with user_id
  UPDATE public.employees
  SET user_id = _user_id
  WHERE id = _employee_id
    AND user_id IS NULL; -- Only link if not already linked
  
  RETURN FOUND;
END;
$$;