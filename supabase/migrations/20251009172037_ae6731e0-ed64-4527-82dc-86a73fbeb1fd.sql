-- Remove the public access policy that exposes sensitive data
DROP POLICY IF EXISTS "Public can verify employee numbers" ON public.employees;

-- Create a secure function to verify employee number and ID number match
-- This function only returns true/false and the employee ID if valid
-- It does NOT expose the actual ID numbers or employee numbers
CREATE OR REPLACE FUNCTION public.verify_employee_credentials(
  _employee_number text,
  _id_number text
)
RETURNS TABLE(is_valid boolean, employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true as is_valid,
    id as employee_id
  FROM public.employees
  WHERE employee_number = _employee_number
    AND id_number = _id_number
  LIMIT 1;
$$;

-- Grant execute permission to anonymous users (needed for form submission)
GRANT EXECUTE ON FUNCTION public.verify_employee_credentials TO anon;
GRANT EXECUTE ON FUNCTION public.verify_employee_credentials TO authenticated;