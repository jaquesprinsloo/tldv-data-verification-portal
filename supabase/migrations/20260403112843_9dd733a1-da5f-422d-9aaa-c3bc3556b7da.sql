
-- Add video_url to sections for section-level explainer videos
ALTER TABLE public.candex_template_sections ADD COLUMN video_url text;

-- Add video_url to section_tables for table/row-level explainer videos
ALTER TABLE public.candex_section_tables ADD COLUMN video_url text;

-- Create storage bucket for candex explainer videos
INSERT INTO storage.buckets (id, name, public) VALUES ('candex-videos', 'candex-videos', false);

-- Storage RLS: admins can upload/manage videos
CREATE POLICY "Admin upload candex videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'candex-videos' AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid())));

CREATE POLICY "Admin manage candex videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'candex-videos' AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid())));

CREATE POLICY "Authenticated view candex videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'candex-videos');
