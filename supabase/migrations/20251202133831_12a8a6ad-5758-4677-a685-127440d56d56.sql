-- Create risk assessment result enum
CREATE TYPE public.risk_assessment_result AS ENUM ('clear', 'flagged', 'pending');

-- Create risk_assessments table for criminal/background checks
CREATE TABLE public.risk_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  assessment_date DATE NOT NULL,
  id_verification_status TEXT DEFAULT 'pending',
  criminal_check_status TEXT DEFAULT 'pending',
  result risk_assessment_result NOT NULL DEFAULT 'pending',
  report_url TEXT,
  notes TEXT,
  assessor_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.risk_assessments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all risk_assessments"
ON public.risk_assessments FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can insert risk_assessments"
ON public.risk_assessments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can update risk_assessments"
ON public.risk_assessments FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can delete risk_assessments"
ON public.risk_assessments FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_risk_assessments_updated_at
BEFORE UPDATE ON public.risk_assessments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();