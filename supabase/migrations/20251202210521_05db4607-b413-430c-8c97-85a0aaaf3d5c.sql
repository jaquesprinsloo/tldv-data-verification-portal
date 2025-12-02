-- Drop the existing constraint and add new one with VERY HIGH instead of UNACCEPTABLE
ALTER TABLE public.polygraph_reports DROP CONSTRAINT IF EXISTS polygraph_reports_risk_level_check;
ALTER TABLE public.polygraph_reports ADD CONSTRAINT polygraph_reports_risk_level_check CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'VERY HIGH'));

-- Update any existing records that have UNACCEPTABLE to VERY HIGH
UPDATE public.polygraph_reports SET risk_level = 'VERY HIGH' WHERE risk_level = 'UNACCEPTABLE';