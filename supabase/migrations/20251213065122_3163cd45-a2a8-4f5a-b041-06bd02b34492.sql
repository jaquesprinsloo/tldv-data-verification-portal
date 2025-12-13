-- Create storage bucket for polygraph report PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('polygraph-reports', 'polygraph-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to polygraph-reports bucket
CREATE POLICY "Admins can upload polygraph reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'polygraph-reports' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

-- Allow authenticated users to view polygraph reports
CREATE POLICY "Authenticated users can view polygraph reports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'polygraph-reports');

-- Allow admins to delete polygraph reports
CREATE POLICY "Admins can delete polygraph reports storage"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'polygraph-reports' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);