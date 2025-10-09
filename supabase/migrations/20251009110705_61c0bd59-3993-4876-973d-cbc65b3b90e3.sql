-- Allow anonymous users to submit their verification
CREATE POLICY "Anonymous users can submit verification"
ON public.submissions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to add next of kin
CREATE POLICY "Anonymous users can add next of kin"
ON public.next_of_kin
FOR INSERT
TO anon
WITH CHECK (true);