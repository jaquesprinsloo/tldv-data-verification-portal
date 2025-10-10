-- Phase 1: Create popia_acceptances table
CREATE TABLE IF NOT EXISTS public.popia_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT NOT NULL,
  gps_latitude NUMERIC,
  gps_longitude NUMERIC,
  device_info JSONB,
  declaration_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Phase 2: Create renewal_requests table
CREATE TYPE renewal_request_status AS ENUM ('pending', 'sent', 'cancelled');

CREATE TABLE IF NOT EXISTS public.renewal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status renewal_request_status NOT NULL DEFAULT 'pending',
  requested_via TEXT NOT NULL DEFAULT 'email_link',
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Phase 3: Add employment status enum
CREATE TYPE employment_status AS ENUM ('active', 'dismissed', 'suspended', 'resigned');

-- Phase 4: Modify employees table
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS employment_status employment_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS dismissal_reason TEXT;

-- Phase 5: Modify employee_invitations table
ALTER TABLE public.employee_invitations 
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE;

-- Phase 6: Add unique constraint to prevent ID number reuse with same employee number
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_number_id_number 
  ON public.employees(employee_number, id_number);

-- Phase 7: Enable RLS on new tables
ALTER TABLE public.popia_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_requests ENABLE ROW LEVEL SECURITY;

-- Phase 8: RLS Policies for popia_acceptances
CREATE POLICY "Employees can view own POPIA acceptance"
  ON public.popia_acceptances
  FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all POPIA acceptances"
  ON public.popia_acceptances
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Employees can insert own POPIA acceptance"
  ON public.popia_acceptances
  FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Block unauthenticated access to popia_acceptances"
  ON public.popia_acceptances
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Phase 9: RLS Policies for renewal_requests
CREATE POLICY "Employees can view own renewal requests"
  ON public.renewal_requests
  FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all renewal requests"
  ON public.renewal_requests
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Employees can insert own renewal requests"
  ON public.renewal_requests
  FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update renewal requests"
  ON public.renewal_requests
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block unauthenticated access to renewal_requests"
  ON public.renewal_requests
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Phase 10: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_popia_acceptances_employee_id ON public.popia_acceptances(employee_id);
CREATE INDEX IF NOT EXISTS idx_renewal_requests_employee_id ON public.renewal_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_renewal_requests_status ON public.renewal_requests(status);
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON public.employees(employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_last_reminder_sent ON public.employees(last_reminder_sent);

-- Phase 11: Update next_renewal_date to 3 months (90 days) for existing records
UPDATE public.employees 
SET next_renewal_date = COALESCE(last_submission_date, created_at) + INTERVAL '90 days'
WHERE next_renewal_date IS NULL OR next_renewal_date < now();