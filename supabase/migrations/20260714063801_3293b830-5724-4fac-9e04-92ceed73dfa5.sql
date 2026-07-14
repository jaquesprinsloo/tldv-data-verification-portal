
DROP POLICY IF EXISTS "MRA indemnities: authenticated read" ON storage.objects;
DROP POLICY IF EXISTS "MRA indemnities: authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "MRA indemnities: authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "MRA indemnities: authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "MRA supplier: auth read" ON storage.objects;
DROP POLICY IF EXISTS "MRA supplier: auth insert" ON storage.objects;
DROP POLICY IF EXISTS "MRA supplier: auth update" ON storage.objects;
DROP POLICY IF EXISTS "MRA supplier: auth delete" ON storage.objects;

CREATE POLICY "MRA indemnities: admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'manual-risk-indemnities'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA indemnities: admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manual-risk-indemnities'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA indemnities: admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'manual-risk-indemnities'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')))
  WITH CHECK (bucket_id = 'manual-risk-indemnities'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA indemnities: admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'manual-risk-indemnities'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA supplier: admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'manual-risk-supplier-reports'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA supplier: admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manual-risk-supplier-reports'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA supplier: admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'manual-risk-supplier-reports'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')))
  WITH CHECK (bucket_id = 'manual-risk-supplier-reports'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));

CREATE POLICY "MRA supplier: admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'manual-risk-supplier-reports'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')));
