-- Create user_permissions table to store granular access permissions
CREATE TABLE public.user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT false,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    granted_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, permission_key)
);

-- Enable RLS
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Create policy for master admins to manage all permissions
CREATE POLICY "Master admins can manage all permissions" 
ON public.user_permissions 
FOR ALL 
USING (public.is_master_admin(auth.uid()))
WITH CHECK (public.is_master_admin(auth.uid()));

-- Create policy for users to view their own permissions
CREATE POLICY "Users can view own permissions" 
ON public.user_permissions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create function to check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions 
     WHERE user_id = _user_id AND permission_key = _permission_key),
    false
  )
$$;

-- Create function to check if user is master_admin (has all permissions)
CREATE OR REPLACE FUNCTION public.check_user_access(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN public.is_master_admin(_user_id) THEN true
      ELSE public.has_permission(_user_id, _permission_key)
    END
$$;