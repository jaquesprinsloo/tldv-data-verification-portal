
-- 1) Remove anon SELECT policies on template tables
DROP POLICY IF EXISTS "Anon can read candex sections" ON public.candex_template_sections;
DROP POLICY IF EXISTS "Anon can read candex section tables" ON public.candex_section_tables;
DROP POLICY IF EXISTS "Anon can read candex questions" ON public.candex_template_questions;

REVOKE SELECT ON public.candex_template_sections FROM anon;
REVOKE SELECT ON public.candex_section_tables FROM anon;
REVOKE SELECT ON public.candex_template_questions FROM anon;

-- 2) Create a SECURITY DEFINER RPC the candidate flow can call with a valid token
CREATE OR REPLACE FUNCTION public.get_candex_template_structure(_token text, _template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_sections jsonb;
  v_tables jsonb;
  v_questions jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 16 OR _template_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_inv
  FROM candex_invitations
  WHERE token = _token
    AND status = ANY (ARRAY['sent','opened','completed']);

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Token must match the requested template (no cross-template peeking)
  IF v_inv.template_id IS DISTINCT FROM _template_id THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb)
    INTO v_sections
  FROM candex_template_sections s
  WHERE s.template_id = _template_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_order), '[]'::jsonb)
    INTO v_tables
  FROM candex_section_tables t
  WHERE t.section_id IN (SELECT id FROM candex_template_sections WHERE template_id = _template_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.sort_order), '[]'::jsonb)
    INTO v_questions
  FROM candex_template_questions q
  WHERE q.section_id IN (SELECT id FROM candex_template_sections WHERE template_id = _template_id);

  RETURN jsonb_build_object(
    'sections', v_sections,
    'tables', v_tables,
    'questions', v_questions
  );
END;
$$;

-- 3) Lock down EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_candex_template_structure(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_candex_template_structure(text, uuid) TO anon, authenticated;

-- Trigger functions should never be callable directly by clients
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_trail() FROM PUBLIC, anon, authenticated;

-- Candidate-flow RPCs: required for the unauthenticated candidate experience.
-- Revoke broad PUBLIC and re-grant explicitly to anon + authenticated only.
REVOKE EXECUTE ON FUNCTION public.get_candex_invitation_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_candex_invitation_by_token(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_candex_invitation_opened(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_candex_invitation_opened(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_candex_application(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_candex_application(text, text, text, text, text, jsonb) TO anon, authenticated;
