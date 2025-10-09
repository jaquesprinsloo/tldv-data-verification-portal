-- Remove store_id foreign key and column from employees
ALTER TABLE public.employees 
DROP COLUMN IF EXISTS store_id,
DROP COLUMN IF EXISTS unique_link_token,
DROP COLUMN IF EXISTS link_expires_at,
DROP COLUMN IF EXISTS email_verified;

-- Add index on employee_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_employee_number 
ON public.employees(employee_number);