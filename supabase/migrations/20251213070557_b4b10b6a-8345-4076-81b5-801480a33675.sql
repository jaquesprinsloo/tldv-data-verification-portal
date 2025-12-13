-- Add candidate photo URL to polygraph_reports
ALTER TABLE public.polygraph_reports 
ADD COLUMN IF NOT EXISTS candidate_photo_url TEXT;