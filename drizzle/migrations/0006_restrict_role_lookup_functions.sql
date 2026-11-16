CREATE OR REPLACE FUNCTION public._can_inspect_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(auth.role(), '') NOT IN ('anon', 'authenticated')
    OR (_user_id IS NOT NULL AND _user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'master_admin')
$$;
REVOKE EXECUTE ON FUNCTION public._can_inspect_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._can_inspect_user(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._can_inspect_user(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master_admin')
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS SETOF app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id AND public._can_inspect_user(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._can_inspect_user(_user_id) AND COALESCE(
    (SELECT granted FROM public.user_permissions WHERE user_id = _user_id AND permission_key = _permission_key), false)
$$;

CREATE OR REPLACE FUNCTION public.check_user_access(_user_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._can_inspect_user(_user_id) AND (public.is_master_admin(_user_id) OR public.has_permission(_user_id, _permission_key))
$$;

CREATE OR REPLACE FUNCTION public.has_account_access(_user_id uuid, _account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._can_inspect_user(_user_id) AND (public.is_master_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.account_access WHERE user_id = _user_id AND account_id = _account_id))
$$;

CREATE OR REPLACE FUNCTION public.has_store_access(_user_id uuid, _store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._can_inspect_user(_user_id) AND (public.is_master_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store_id AND public.has_account_access(_user_id, s.account_id)))
$$;