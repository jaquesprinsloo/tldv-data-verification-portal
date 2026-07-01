
-- 1. Examiner storage policies: replace substring matches with prefix matches
DROP POLICY IF EXISTS "Examiners can view assigned candidate docs" ON storage.objects;
DROP POLICY IF EXISTS "Examiners can view assigned candidate risk assessments" ON storage.objects;
DROP POLICY IF EXISTS "Examiners can view assigned polygraph reports" ON storage.objects;

CREATE POLICY "Examiners can view assigned candidate docs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'employee-documents'
  AND has_role(auth.uid(), 'examiner'::app_role)
  AND EXISTS (
    SELECT 1
    FROM polygraph_appointment_candidates pac
    JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
    WHERE pa.assigned_examiner_user_id = auth.uid()
      AND objects.name LIKE (pac.application_id::text || '/%')
  )
);

CREATE POLICY "Examiners can view assigned candidate risk assessments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'employee-documents'
  AND has_role(auth.uid(), 'examiner'::app_role)
  AND EXISTS (
    SELECT 1
    FROM polygraph_appointment_candidates pac
    JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
    JOIN candex_risk_request_candidates rrc ON rrc.application_id = pac.application_id
    WHERE pa.assigned_examiner_user_id = auth.uid()
      AND objects.name LIKE ('risk-assessments/' || rrc.id::text || '_%')
  )
);

CREATE POLICY "Examiners can view assigned polygraph reports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'polygraph-reports'
  AND has_role(auth.uid(), 'examiner'::app_role)
  AND EXISTS (
    SELECT 1
    FROM polygraph_appointment_candidates pac
    JOIN polygraph_appointments pa ON pa.id = pac.appointment_id
    WHERE pa.assigned_examiner_user_id = auth.uid()
      AND (
        objects.name LIKE (pac.application_id::text || '/%')
        OR objects.name LIKE (pa.id::text || '/%')
      )
  )
);

-- 2. Selfie upload requires valid active invitation token in path
CREATE OR REPLACE FUNCTION public.is_active_candex_invitation_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM candex_invitations
    WHERE token = _token
      AND status = ANY (ARRAY['sent','opened'])
  )
$$;

REVOKE ALL ON FUNCTION public.is_active_candex_invitation_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_candex_invitation_token(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anon can upload candex selfies with valid path" ON storage.objects;

CREATE POLICY "Anon can upload candex selfies with valid token"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'candex-selfies'
  AND name ~ '^[a-f0-9]{32}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  AND public.is_active_candex_invitation_token((storage.foldername(name))[1])
);

-- 3. Remove direct anon read on templates; expose only whitelisted video fields via RPC
DROP POLICY IF EXISTS "Anon can read active candex templates" ON candex_questionnaire_templates;

CREATE OR REPLACE FUNCTION public.get_candex_template_videos_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_tpl record;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv FROM candex_invitations
  WHERE token = _token
    AND status = ANY (ARRAY['sent','opened','completed']);
  IF NOT FOUND OR v_inv.template_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT intro_video_url, brief_video_url INTO v_tpl
  FROM candex_questionnaire_templates
  WHERE id = v_inv.template_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'intro_video_url', v_tpl.intro_video_url,
    'brief_video_url', v_tpl.brief_video_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_candex_template_videos_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_candex_template_videos_by_token(text) TO anon, authenticated;
