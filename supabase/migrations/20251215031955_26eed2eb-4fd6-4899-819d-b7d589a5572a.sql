-- Drop the existing restrictive delete policy
DROP POLICY IF EXISTS "Admins can delete employees" ON public.employees;

-- Create a new delete policy that allows both admin and master_admin roles
CREATE POLICY "Admins can delete employees" 
ON public.employees 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));