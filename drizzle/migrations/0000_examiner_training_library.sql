CREATE TABLE public.examiner_training_resources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT 'training' CHECK (category IN ('document','training','interview')),
 file_path text NOT NULL UNIQUE,
 file_name text NOT NULL,
 mime_type text NOT NULL DEFAULT 'application/octet-stream',
 file_size bigint NOT NULL DEFAULT 0,
 is_shared boolean NOT NULL DEFAULT true,
 uploaded_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examiner_training_resources TO authenticated;
GRANT ALL ON public.examiner_training_resources TO service_role;
ALTER TABLE public.examiner_training_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Masters manage examiner education" ON public.examiner_training_resources FOR ALL TO authenticated USING (public.is_master_admin(auth.uid())) WITH CHECK (public.is_master_admin(auth.uid()));
CREATE POLICY "Examiners read shared education" ON public.examiner_training_resources FOR SELECT TO authenticated USING (is_shared AND public.has_role(auth.uid(), 'examiner'));
CREATE TRIGGER examiner_training_updated_at BEFORE UPDATE ON public.examiner_training_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Masters upload examiner education files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'examiner-training' AND public.is_master_admin(auth.uid()));
CREATE POLICY "Masters manage examiner education files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'examiner-training' AND public.is_master_admin(auth.uid()));
CREATE POLICY "Read examiner education files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'examiner-training' AND (public.is_master_admin(auth.uid()) OR (public.has_role(auth.uid(), 'examiner') AND EXISTS (SELECT 1 FROM public.examiner_training_resources r WHERE r.file_path = name AND r.is_shared))));
CREATE OR REPLACE FUNCTION public.list_active_examiner_profiles()
RETURNS TABLE (id uuid, full_name text, email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
 IF NOT public.is_master_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Only master admins can view examiner profiles';
 END IF;
 RETURN QUERY SELECT p.id, p.full_name, p.email, p.created_at
 FROM public.profiles p JOIN auth.users u ON u.id = p.id
 WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'examiner')
 AND (u.banned_until IS NULL OR u.banned_until < now())
 ORDER BY p.full_name, p.email;
END;
$$;
REVOKE ALL ON FUNCTION public.list_active_examiner_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_examiner_profiles() TO authenticated, service_role;