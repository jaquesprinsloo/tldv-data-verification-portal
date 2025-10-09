-- Ensure authenticated users can insert next_of_kin linked to a valid submission
DROP POLICY IF EXISTS "Authenticated users can add next of kin" ON public.next_of_kin;

CREATE POLICY "Authenticated users can add next of kin"
ON public.next_of_kin
FOR INSERT
TO authenticated
WITH CHECK (
  submission_id IN (SELECT id FROM public.submissions)
);