-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all polygraph reports" ON public.polygraph_reports;
DROP POLICY IF EXISTS "Admins can insert polygraph reports" ON public.polygraph_reports;
DROP POLICY IF EXISTS "Admins can update polygraph reports" ON public.polygraph_reports;
DROP POLICY IF EXISTS "Admins can delete polygraph reports" ON public.polygraph_reports;

-- Create new policies that include both admin and master_admin roles
CREATE POLICY "Admins can view all polygraph reports" 
ON public.polygraph_reports 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can insert polygraph reports" 
ON public.polygraph_reports 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update polygraph reports" 
ON public.polygraph_reports 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete polygraph reports" 
ON public.polygraph_reports 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Also update related tables
DROP POLICY IF EXISTS "Admins can view all polygraph suitability" ON public.polygraph_suitability;
DROP POLICY IF EXISTS "Admins can insert polygraph suitability" ON public.polygraph_suitability;
DROP POLICY IF EXISTS "Admins can update polygraph suitability" ON public.polygraph_suitability;
DROP POLICY IF EXISTS "Admins can delete polygraph suitability" ON public.polygraph_suitability;

CREATE POLICY "Admins can view all polygraph suitability" 
ON public.polygraph_suitability 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can insert polygraph suitability" 
ON public.polygraph_suitability 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update polygraph suitability" 
ON public.polygraph_suitability 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete polygraph suitability" 
ON public.polygraph_suitability 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Update polygraph_admissions policies
DROP POLICY IF EXISTS "Admins can view all polygraph admissions" ON public.polygraph_admissions;
DROP POLICY IF EXISTS "Admins can insert polygraph admissions" ON public.polygraph_admissions;
DROP POLICY IF EXISTS "Admins can update polygraph admissions" ON public.polygraph_admissions;
DROP POLICY IF EXISTS "Admins can delete polygraph admissions" ON public.polygraph_admissions;

CREATE POLICY "Admins can view all polygraph admissions" 
ON public.polygraph_admissions 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can insert polygraph admissions" 
ON public.polygraph_admissions 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update polygraph admissions" 
ON public.polygraph_admissions 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete polygraph admissions" 
ON public.polygraph_admissions 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Update polygraph_exam_questions policies
DROP POLICY IF EXISTS "Admins can view all polygraph exam questions" ON public.polygraph_exam_questions;
DROP POLICY IF EXISTS "Admins can insert polygraph exam questions" ON public.polygraph_exam_questions;
DROP POLICY IF EXISTS "Admins can update polygraph exam questions" ON public.polygraph_exam_questions;
DROP POLICY IF EXISTS "Admins can delete polygraph exam questions" ON public.polygraph_exam_questions;

CREATE POLICY "Admins can view all polygraph exam questions" 
ON public.polygraph_exam_questions 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can insert polygraph exam questions" 
ON public.polygraph_exam_questions 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update polygraph exam questions" 
ON public.polygraph_exam_questions 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete polygraph exam questions" 
ON public.polygraph_exam_questions 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Update polygraph_candidates policies
DROP POLICY IF EXISTS "Admins can view all polygraph candidates" ON public.polygraph_candidates;
DROP POLICY IF EXISTS "Admins can insert polygraph candidates" ON public.polygraph_candidates;
DROP POLICY IF EXISTS "Admins can update polygraph candidates" ON public.polygraph_candidates;
DROP POLICY IF EXISTS "Admins can delete polygraph candidates" ON public.polygraph_candidates;

CREATE POLICY "Admins can view all polygraph candidates" 
ON public.polygraph_candidates 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can insert polygraph candidates" 
ON public.polygraph_candidates 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update polygraph candidates" 
ON public.polygraph_candidates 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete polygraph candidates" 
ON public.polygraph_candidates 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));