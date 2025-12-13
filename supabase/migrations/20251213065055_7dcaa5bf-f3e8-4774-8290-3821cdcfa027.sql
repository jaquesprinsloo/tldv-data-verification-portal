-- Add report_pdf_url column to polygraph_reports table
ALTER TABLE public.polygraph_reports 
ADD COLUMN IF NOT EXISTS report_pdf_url TEXT;