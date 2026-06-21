
-- Revoke default PUBLIC grant from every SECURITY DEFINER function, then grant
-- only to the roles that actually need to call each one.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_account_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_account_access(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_store_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_store_access(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_user_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_user_access(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.constant_time_compare(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.constant_time_compare(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_master_admin_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_master_admin_email() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_trail() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_trail() TO service_role;

-- Functions invoked by the unauthenticated candidate application flow
REVOKE EXECUTE ON FUNCTION public.mark_candex_invitation_opened(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_candex_invitation_opened(text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_candex_invitation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_candex_invitation_by_token(text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_candex_application(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_candex_application(text, text, text, text, text, jsonb) TO anon, authenticated, service_role;
