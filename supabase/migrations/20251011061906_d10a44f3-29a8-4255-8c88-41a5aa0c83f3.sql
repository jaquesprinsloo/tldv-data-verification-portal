-- Add OTP column to employee_invitations
ALTER TABLE public.employee_invitations
ADD COLUMN otp text;

-- Add unique constraint on employee_number + id_number for active employees
CREATE UNIQUE INDEX unique_active_employee_credentials 
ON public.employees (employee_number, id_number) 
WHERE employment_status = 'active';

-- Update RLS policies for submissions to allow insertion based on valid employee_id
-- (not requiring auth.uid since we're removing auth dependency)
DROP POLICY IF EXISTS "Employees can insert own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Employees can update own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Employees can view own submissions" ON public.submissions;

-- Create new function to validate submission access without auth
CREATE OR REPLACE FUNCTION public.can_access_submission(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = _employee_id
      AND employment_status = 'active'
  )
$$;

-- New policies for submissions (simplified for OTP-based flow)
CREATE POLICY "Active employees can insert submissions"
ON public.submissions
FOR INSERT
WITH CHECK (public.can_access_submission(employee_id));

CREATE POLICY "Active employees can update submissions"
ON public.submissions
FOR UPDATE
USING (public.can_access_submission(employee_id));

CREATE POLICY "Active employees can view submissions"
ON public.submissions
FOR SELECT
USING (public.can_access_submission(employee_id));

-- Update next_of_kin policies
DROP POLICY IF EXISTS "Employees can insert own next of kin" ON public.next_of_kin;
DROP POLICY IF EXISTS "Employees can view own next of kin" ON public.next_of_kin;

CREATE POLICY "Can insert next of kin for valid submission"
ON public.next_of_kin
FOR INSERT
WITH CHECK (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE public.can_access_submission(employee_id)
  )
);

CREATE POLICY "Can view next of kin for valid submission"
ON public.next_of_kin
FOR SELECT
USING (
  submission_id IN (
    SELECT id FROM public.submissions
    WHERE public.can_access_submission(employee_id)
  )
);

-- Update POPIA acceptances policies
DROP POLICY IF EXISTS "Employees can insert own POPIA acceptance" ON public.popia_acceptances;
DROP POLICY IF EXISTS "Employees can view own POPIA acceptance" ON public.popia_acceptances;

CREATE POLICY "Can insert POPIA acceptance for active employee"
ON public.popia_acceptances
FOR INSERT
WITH CHECK (public.can_access_submission(employee_id));

CREATE POLICY "Can view POPIA acceptance for active employee"
ON public.popia_acceptances
FOR SELECT
USING (public.can_access_submission(employee_id));

-- Update renewal_requests policies
DROP POLICY IF EXISTS "Employees can insert own renewal requests" ON public.renewal_requests;
DROP POLICY IF EXISTS "Employees can view own renewal requests" ON public.renewal_requests;

CREATE POLICY "Can insert renewal request for active employee"
ON public.renewal_requests
FOR INSERT
WITH CHECK (public.can_access_submission(employee_id));

CREATE POLICY "Can view renewal request for active employee"
ON public.renewal_requests
FOR SELECT
USING (public.can_access_submission(employee_id));