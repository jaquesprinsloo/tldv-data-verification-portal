-- Create storage bucket for invoices
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for invoices bucket
CREATE POLICY "Admins can upload invoices" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'invoices' AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view invoices" ON storage.objects FOR SELECT USING (
  bucket_id = 'invoices' AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete invoices" ON storage.objects FOR DELETE USING (
  bucket_id = 'invoices' AND has_role(auth.uid(), 'admin'::app_role)
);