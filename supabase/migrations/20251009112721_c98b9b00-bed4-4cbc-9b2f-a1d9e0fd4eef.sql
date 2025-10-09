-- Allow anonymous users to upload selfie photos
CREATE POLICY "Anonymous users can upload selfies"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'employee-selfies');

-- Allow anonymous users to upload ID photos
CREATE POLICY "Anonymous users can upload IDs"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'employee-ids');