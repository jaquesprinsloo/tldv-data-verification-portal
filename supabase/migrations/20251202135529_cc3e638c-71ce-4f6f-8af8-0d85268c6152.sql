-- Drop existing policies on invoices
DROP POLICY IF EXISTS "Admins can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;

-- Create updated policies that include master_admin
CREATE POLICY "Admins can view all invoices" 
ON public.invoices 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can insert invoices" 
ON public.invoices 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can update invoices" 
ON public.invoices 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can delete invoices" 
ON public.invoices 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));