-- Add risk analysis fields to polygraph_reports table
ALTER TABLE public.polygraph_reports 
ADD COLUMN IF NOT EXISTS risk_score integer,
ADD COLUMN IF NOT EXISTS risk_level text CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'UNACCEPTABLE')),
ADD COLUMN IF NOT EXISTS risk_analysis jsonb,
ADD COLUMN IF NOT EXISTS extracted_disclosure jsonb,
ADD COLUMN IF NOT EXISTS education_history jsonb,
ADD COLUMN IF NOT EXISTS employment_history jsonb,
ADD COLUMN IF NOT EXISTS family_criminal_history jsonb,
ADD COLUMN IF NOT EXISTS friend_criminal_history jsonb,
ADD COLUMN IF NOT EXISTS financial_circumstances jsonb,
ADD COLUMN IF NOT EXISTS permits_licensing jsonb,
ADD COLUMN IF NOT EXISTS personal_law_encounters jsonb,
ADD COLUMN IF NOT EXISTS post_exam_admissions text;