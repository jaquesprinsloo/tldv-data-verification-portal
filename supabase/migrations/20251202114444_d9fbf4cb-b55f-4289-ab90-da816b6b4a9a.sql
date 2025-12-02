-- Create account_access table to link admins to accounts
CREATE TABLE public.account_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID NOT NULL,
    granted_by UUID,
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(account_id, user_id)
);

-- Enable RLS
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;

-- Master admins can manage all account access
CREATE POLICY "Master admins can manage account access" ON public.account_access
FOR ALL USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

-- Admins can view their own access records
CREATE POLICY "Admins can view own access" ON public.account_access
FOR SELECT USING (user_id = auth.uid());

-- Create function to check if user has access to an account
CREATE OR REPLACE FUNCTION public.has_account_access(_user_id UUID, _account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Master admins have access to all accounts
    is_master_admin(_user_id) 
    OR 
    -- Or user has explicit access
    EXISTS (
      SELECT 1 FROM public.account_access 
      WHERE user_id = _user_id AND account_id = _account_id
    )
$$;

-- Add audit trigger
CREATE TRIGGER audit_account_access 
AFTER INSERT OR UPDATE OR DELETE ON public.account_access 
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();