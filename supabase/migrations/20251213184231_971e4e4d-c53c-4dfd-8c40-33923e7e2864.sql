-- Update employees table INSERT policy to include master_admin
DROP POLICY IF EXISTS "Admins can insert employees" ON public.employees;
CREATE POLICY "Admins can insert employees" 
ON public.employees 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Update employees table UPDATE policy to include master_admin
DROP POLICY IF EXISTS "Admins can update employees" ON public.employees;
CREATE POLICY "Admins can update employees" 
ON public.employees 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Update employee_invitations table INSERT policy to include master_admin
DROP POLICY IF EXISTS "Admins can create invitations" ON public.employee_invitations;
CREATE POLICY "Admins can create invitations" 
ON public.employee_invitations 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Update employee_invitations table UPDATE policy to include master_admin
DROP POLICY IF EXISTS "Admins can update invitations" ON public.employee_invitations;
CREATE POLICY "Admins can update invitations" 
ON public.employee_invitations 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));