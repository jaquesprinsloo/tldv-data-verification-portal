GRANT EXECUTE ON FUNCTION public.has_account_access(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.has_store_access(uuid, uuid) TO anon;
ANALYZE public.manual_risk_submissions;
ANALYZE public.manual_risk_candidates;