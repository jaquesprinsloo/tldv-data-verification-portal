-- Fix 1: Update can_access_submission() to require authentication (remove anonymous access)
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
      AND user_id = auth.uid()
      AND auth.uid() IS NOT NULL
  )
$$;

-- Fix 2: Update assign_user_role() to require master_admin authorization
CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only master admins can assign roles
  IF NOT is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only master admins can assign roles';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN true;
END;
$$;

-- Fix 3: Update remove_user_role() to require master_admin authorization
CREATE OR REPLACE FUNCTION public.remove_user_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only master admins can remove roles
  IF NOT is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only master admins can remove roles';
  END IF;
  
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role = _role;
  
  RETURN FOUND;
END;
$$;