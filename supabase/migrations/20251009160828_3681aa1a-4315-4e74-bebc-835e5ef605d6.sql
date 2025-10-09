-- Update next_of_kin RLS policies to allow anonymous inserts
-- Drop the restrictive anonymous policy and replace with a simpler one

DROP POLICY IF EXISTS "Anonymous users can add next of kin" ON public.next_of_kin;

-- Allow anonymous users to insert next of kin for any submission
CREATE POLICY "Anonymous users can add next of kin"
ON public.next_of_kin
FOR INSERT
TO anon
WITH CHECK (true);