-- Create pending_document_uploads table for staging documents before approval
CREATE TABLE public.pending_document_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('invoice', 'polygraph_report', 'risk_assessment')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extracted_store_name TEXT,
  matched_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  confidence_score NUMERIC,
  extracted_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_document_uploads ENABLE ROW LEVEL SECURITY;

-- Create policies for master admins
CREATE POLICY "Master admins can manage pending uploads"
ON public.pending_document_uploads
FOR ALL
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

-- Create policy for admins to view their uploads
CREATE POLICY "Admins can view pending uploads for their accounts"
ON public.pending_document_uploads
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND has_account_access(auth.uid(), account_id)
);

-- Create policy for admins to insert uploads
CREATE POLICY "Admins can create pending uploads for their accounts"
ON public.pending_document_uploads
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND has_account_access(auth.uid(), account_id)
);

-- Create index for efficient queries
CREATE INDEX idx_pending_uploads_account ON public.pending_document_uploads(account_id);
CREATE INDEX idx_pending_uploads_status ON public.pending_document_uploads(status);

-- Add trigger for updated_at
CREATE TRIGGER update_pending_uploads_updated_at
BEFORE UPDATE ON public.pending_document_uploads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for pending documents
INSERT INTO storage.buckets (id, name, public) VALUES ('pending-documents', 'pending-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for pending documents bucket
CREATE POLICY "Admins can upload pending documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'pending-documents' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can view pending documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'pending-documents' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Master admins can delete pending documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'pending-documents' 
  AND is_master_admin(auth.uid())
);