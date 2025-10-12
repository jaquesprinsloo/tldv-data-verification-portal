-- Create enum for request types
CREATE TYPE request_type AS ENUM ('data_management', 'polygraph_vetting', 'reports_accounts', 'general');

-- Create enum for request status
CREATE TYPE request_status AS ENUM ('pending', 'in_progress', 'replied', 'closed');

-- Create profile_requests table
CREATE TABLE public.profile_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type request_type NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create request_replies table
CREATE TABLE public.request_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.profile_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profile_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_replies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profile_requests
CREATE POLICY "Users can view their own requests"
ON public.profile_requests
FOR SELECT
USING (sender_user_id = auth.uid());

CREATE POLICY "Users can create requests"
ON public.profile_requests
FOR INSERT
WITH CHECK (sender_user_id = auth.uid());

CREATE POLICY "Master admins can view all requests"
ON public.profile_requests
FOR SELECT
USING (is_master_admin(auth.uid()));

CREATE POLICY "Master admins can update requests"
ON public.profile_requests
FOR UPDATE
USING (is_master_admin(auth.uid()));

-- RLS Policies for request_replies
CREATE POLICY "Users can view replies to their requests"
ON public.request_replies
FOR SELECT
USING (
  request_id IN (
    SELECT id FROM public.profile_requests WHERE sender_user_id = auth.uid()
  )
);

CREATE POLICY "Master admins can view all replies"
ON public.request_replies
FOR SELECT
USING (is_master_admin(auth.uid()));

CREATE POLICY "Master admins can create replies"
ON public.request_replies
FOR INSERT
WITH CHECK (is_master_admin(auth.uid()));

-- Create trigger to update updated_at
CREATE TRIGGER update_profile_requests_updated_at
BEFORE UPDATE ON public.profile_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to get master admin email
CREATE OR REPLACE FUNCTION public.get_master_admin_email()
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM auth.users
  WHERE id IN (
    SELECT user_id FROM public.user_roles WHERE role = 'master_admin'
  )
  LIMIT 1;
$$;