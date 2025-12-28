-- Drop existing SELECT policies for employee-ids and proof-of-residence
DROP POLICY IF EXISTS "Admins can view all ID photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all proof of residence documents" ON storage.objects;

-- Recreate policies to include master_admin
CREATE POLICY "Admins can view all ID photos" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'employee-ids' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can view all proof of residence documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'proof-of-residence' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);