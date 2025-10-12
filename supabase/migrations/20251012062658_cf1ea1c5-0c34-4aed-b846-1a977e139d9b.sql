-- Allow users to create replies to their own requests
CREATE POLICY "Users can create replies to their requests"
ON public.request_replies
FOR INSERT
WITH CHECK (
  request_id IN (
    SELECT id FROM public.profile_requests
    WHERE sender_user_id = auth.uid()
  )
);