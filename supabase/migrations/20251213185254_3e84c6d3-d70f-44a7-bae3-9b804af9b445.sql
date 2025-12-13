-- Create a backend helper to approve a polygraph candidate securely
CREATE OR REPLACE FUNCTION public.approve_polygraph_candidate(
  _candidate_id uuid
)
RETURNS TABLE (
  employee_id uuid,
  employee_number text,
  email text,
  token text,
  otp text,
  first_name text,
  last_name text
) AS $$
DECLARE
  v_candidate polygraph_candidates%ROWTYPE;
  v_employee employees%ROWTYPE;
  v_token text;
  v_otp text;
BEGIN
  -- Ensure caller is admin or master_admin
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch candidate
  SELECT * INTO v_candidate
  FROM public.polygraph_candidates
  WHERE id = _candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found';
  END IF;

  IF v_candidate.status <> 'pending_review' THEN
    RAISE EXCEPTION 'Candidate is not pending review';
  END IF;

  -- Create employee number (keep same logic pattern)
  v_employee.employee_number := 'PG' || right(extract(epoch from now())::bigint::text, 6);

  -- Insert employee
  INSERT INTO public.employees (
    employee_number,
    id_number,
    email,
    store_id,
    employment_status
  ) VALUES (
    v_employee.employee_number,
    v_candidate.id_number,
    v_candidate.email,
    v_candidate.store_id,
    'active'
  )
  RETURNING * INTO v_employee;

  -- Generate invitation token & OTP
  v_token := encode(gen_random_bytes(16), 'hex');
  v_otp := lpad((floor(100000 + random() * 900000))::int::text, 6, '0');

  -- Insert invitation
  INSERT INTO public.employee_invitations (
    employee_id,
    email,
    token,
    otp,
    invitation_method,
    created_by
  ) VALUES (
    v_employee.id,
    COALESCE(v_candidate.email, ''),
    v_token,
    v_otp,
    'polygraph_approval',
    auth.uid()
  );

  -- Update candidate status
  UPDATE public.polygraph_candidates
  SET
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    employee_id = v_employee.id,
    invitation_sent = true,
    invitation_token = v_token,
    invitation_sent_at = now()
  WHERE id = v_candidate.id;

  RETURN QUERY SELECT
    v_employee.id,
    v_employee.employee_number,
    v_candidate.email,
    v_token,
    v_otp,
    v_candidate.first_name,
    v_candidate.last_name;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;