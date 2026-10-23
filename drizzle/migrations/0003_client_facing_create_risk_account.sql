CREATE OR REPLACE FUNCTION public.create_manual_risk_account(_client_name text, _contact_person text DEFAULT NULL, _email text DEFAULT NULL, _cc_emails text DEFAULT NULL, _phone text DEFAULT NULL, _address text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_name text := btrim(_client_name);
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(), 'client_facing') OR public.is_master_admin(auth.uid())) THEN RAISE EXCEPTION 'Not authorised to create an account'; END IF;
 IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 200 THEN RAISE EXCEPTION 'Account name is required (maximum 200 characters)'; END IF;
 IF lower(regexp_replace(v_name, '\s+', ' ', 'g')) IN ('test', 'polygraph & truth verification services') THEN RAISE EXCEPTION 'This account name is reserved'; END IF;
 IF EXISTS (SELECT 1 FROM public.manual_risk_clients WHERE lower(btrim(client_name)) = lower(v_name)) THEN RAISE EXCEPTION 'An account with this name already exists'; END IF;
 INSERT INTO public.manual_risk_clients(client_name, contact_person, email, cc_emails, phone, address, created_by) VALUES (v_name, NULLIF(btrim(_contact_person), ''), NULLIF(btrim(_email), ''), NULLIF(btrim(_cc_emails), ''), NULLIF(btrim(_phone), ''), NULLIF(btrim(_address), ''), auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_manual_risk_account(text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_risk_account(text,text,text,text,text,text) TO authenticated, service_role;