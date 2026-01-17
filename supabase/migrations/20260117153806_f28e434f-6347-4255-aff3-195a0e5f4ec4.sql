-- Add time-based restriction to submission_history access
-- Historical data older than 7 years (2555 days) will only be accessible to master admins
-- Regular admins can only access historical data within the 7-year retention window

-- Drop the existing scoped admin view policy
DROP POLICY IF EXISTS "Scoped admin view submission_history" ON public.submission_history;

-- Create a new policy with time-based restrictions (7-year retention for regular admins)
CREATE POLICY "Scoped admin view submission_history"
  ON public.submission_history
  FOR SELECT
  USING (
    is_master_admin(auth.uid()) 
    OR (
      has_role(auth.uid(), 'admin'::app_role) 
      AND has_employee_access(auth.uid(), employee_id)
      AND submission_date > (CURRENT_DATE - INTERVAL '7 years')
    )
  );

-- Add a comment explaining the data retention policy
COMMENT ON TABLE public.submission_history IS 'Archived submission data. Regular admin access restricted to last 7 years per data retention policy. Master admins can access all historical data for compliance purposes.';