-- FIX 1: Update can_access_submission() to verify data ownership
-- Currently allows ANY active employee to access ANY employee's data
CREATE OR REPLACE FUNCTION public.can_access_submission(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = _employee_id
      AND employment_status = 'active'
      AND (user_id = auth.uid() OR auth.uid() IS NULL)
  )
$$;

-- FIX 2: Make sensitive storage buckets private
UPDATE storage.buckets 
SET public = false 
WHERE id IN ('invoices', 'polygraph-reports');

-- Add proper RLS policy for polygraph-reports bucket (invoices already has policies)
DROP POLICY IF EXISTS "Authenticated users can view polygraph reports" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view polygraph reports" ON storage.objects;

CREATE POLICY "Admins can view polygraph reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'polygraph-reports'
  AND (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()))
);