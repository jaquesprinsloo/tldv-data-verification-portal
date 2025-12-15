-- Add relationship column to next_of_kin table
ALTER TABLE public.next_of_kin
ADD COLUMN relationship text;

-- Update the add_next_of_kin function to accept relationship parameter
CREATE OR REPLACE FUNCTION public.add_next_of_kin(
  _submission_id uuid, 
  _first_name text, 
  _last_name text, 
  _contact_number text, 
  _address text,
  _relationship text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next_of_kin_id uuid;
  v_employee_id uuid;
  v_user_id uuid;
BEGIN
  -- Get the employee_id from the submission
  SELECT employee_id INTO v_employee_id
  FROM public.submissions
  WHERE id = _submission_id;
  
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Invalid submission ID';
  END IF;
  
  -- Check if the calling user owns this submission
  -- Either they are the employee who created the submission
  -- OR they are an admin
  SELECT e.user_id INTO v_user_id
  FROM public.employees e
  WHERE e.id = v_employee_id;
  
  IF v_user_id IS NOT NULL AND v_user_id != auth.uid() THEN
    -- Check if user is admin
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Unauthorized: You can only add next of kin to your own submissions';
    END IF;
  END IF;
  
  -- Insert next of kin
  INSERT INTO public.next_of_kin (
    submission_id,
    first_name,
    last_name,
    contact_number,
    address,
    relationship
  ) VALUES (
    _submission_id,
    _first_name,
    _last_name,
    _contact_number,
    _address,
    _relationship
  )
  RETURNING id INTO v_next_of_kin_id;
  
  RETURN v_next_of_kin_id;
END;
$function$;