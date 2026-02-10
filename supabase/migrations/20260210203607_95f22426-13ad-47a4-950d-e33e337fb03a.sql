
-- Track PDF views and downloads
CREATE TABLE public.report_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.polygraph_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('view', 'download')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_report_access_log_report_user ON public.report_access_log(report_id, user_id, access_type);

-- Enable RLS
ALTER TABLE public.report_access_log ENABLE ROW LEVEL SECURITY;

-- Admins and master admins can view access logs
CREATE POLICY "Admins can view access logs"
  ON public.report_access_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Admins and master admins can insert access logs
CREATE POLICY "Admins can insert access logs"
  ON public.report_access_log FOR INSERT
  WITH CHECK (auth.uid() = user_id AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid())));
