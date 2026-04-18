-- Add soft delete columns to candex_applications
ALTER TABLE public.candex_applications
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text;

-- Add soft delete columns to polygraph_appointments
ALTER TABLE public.polygraph_appointments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text;

-- Add soft delete columns to candex_risk_request_candidates
ALTER TABLE public.candex_risk_request_candidates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text;