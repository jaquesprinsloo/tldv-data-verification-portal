-- Add email field to employees table
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS email text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees(email);