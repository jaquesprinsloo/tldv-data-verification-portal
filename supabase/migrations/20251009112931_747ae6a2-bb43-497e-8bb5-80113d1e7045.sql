-- Restrict employee-specific insert policies to authenticated users only
ALTER POLICY "Employees can insert own submissions"
ON public.submissions
TO authenticated;

ALTER POLICY "Employees can insert own next of kin"
ON public.next_of_kin
TO authenticated;