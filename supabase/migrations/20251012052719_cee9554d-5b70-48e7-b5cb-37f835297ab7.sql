-- Create function to check if user is master admin
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = 'master_admin'
  )
$$;

-- RLS policy for master admins to manage user_roles
CREATE POLICY "Master admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_master_admin(auth.uid()))
WITH CHECK (public.is_master_admin(auth.uid()));