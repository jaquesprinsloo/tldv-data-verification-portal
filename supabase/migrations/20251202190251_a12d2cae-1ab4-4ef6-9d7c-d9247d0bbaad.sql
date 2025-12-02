-- Create enum for polygraph report status
CREATE TYPE public.polygraph_report_status AS ENUM ('draft', 'completed', 'approved');

-- Create enum for polygraph overall result
CREATE TYPE public.polygraph_overall_result AS ENUM ('passed', 'failed', 'inconclusive');

-- Create enum for polygraph candidate status
CREATE TYPE public.polygraph_candidate_status AS ENUM ('pending_review', 'approved', 'rejected');

-- Create enum for exam question finding
CREATE TYPE public.exam_question_finding AS ENUM ('SR', 'NSR', 'INC', 'PNC');

-- Create enum for admission time window
CREATE TYPE public.admission_time_window AS ENUM ('within_2_years', '2_5_years', '5_plus_years', 'never');

-- Create polygraph_reports table
CREATE TABLE public.polygraph_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examiner_id UUID REFERENCES public.examiners(id),
  store_id UUID REFERENCES public.stores(id),
  examination_date DATE NOT NULL,
  status polygraph_report_status NOT NULL DEFAULT 'draft',
  
  -- Candidate information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  contact_number TEXT,
  email TEXT,
  physical_address TEXT,
  position_applying_for TEXT,
  
  -- Vetting types (array of selected services)
  vetting_types JSONB DEFAULT '[]'::jsonb,
  
  -- Results
  overall_result polygraph_overall_result,
  examiner_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create polygraph_suitability table
CREATE TABLE public.polygraph_suitability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.polygraph_reports(id) ON DELETE CASCADE,
  
  -- Health questions
  health_status TEXT,
  enough_sleep BOOLEAN,
  hospitalized_recently BOOLEAN,
  hospitalized_details TEXT,
  medication_taken BOOLEAN,
  medication_details TEXT,
  heart_conditions BOOLEAN,
  breathing_trouble BOOLEAN,
  psychological_disorders BOOLEAN,
  diabetic BOOLEAN,
  
  -- Substance use
  recent_drug_use BOOLEAN,
  drug_use_details TEXT,
  recent_alcohol_use BOOLEAN,
  alcohol_details TEXT,
  smoker BOOLEAN,
  smoking_details TEXT,
  pregnant BOOLEAN,
  
  -- Suitability determination
  suitable_for_exam BOOLEAN,
  suitability_comment TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create polygraph_admissions table
CREATE TABLE public.polygraph_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.polygraph_reports(id) ON DELETE CASCADE,
  
  category TEXT NOT NULL, -- drug_use, theft_from_work, fraud, bribery, criminal_syndicate, undetected_crimes, previous_dismissal, gambling_issues
  confirmed BOOLEAN NOT NULL DEFAULT false,
  details JSONB DEFAULT '{}'::jsonb, -- stores dropdown selections (substances, values, types, etc.)
  time_window admission_time_window,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create polygraph_exam_questions table
CREATE TABLE public.polygraph_exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.polygraph_reports(id) ON DELETE CASCADE,
  
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  response BOOLEAN, -- true = yes, false = no
  finding exam_question_finding,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create polygraph_candidates table
CREATE TABLE public.polygraph_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.polygraph_reports(id) ON DELETE CASCADE,
  
  -- Candidate information (copied from report)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  email TEXT,
  contact_number TEXT,
  physical_address TEXT,
  position TEXT,
  store_id UUID REFERENCES public.stores(id),
  
  -- Approval workflow
  status polygraph_candidate_status NOT NULL DEFAULT 'pending_review',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Invitation for approved candidates
  invitation_sent BOOLEAN DEFAULT false,
  invitation_token TEXT,
  invitation_sent_at TIMESTAMPTZ,
  
  -- Link to employee once created
  employee_id UUID REFERENCES public.employees(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.polygraph_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polygraph_suitability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polygraph_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polygraph_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polygraph_candidates ENABLE ROW LEVEL SECURITY;

-- RLS policies for polygraph_reports
CREATE POLICY "Admins can view all polygraph reports"
ON public.polygraph_reports FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert polygraph reports"
ON public.polygraph_reports FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update polygraph reports"
ON public.polygraph_reports FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete polygraph reports"
ON public.polygraph_reports FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for polygraph_suitability
CREATE POLICY "Admins can view all polygraph suitability"
ON public.polygraph_suitability FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert polygraph suitability"
ON public.polygraph_suitability FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update polygraph suitability"
ON public.polygraph_suitability FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete polygraph suitability"
ON public.polygraph_suitability FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for polygraph_admissions
CREATE POLICY "Admins can view all polygraph admissions"
ON public.polygraph_admissions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert polygraph admissions"
ON public.polygraph_admissions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update polygraph admissions"
ON public.polygraph_admissions FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete polygraph admissions"
ON public.polygraph_admissions FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for polygraph_exam_questions
CREATE POLICY "Admins can view all polygraph exam questions"
ON public.polygraph_exam_questions FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert polygraph exam questions"
ON public.polygraph_exam_questions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update polygraph exam questions"
ON public.polygraph_exam_questions FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete polygraph exam questions"
ON public.polygraph_exam_questions FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for polygraph_candidates
CREATE POLICY "Admins can view all polygraph candidates"
ON public.polygraph_candidates FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert polygraph candidates"
ON public.polygraph_candidates FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update polygraph candidates"
ON public.polygraph_candidates FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete polygraph candidates"
ON public.polygraph_candidates FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_polygraph_reports_store ON public.polygraph_reports(store_id);
CREATE INDEX idx_polygraph_reports_examiner ON public.polygraph_reports(examiner_id);
CREATE INDEX idx_polygraph_reports_status ON public.polygraph_reports(status);
CREATE INDEX idx_polygraph_admissions_report ON public.polygraph_admissions(report_id);
CREATE INDEX idx_polygraph_admissions_category ON public.polygraph_admissions(category);
CREATE INDEX idx_polygraph_candidates_status ON public.polygraph_candidates(status);
CREATE INDEX idx_polygraph_candidates_employee ON public.polygraph_candidates(employee_id);

-- Create trigger for updated_at on polygraph_reports
CREATE TRIGGER update_polygraph_reports_updated_at
BEFORE UPDATE ON public.polygraph_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on polygraph_candidates
CREATE TRIGGER update_polygraph_candidates_updated_at
BEFORE UPDATE ON public.polygraph_candidates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();