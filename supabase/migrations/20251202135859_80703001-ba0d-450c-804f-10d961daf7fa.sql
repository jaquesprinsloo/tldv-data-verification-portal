-- Drop existing storage policies for invoices bucket
DROP POLICY IF EXISTS "Admins can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete invoices" ON storage.objects;

-- Recreate with master_admin access
CREATE POLICY "Admins can upload invoices"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'invoices' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can view invoices"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can update invoices"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'invoices' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can delete invoices"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'invoices' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);