-- Add uploaded_by column to track who uploaded the report
ALTER TABLE public.polygraph_reports 
ADD COLUMN uploaded_by uuid REFERENCES auth.users(id);

-- Add index for efficient filtering by uploader
CREATE INDEX idx_polygraph_reports_uploaded_by ON public.polygraph_reports(uploaded_by);

-- Comment for clarity
COMMENT ON COLUMN public.polygraph_reports.uploaded_by IS 'User ID of the admin who uploaded this report';