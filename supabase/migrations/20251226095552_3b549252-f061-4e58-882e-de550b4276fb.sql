-- Update create_verified_submission to update employee master profile timestamps after a submission
CREATE OR REPLACE FUNCTION public.create_verified_submission(submission_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_id uuid;
  v_submission_id uuid;
  v_is_valid boolean;
BEGIN
  -- Verify employee credentials first
  SELECT is_valid, employee_id
  INTO v_is_valid, v_employee_id
  FROM public.verify_employee_credentials(
    submission_data->>'employee_number',
    submission_data->>'id_number'
  );

  IF NOT v_is_valid OR v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Invalid employee credentials';
  END IF;

  -- Check rate limit
  IF NOT public.check_submission_rate_limit(submission_data->>'employee_number') THEN
    RAISE EXCEPTION 'Submission rate limit exceeded. Please wait before submitting again.';
  END IF;

  -- Generate submission ID
  v_submission_id := gen_random_uuid();

  -- Insert submission with validated employee_id
  INSERT INTO public.submissions (
    id,
    employee_id,
    employee_number,
    id_number,
    first_name,
    last_name,
    email,
    contact_number,
    physical_address,
    house_number,
    floor_number,
    street_name,
    complex_name,
    suburb,
    city,
    province,
    postal_code,
    geolocation_lat,
    geolocation_lng,
    geofence_verified,
    geofence_distance_meters,
    proof_of_residence_url,
    id_photo_url,
    status,
    flagged,
    flag_reason,
    verification_token,
    verification_token_expires_at
  ) VALUES (
    v_submission_id,
    v_employee_id,
    submission_data->>'employee_number',
    submission_data->>'id_number',
    submission_data->>'first_name',
    submission_data->>'last_name',
    submission_data->>'email',
    submission_data->>'contact_number',
    submission_data->>'physical_address',
    submission_data->>'house_number',
    submission_data->>'floor_number',
    submission_data->>'street_name',
    submission_data->>'complex_name',
    submission_data->>'suburb',
    submission_data->>'city',
    submission_data->>'province',
    submission_data->>'postal_code',
    (submission_data->>'geolocation_lat')::numeric,
    (submission_data->>'geolocation_lng')::numeric,
    (submission_data->>'geofence_verified')::boolean,
    (submission_data->>'geofence_distance_meters')::numeric,
    submission_data->>'proof_of_residence_url',
    submission_data->>'id_photo_url',
    COALESCE((submission_data->>'status')::submission_status, 'pending'::submission_status),
    COALESCE((submission_data->>'flagged')::boolean, false),
    submission_data->>'flag_reason',
    submission_data->>'verification_token',
    (submission_data->>'verification_token_expires_at')::timestamptz
  );

  -- Update the master employee profile so admins can immediately see the latest verification state
  UPDATE public.employees
  SET
    email = COALESCE(NULLIF(submission_data->>'email', ''), email),
    last_submission_date = now(),
    next_renewal_date = now() + interval '6 months',
    updated_at = now()
  WHERE id = v_employee_id;

  RETURN v_submission_id;
END;
$function$;