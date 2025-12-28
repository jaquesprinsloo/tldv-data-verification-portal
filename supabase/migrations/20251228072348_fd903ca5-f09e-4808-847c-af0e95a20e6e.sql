-- Drop the RESTRICTIVE policies that are blocking admin access
DROP POLICY IF EXISTS "Active employees can view submissions" ON public.submissions;
DROP POLICY IF EXISTS "Active employees can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Active employees can insert submissions" ON public.submissions;

-- Recreate as PERMISSIVE policies so they work alongside admin policies
CREATE POLICY "Active employees can view submissions"
ON public.submissions
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND can_access_submission(employee_id)
);

CREATE POLICY "Active employees can update submissions"
ON public.submissions
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND can_access_submission(employee_id)
);

CREATE POLICY "Active employees can insert submissions"
ON public.submissions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND can_access_submission(employee_id)
);