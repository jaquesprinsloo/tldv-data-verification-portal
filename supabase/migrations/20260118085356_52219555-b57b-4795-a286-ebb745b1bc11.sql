-- Create pending_polygraph_uploads table for staging Word document uploads
CREATE TABLE public.pending_polygraph_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  examiner_id UUID REFERENCES public.examiners(id) ON DELETE SET NULL,
  
  -- File storage
  original_file_url TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  converted_pdf_url TEXT,
  
  -- Extracted data (editable by master admin)
  extracted_data JSONB,
  
  -- Candidate info
  first_name TEXT,
  last_name TEXT,
  id_number TEXT,
  email TEXT,
  contact_number TEXT,
  physical_address TEXT,
  position_applying_for TEXT,
  
  -- Risk analysis
  risk_score NUMERIC,
  risk_level TEXT,
  risk_analysis JSONB,
  
  -- Examination details
  examination_date DATE,
  overall_result TEXT,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_by UUID NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_polygraph_uploads ENABLE ROW LEVEL SECURITY;

-- Only master admins can view and manage pending uploads
CREATE POLICY "Master admins can view all pending uploads"
ON public.pending_polygraph_uploads
FOR SELECT
TO authenticated
USING (is_master_admin(auth.uid()));

CREATE POLICY "Master admins can update pending uploads"
ON public.pending_polygraph_uploads
FOR UPDATE
TO authenticated
USING (is_master_admin(auth.uid()));

CREATE POLICY "Master admins can delete pending uploads"
ON public.pending_polygraph_uploads
FOR DELETE
TO authenticated
USING (is_master_admin(auth.uid()));

-- Admins can insert (upload) pending reports
CREATE POLICY "Admins can insert pending uploads"
ON public.pending_polygraph_uploads
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_pending_polygraph_uploads_updated_at
BEFORE UPDATE ON public.pending_polygraph_uploads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster queries
CREATE INDEX idx_pending_polygraph_uploads_status ON public.pending_polygraph_uploads(status);
CREATE INDEX idx_pending_polygraph_uploads_uploaded_by ON public.pending_polygraph_uploads(uploaded_by);