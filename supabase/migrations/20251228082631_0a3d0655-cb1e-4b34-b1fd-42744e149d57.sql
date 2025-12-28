-- First, update any existing 'active' status to 'employed'
UPDATE employees SET employment_status = 'employed' WHERE employment_status = 'active';

-- Update any 'absconded' status to 'resigned' (closest equivalent)
UPDATE employees SET employment_status = 'resigned' WHERE employment_status = 'absconded';

-- Create employee_documents table for contracts, training confirmations, warnings, certificates
CREATE TABLE public.employee_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('contract', 'training', 'warning', 'certificate')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- Create policies for employee documents
CREATE POLICY "Scoped admin view employee_documents"
ON public.employee_documents
FOR SELECT
USING (
  is_master_admin(auth.uid()) OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin insert employee_documents"
ON public.employee_documents
FOR INSERT
WITH CHECK (
  is_master_admin(auth.uid()) OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin update employee_documents"
ON public.employee_documents
FOR UPDATE
USING (
  is_master_admin(auth.uid()) OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

CREATE POLICY "Scoped admin delete employee_documents"
ON public.employee_documents
FOR DELETE
USING (
  is_master_admin(auth.uid()) OR 
  (has_role(auth.uid(), 'admin'::app_role) AND has_employee_access(auth.uid(), employee_id))
);

-- Employees can view their own documents
CREATE POLICY "Employees can view own documents"
ON public.employee_documents
FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);

-- Create storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for employee-documents bucket
CREATE POLICY "Admins can upload employee documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'employee-documents' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can view employee documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'employee-documents' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Admins can delete employee documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'employee-documents' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);

CREATE POLICY "Employees can view own employee documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'employee-documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM employees WHERE user_id = auth.uid()
  )
);