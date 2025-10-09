-- Add storage policies for anonymous uploads during submission

-- Policies for proof-of-residence bucket
CREATE POLICY "Allow anonymous uploads to proof-of-residence"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'proof-of-residence');

CREATE POLICY "Allow authenticated users to upload proof-of-residence"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'proof-of-residence');

CREATE POLICY "Allow admins to view proof-of-residence"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'proof-of-residence' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Policies for employee-ids bucket
CREATE POLICY "Allow anonymous uploads to employee-ids"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'employee-ids');

CREATE POLICY "Allow authenticated users to upload employee-ids"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-ids');

CREATE POLICY "Allow admins to view employee-ids"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-ids' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Policies for employee-selfies bucket
CREATE POLICY "Allow anonymous uploads to employee-selfies"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'employee-selfies');

CREATE POLICY "Allow authenticated users to upload employee-selfies"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'employee-selfies');

CREATE POLICY "Allow admins to view employee-selfies"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-selfies' 
  AND public.has_role(auth.uid(), 'admin'::app_role)
);