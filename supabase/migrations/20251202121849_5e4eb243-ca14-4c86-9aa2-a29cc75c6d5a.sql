-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Allow master admins to update any profile
CREATE POLICY "Master admins can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (is_master_admin(auth.uid()));