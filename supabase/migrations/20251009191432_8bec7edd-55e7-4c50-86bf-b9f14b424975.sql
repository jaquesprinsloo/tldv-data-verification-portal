-- Fix 1: Add explicit authentication requirement for submissions table
-- This ensures unauthenticated users cannot access any employee personal data
CREATE POLICY "Block unauthenticated access to submissions"
ON public.submissions
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Fix 2: Add explicit authentication requirement for profiles table
-- This prevents anonymous users from harvesting email addresses
CREATE POLICY "Block unauthenticated access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Fix 3: Add explicit authentication requirement for submission_history table
-- This protects archived employee data from unauthorized access
CREATE POLICY "Block unauthenticated access to submission_history"
ON public.submission_history
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Fix 4: Add explicit authentication requirement for next_of_kin table
-- This protects emergency contact information from unauthorized access
CREATE POLICY "Block unauthenticated access to next_of_kin"
ON public.next_of_kin
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Fix 5: Add explicit authentication requirement for employees table
-- This protects employee records and ID numbers from unauthorized access
CREATE POLICY "Block unauthenticated access to employees"
ON public.employees
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);