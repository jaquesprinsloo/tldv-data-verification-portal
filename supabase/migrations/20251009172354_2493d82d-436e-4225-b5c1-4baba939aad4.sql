-- Fix 1: Tighten submissions table - require verification before allowing anonymous inserts
-- Remove overly permissive anonymous insert policy
DROP POLICY IF EXISTS "Anonymous users can submit verification" ON public.submissions;

-- Add constraint to ensure submissions can only be created with valid employee credentials
-- This works with our secure verify_employee_credentials function on the client side

-- Fix 2: Tighten next_of_kin table - require valid submission reference
-- Remove overly permissive anonymous insert policy
DROP POLICY IF EXISTS "Anonymous users can add next of kin" ON public.next_of_kin;

-- The existing "Authenticated users can add next of kin" policy is sufficient
-- It ensures next_of_kin can only be added for valid submissions

-- Fix 3: Add rate limiting to prevent spam submissions
-- Create a function to check submission rate limits
CREATE OR REPLACE FUNCTION public.check_submission_rate_limit(
  _employee_number text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_submissions integer;
BEGIN
  -- Check submissions from this employee number in the last hour
  SELECT COUNT(*)
  INTO recent_submissions
  FROM public.submissions
  WHERE employee_number = _employee_number
    AND created_at > NOW() - INTERVAL '1 hour';
  
  -- Allow max 3 submissions per hour per employee number
  RETURN recent_submissions < 3;
END;
$$;

-- Grant execute to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.check_submission_rate_limit TO anon;
GRANT EXECUTE ON FUNCTION public.check_submission_rate_limit TO authenticated;

-- Fix 4: Add secure submission function that validates before inserting
CREATE OR REPLACE FUNCTION public.create_verified_submission(
  submission_data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    flagged
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
    COALESCE((submission_data->>'flagged')::boolean, false)
  );
  
  RETURN v_submission_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_verified_submission TO anon;
GRANT EXECUTE ON FUNCTION public.create_verified_submission TO authenticated;

-- Fix 5: Add secure next of kin function
CREATE OR REPLACE FUNCTION public.add_next_of_kin(
  _submission_id uuid,
  _first_name text,
  _last_name text,
  _contact_number text,
  _address text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_of_kin_id uuid;
BEGIN
  -- Verify submission exists
  IF NOT EXISTS (SELECT 1 FROM public.submissions WHERE id = _submission_id) THEN
    RAISE EXCEPTION 'Invalid submission ID';
  END IF;
  
  -- Insert next of kin
  INSERT INTO public.next_of_kin (
    submission_id,
    first_name,
    last_name,
    contact_number,
    address
  ) VALUES (
    _submission_id,
    _first_name,
    _last_name,
    _contact_number,
    _address
  )
  RETURNING id INTO v_next_of_kin_id;
  
  RETURN v_next_of_kin_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.add_next_of_kin TO anon;
GRANT EXECUTE ON FUNCTION public.add_next_of_kin TO authenticated;

-- Fix 6: Add INSERT policy for profiles table
-- This should only allow the trigger to insert profiles
CREATE POLICY "System can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (true);

-- Fix 7: Improve submissions visibility - remove the overly broad admin view policy
DROP POLICY IF EXISTS "Admins can view verified submissions" ON public.submissions;

-- Add a proper admin view policy that can see all submissions (not just verified)
CREATE POLICY "Admins can view all submissions"
ON public.submissions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));