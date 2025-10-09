-- Add RLS policy to allow admins to update submissions
CREATE POLICY "Admins can update all submissions"
ON public.submissions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update geofence verification to use 15 meter threshold instead of current value
-- This will be applied when new submissions are created