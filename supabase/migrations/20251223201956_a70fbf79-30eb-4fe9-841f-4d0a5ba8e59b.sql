-- Improve has_employee_access to handle NULL store_id and multi-store assignments
CREATE OR REPLACE FUNCTION public.has_employee_access(_user_id uuid, _employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- Require valid parameters
    _user_id IS NOT NULL
    AND _employee_id IS NOT NULL
    AND (
      -- Master admins have full access
      is_master_admin(_user_id)
      OR 
      -- Admins can access employees in their assigned stores
      (
        has_role(_user_id, 'admin'::app_role)
        AND (
          -- Check primary store assignment
          EXISTS (
            SELECT 1 
            FROM public.employees e
            JOIN public.stores s ON e.store_id = s.id
            WHERE e.id = _employee_id
              AND s.account_id IS NOT NULL
              AND has_account_access(_user_id, s.account_id)
          )
          OR
          -- Check secondary store assignments
          EXISTS (
            SELECT 1
            FROM public.employee_store_assignments esa
            JOIN public.stores s ON esa.store_id = s.id
            WHERE esa.employee_id = _employee_id
              AND s.account_id IS NOT NULL
              AND has_account_access(_user_id, s.account_id)
          )
        )
      )
    )
$$;

-- Improve can_access_submission to be more explicit
CREATE OR REPLACE FUNCTION public.can_access_submission(_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    -- Require authentication
    auth.uid() IS NOT NULL
    AND
    -- Require valid employee_id
    _employee_id IS NOT NULL
    AND
    -- Verify the authenticated user owns this employee record and is active
    EXISTS (
      SELECT 1
      FROM public.employees
      WHERE id = _employee_id
        AND user_id = auth.uid()
        AND employment_status = 'active'
    )
$$;