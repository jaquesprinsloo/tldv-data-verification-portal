-- Ensure RLS is enabled (safe if already enabled)
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own permissions (so UI can show granted features)
CREATE POLICY "Users can read own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow master admins to manage permissions for others
CREATE POLICY "Master admins can view all permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Master admins can grant permissions"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Master admins can update permissions"
ON public.user_permissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Master admins can revoke permissions"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'));
