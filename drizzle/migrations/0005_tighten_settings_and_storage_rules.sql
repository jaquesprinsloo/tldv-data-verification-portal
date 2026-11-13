DROP POLICY IF EXISTS "Authenticated users can read card order" ON public.portal_card_order;
CREATE POLICY "Staff can read card order" ON public.portal_card_order FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Anyone can read popia settings" ON public.popia_indemnity_settings;
CREATE POLICY "Staff can read popia settings" ON public.popia_indemnity_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
REVOKE SELECT ON public.popia_indemnity_settings FROM anon;

DROP POLICY IF EXISTS "Anon can read popia-indemnity audio" ON storage.objects;
DROP POLICY IF EXISTS "MRA indemnities: anon intake insert" ON storage.objects;
DROP POLICY IF EXISTS "MRA indemnities: authenticated intake insert" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated view candex videos" ON storage.objects;
CREATE POLICY "Admins view candex videos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candex-videos' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_master_admin(auth.uid())));