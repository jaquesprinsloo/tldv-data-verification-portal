-- Allow public users to verify their employee number exists
CREATE POLICY "Public can verify employee numbers"
ON public.employees
FOR SELECT
TO anon
USING (true);