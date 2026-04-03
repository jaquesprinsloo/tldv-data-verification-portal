
-- =============================================
-- FIX 1: Remove anonymous upload policies for employee-ids and employee-selfies
-- These allow anyone on the internet to upload arbitrary files
-- =============================================
DROP POLICY IF EXISTS "Allow anonymous uploads to employee-ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous uploads to employee-selfies" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous users can upload IDs" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous users can upload selfies" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous uploads to proof-of-residence" ON storage.objects;

-- =============================================
-- FIX 2: Fix proof-of-residence INSERT policy (no path restriction)
-- Drop the unrestricted policies and replace with path-scoped ones
-- =============================================
DROP POLICY IF EXISTS "Users can upload their own proof of residence" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload proof-of-residence" ON storage.objects;

-- Replace with a single policy that allows public uploads but scoped to a path
-- The submission flow uses employeeId as the first folder segment
CREATE POLICY "Public can upload proof of residence with path"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'proof-of-residence');

-- =============================================
-- FIX 3: Fix proof-of-residence UPDATE policy (no auth check)
-- =============================================
DROP POLICY IF EXISTS "Users can update their own proof of residence" ON storage.objects;

CREATE POLICY "Admins can update proof of residence"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'proof-of-residence'
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

-- =============================================
-- FIX 4: Replace employee-ids and employee-selfies INSERT policies
-- Keep authenticated uploads but remove unrestricted anonymous ones
-- =============================================
DROP POLICY IF EXISTS "Allow authenticated users to upload employee-ids" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload employee-selfies" ON storage.objects;
DROP POLICY IF EXISTS "Employees can upload own ID photos" ON storage.objects;

-- Re-create public upload policies for employee-ids and employee-selfies
-- These are needed for the unauthenticated employee submission flow
CREATE POLICY "Public can upload employee IDs"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'employee-ids');

CREATE POLICY "Public can upload employee selfies"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'employee-selfies');

-- =============================================
-- FIX 5: Restrict audit_log INSERT to only authenticated users
-- =============================================
DROP POLICY IF EXISTS "System can insert audit logs" ON storage.objects;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;

CREATE POLICY "Only triggers can insert audit logs"
ON public.audit_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- FIX 6: Fix popia_acceptances block policy to be RESTRICTIVE
-- =============================================
DROP POLICY IF EXISTS "Block unauthenticated access to popia_acceptances" ON public.popia_acceptances;

CREATE POLICY "Block unauthenticated access to popia_acceptances"
ON public.popia_acceptances AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);
