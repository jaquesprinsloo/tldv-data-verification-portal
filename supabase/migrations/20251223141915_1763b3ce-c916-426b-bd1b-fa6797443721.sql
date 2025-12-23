-- Strengthen can_access_submission function with additional defensive checks
CREATE OR REPLACE FUNCTION public.can_access_submission(_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    -- First line of defense: require authentication
    auth.uid() IS NOT NULL
    AND
    -- Second line of defense: require valid employee_id parameter
    _employee_id IS NOT NULL
    AND
    -- Third line of defense: verify employee relationship
    EXISTS (
      SELECT 1
      FROM public.employees
      WHERE id = _employee_id
        AND employment_status = 'active'
        AND user_id = auth.uid()
    )
$function$;

-- Drop existing policies that rely solely on can_access_submission
DROP POLICY IF EXISTS "Active employees can insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Active employees can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Active employees can view submissions" ON public.submissions;

-- Recreate with explicit authentication checks added (using correct RESTRICTIVE syntax)
CREATE POLICY "Active employees can insert submissions" 
ON public.submissions 
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND can_access_submission(employee_id)
);

CREATE POLICY "Active employees can update submissions" 
ON public.submissions 
AS RESTRICTIVE
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND can_access_submission(employee_id)
);

CREATE POLICY "Active employees can view submissions" 
ON public.submissions 
AS RESTRICTIVE
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND can_access_submission(employee_id)
);

-- Strengthen admin policies with explicit auth check
DROP POLICY IF EXISTS "Admins can delete submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins can update all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.submissions;

CREATE POLICY "Admins can delete submissions" 
ON public.submissions 
AS RESTRICTIVE
FOR DELETE
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update all submissions" 
ON public.submissions 
AS RESTRICTIVE
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view all submissions" 
ON public.submissions 
AS RESTRICTIVE
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND has_role(auth.uid(), 'admin'::app_role)
);