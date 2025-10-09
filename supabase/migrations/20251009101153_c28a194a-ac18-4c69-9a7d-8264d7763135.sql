-- Fix: Add search_path to functions for security
-- This prevents potential SQL injection through search_path manipulation

-- Fix archive_old_submission trigger function
CREATE OR REPLACE FUNCTION public.archive_old_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Archive existing submission to history
  INSERT INTO public.submission_history (employee_id, submission_data, submission_date)
  SELECT 
    s.employee_id,
    row_to_json(s)::jsonb,
    s.submission_timestamp
  FROM public.submissions s
  WHERE s.employee_id = NEW.employee_id;
  
  -- Delete old submission
  DELETE FROM public.submissions WHERE employee_id = NEW.employee_id;
  
  RETURN NEW;
END;
$function$;

-- Fix update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix cleanup_old_audit_trail function
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_trail()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.submission_history
  WHERE archived_at < now() - INTERVAL '24 months';
END;
$function$;
