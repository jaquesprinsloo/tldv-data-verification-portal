-- Drop the overly permissive policy that allows all authenticated users to view stores
DROP POLICY IF EXISTS "Employees can view stores" ON public.stores;

-- Create a restricted policy that only allows actual employees to view stores
CREATE POLICY "Actual employees can view stores"
ON public.stores
FOR SELECT
TO authenticated
USING (
  -- Only users who have an employee record can view stores
  EXISTS (
    SELECT 1
    FROM public.employees
    WHERE user_id = auth.uid()
  )
);