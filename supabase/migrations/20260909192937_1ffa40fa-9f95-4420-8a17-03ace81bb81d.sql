CREATE POLICY "Archive reports: admin read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'archive-reports' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role)));

CREATE POLICY "Archive reports: admin insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'archive-reports' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role)));

CREATE POLICY "Archive reports: admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'archive-reports' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role)))
WITH CHECK (bucket_id = 'archive-reports' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role)));

CREATE POLICY "Archive reports: admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'archive-reports' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role)));

CREATE POLICY "Archive reports: client facing read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'archive-reports' AND has_role(auth.uid(), 'client_facing'::app_role));