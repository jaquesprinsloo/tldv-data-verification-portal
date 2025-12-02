-- Drop existing restrictive policies on stores
DROP POLICY IF EXISTS "Admins can insert stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can update stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can delete stores" ON public.stores;
DROP POLICY IF EXISTS "Admins can view stores" ON public.stores;

-- Create new policies that allow both admin and master_admin
CREATE POLICY "Admins can insert stores" 
ON public.stores 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can update stores" 
ON public.stores 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can delete stores" 
ON public.stores 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can view stores" 
ON public.stores 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));