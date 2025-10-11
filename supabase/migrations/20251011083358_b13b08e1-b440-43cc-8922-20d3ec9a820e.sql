-- Add designation enum
CREATE TYPE public.designation_type AS ENUM (
  'team_leader',
  'fdo',
  'manager', 
  'assistant_manager',
  'buyer',
  'sales_person',
  'cashier'
);

-- Update employment_status enum to include retrenched
ALTER TYPE public.employment_status ADD VALUE IF NOT EXISTS 'retrenched';

-- Add new columns to employees table
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS designation public.designation_type,
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dismissal_document_url text;

-- Create table for multi-store assignments (for Team Leaders and FDOs)
CREATE TABLE IF NOT EXISTS public.employee_store_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(employee_id, store_id)
);

-- Enable RLS on employee_store_assignments
ALTER TABLE public.employee_store_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for employee_store_assignments
CREATE POLICY "Admins can view all store assignments"
  ON public.employee_store_assignments
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage store assignments"
  ON public.employee_store_assignments
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to get employees by store (including multi-store assignments)
CREATE OR REPLACE FUNCTION public.get_employees_by_store(_store_id uuid)
RETURNS TABLE (
  employee_id uuid,
  employee_number text,
  id_number text,
  full_name text,
  designation designation_type,
  employment_status employment_status,
  is_primary_assignment boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    e.id as employee_id,
    e.employee_number,
    e.id_number,
    COALESCE(s.first_name || ' ' || s.last_name, '') as full_name,
    e.designation,
    e.employment_status,
    (e.store_id = _store_id) as is_primary_assignment
  FROM employees e
  LEFT JOIN submissions s ON s.employee_id = e.id
  WHERE e.store_id = _store_id
     OR e.id IN (
       SELECT employee_id 
       FROM employee_store_assignments 
       WHERE store_id = _store_id
     )
  ORDER BY full_name;
$$;