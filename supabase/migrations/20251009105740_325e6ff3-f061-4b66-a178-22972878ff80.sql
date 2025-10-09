-- Add INSERT policy for admins to create employees
CREATE POLICY "Admins can insert employees"
ON public.employees
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));