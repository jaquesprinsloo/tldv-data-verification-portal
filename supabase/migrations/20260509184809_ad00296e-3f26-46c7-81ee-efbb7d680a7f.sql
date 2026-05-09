
DROP FUNCTION IF EXISTS public.add_next_of_kin(uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.add_next_of_kin(uuid, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_invitation_token(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_invitation_token(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_invitation_token_and_create_user(text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.approve_polygraph_candidate(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.archive_old_submission() CASCADE;
DROP FUNCTION IF EXISTS public.can_access_submission(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.check_submission_rate_limit(text) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_invitation_locks() CASCADE;
DROP FUNCTION IF EXISTS public.create_verified_submission(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.get_employees_by_store(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_employee_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.link_employee_to_user(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.verify_employee_credentials(text, text) CASCADE;

DROP TABLE IF EXISTS public.invoice_examinations CASCADE;
DROP TABLE IF EXISTS public.next_of_kin CASCADE;
DROP TABLE IF EXISTS public.popia_acceptances CASCADE;
DROP TABLE IF EXISTS public.examinations CASCADE;
DROP TABLE IF EXISTS public.risk_assessments CASCADE;
DROP TABLE IF EXISTS public.polygraph_candidates CASCADE;
DROP TABLE IF EXISTS public.employee_documents CASCADE;
DROP TABLE IF EXISTS public.employee_invitations CASCADE;
DROP TABLE IF EXISTS public.employee_store_assignments CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.profile_requests CASCADE;

DROP TYPE IF EXISTS public.employment_status CASCADE;
DROP TYPE IF EXISTS public.examination_type CASCADE;
DROP TYPE IF EXISTS public.examination_result CASCADE;
DROP TYPE IF EXISTS public.designation CASCADE;
