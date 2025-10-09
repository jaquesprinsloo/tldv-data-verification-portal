-- Add DELETE policy for admins on employees table
CREATE POLICY "Admins can delete employees"
ON public.employees
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add DELETE policy for admins on submissions table
CREATE POLICY "Admins can delete submissions"
ON public.submissions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));