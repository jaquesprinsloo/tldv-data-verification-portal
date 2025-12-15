-- Allow employees to view their own polygraph candidate record used for pre-populating the verification form
CREATE POLICY "Employees can view own polygraph candidate"
ON public.polygraph_candidates
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = polygraph_candidates.employee_id
      AND e.user_id = auth.uid()
  )
);
