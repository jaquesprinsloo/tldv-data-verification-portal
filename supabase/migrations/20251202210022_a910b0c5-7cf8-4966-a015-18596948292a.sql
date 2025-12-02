-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins can insert examiners" ON public.examiners;

-- Create new policy that allows both admin and master_admin
CREATE POLICY "Admins can insert examiners" 
ON public.examiners 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Also update other examiner policies to include master_admin
DROP POLICY IF EXISTS "Admins can update examiners" ON public.examiners;
CREATE POLICY "Admins can update examiners" 
ON public.examiners 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete examiners" ON public.examiners;
CREATE POLICY "Admins can delete examiners" 
ON public.examiners 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all examiners" ON public.examiners;
CREATE POLICY "Admins can view all examiners" 
ON public.examiners 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));