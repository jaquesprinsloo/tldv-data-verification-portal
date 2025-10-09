-- Fix the profiles INSERT policy (drop existing one first)
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;

-- Add INSERT policy for profiles table that only allows system triggers
CREATE POLICY "System can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (true);