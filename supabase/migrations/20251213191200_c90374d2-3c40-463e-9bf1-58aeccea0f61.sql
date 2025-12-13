-- Drop and recreate the policy to include master_admin
DROP POLICY IF EXISTS "Admins can view all employees" ON public.employees;

CREATE POLICY "Admins can view all employees"
ON public.employees
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_master_admin(auth.uid())
);