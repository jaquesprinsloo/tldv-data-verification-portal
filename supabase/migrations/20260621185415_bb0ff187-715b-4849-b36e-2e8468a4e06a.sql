
-- =========================================================================
-- 1. CANDEX INVITATIONS — replace permissive anon policies with token RPCs
-- =========================================================================

DROP POLICY IF EXISTS "Anon can read invitation by token" ON public.candex_invitations;
DROP POLICY IF EXISTS "Anon can view invitations by token lookup" ON public.candex_invitations;
DROP POLICY IF EXISTS "Anon can update invitation status" ON public.candex_invitations;
DROP POLICY IF EXISTS "Anon can update invitation status only" ON public.candex_invitations;

-- Token-scoped invitation lookup (replaces broad anon SELECT)
CREATE OR REPLACE FUNCTION public.get_candex_invitation_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_has_app boolean;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv
  FROM candex_invitations
  WHERE token = _token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM candex_applications
    WHERE invitation_id = v_inv.id AND deleted_at IS NULL
  ) INTO v_has_app;

  RETURN jsonb_build_object(
    'id', v_inv.id,
    'client_id', v_inv.client_id,
    'template_id', v_inv.template_id,
    'candidate_name', v_inv.candidate_name,
    'candidate_email', v_inv.candidate_email,
    'candidate_phone', v_inv.candidate_phone,
    'candidate_id_number', v_inv.candidate_id_number,
    'status', v_inv.status,
    'token', v_inv.token,
    'has_application', v_has_app
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_candex_invitation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_candex_invitation_by_token(text) TO anon, authenticated;

-- =========================================================================
-- 2. CANDEX APPLICATIONS — submission via RPC, drop permissive anon policies
-- =========================================================================

DROP POLICY IF EXISTS "Anon can create candex application" ON public.candex_applications;
DROP POLICY IF EXISTS "Anon can submit applications with valid invitation" ON public.candex_applications;
DROP POLICY IF EXISTS "Anon can read candex applications they just submitted" ON public.candex_applications;

CREATE OR REPLACE FUNCTION public.submit_candex_application(
  _token text,
  _candidate_name text,
  _candidate_email text,
  _candidate_phone text,
  _candidate_id_number text,
  _answers jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_app_id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  SELECT * INTO v_inv
  FROM candex_invitations
  WHERE token = _token
    AND status = ANY (ARRAY['sent','opened']);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  INSERT INTO candex_applications (
    invitation_id, client_id, template_id,
    candidate_name, candidate_email, candidate_phone, candidate_id_number,
    status, submitted_at, answers
  ) VALUES (
    v_inv.id, v_inv.client_id, v_inv.template_id,
    COALESCE(NULLIF(_candidate_name, ''), v_inv.candidate_name),
    COALESCE(NULLIF(_candidate_email, ''), v_inv.candidate_email),
    COALESCE(NULLIF(_candidate_phone, ''), v_inv.candidate_phone),
    COALESCE(NULLIF(_candidate_id_number, ''), v_inv.candidate_id_number),
    'submitted', now(), COALESCE(_answers, '{}'::jsonb)
  )
  RETURNING id INTO v_app_id;

  UPDATE candex_invitations
  SET status = 'completed', updated_at = now()
  WHERE id = v_inv.id;

  RETURN v_app_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_candex_application(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_candex_application(text, text, text, text, text, jsonb) TO anon, authenticated;

-- =========================================================================
-- 3. PROFILES — restrict insert to own user id
-- =========================================================================

DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- =========================================================================
-- 4. STORAGE — restrict private bucket uploads to authenticated + path owner
-- =========================================================================

DROP POLICY IF EXISTS "Public can upload employee IDs" ON storage.objects;
CREATE POLICY "Authenticated can upload own employee IDs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-ids'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Public can upload proof of residence with path" ON storage.objects;
CREATE POLICY "Authenticated can upload own proof of residence"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proof-of-residence'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Public can upload employee selfies" ON storage.objects;
-- Existing "Employees can upload own selfies" already enforces auth.uid()/path

-- =========================================================================
-- 5. CANDEX-SELFIES bucket — stop bucket listing, tighten upload path format
-- =========================================================================

-- Drop broad public SELECT on the bucket (allowed listing). Files remain
-- accessible via getPublicUrl/CDN because the bucket is public.
DROP POLICY IF EXISTS "Anyone can view candex selfies" ON storage.objects;

DROP POLICY IF EXISTS "Anyone can upload candex selfies" ON storage.objects;
CREATE POLICY "Anon can upload candex selfies with valid path"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'candex-selfies'
    -- Require <YYYY-MM-DD>/<uuid>.<ext> structure produced by the candidate flow
    AND name ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  );

-- =========================================================================
-- 6. EXAMINERS storage — scope to assigned cases
-- =========================================================================

DROP POLICY IF EXISTS "Examiners can view polygraph reports" ON storage.objects;
CREATE POLICY "Examiners can view assigned polygraph reports"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'polygraph-reports'
    AND has_role(auth.uid(), 'examiner'::app_role)
    AND EXISTS (
      SELECT 1
      FROM polygraph_appointment_candidates pac
      JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
      WHERE pa.assigned_examiner_user_id = auth.uid()
        AND (
          position(pac.application_id::text in storage.objects.name) > 0
          OR position(pa.id::text in storage.objects.name) > 0
        )
    )
  );

DROP POLICY IF EXISTS "Examiners can view assigned candidate documents" ON storage.objects;
CREATE POLICY "Examiners can view assigned candidate docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND has_role(auth.uid(), 'examiner'::app_role)
    AND EXISTS (
      SELECT 1
      FROM polygraph_appointment_candidates pac
      JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
      WHERE pa.assigned_examiner_user_id = auth.uid()
        AND position(pac.application_id::text in storage.objects.name) > 0
    )
  );

-- =========================================================================
-- 7. REALTIME — stop broadcasting polygraph_appointments (no subscribers in app)
-- =========================================================================

ALTER PUBLICATION supabase_realtime DROP TABLE public.polygraph_appointments;

-- =========================================================================
-- 8. SECURITY DEFINER function executability — least privilege
-- =========================================================================

-- Internal helpers called only by RLS or admin code — drop anon access
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_account_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_store_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_user_access(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.constant_time_compare(text, text) FROM anon, authenticated;

-- Admin-only management functions — only service_role / master admin in-app
REVOKE EXECUTE ON FUNCTION public.assign_user_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_user_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_master_admin_email() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_trail() FROM anon, authenticated;
