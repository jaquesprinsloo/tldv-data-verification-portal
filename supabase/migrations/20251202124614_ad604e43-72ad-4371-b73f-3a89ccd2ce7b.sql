-- Drop existing accounts INSERT policy and recreate with master_admin support
DROP POLICY IF EXISTS "Admins can insert accounts" ON public.accounts;

CREATE POLICY "Admins can insert accounts" 
ON public.accounts 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Also update other accounts policies to include master_admin
DROP POLICY IF EXISTS "Admins can update accounts" ON public.accounts;
CREATE POLICY "Admins can update accounts" 
ON public.accounts 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete accounts" ON public.accounts;
CREATE POLICY "Admins can delete accounts" 
ON public.accounts 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all accounts" ON public.accounts;
CREATE POLICY "Admins can view all accounts" 
ON public.accounts 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));