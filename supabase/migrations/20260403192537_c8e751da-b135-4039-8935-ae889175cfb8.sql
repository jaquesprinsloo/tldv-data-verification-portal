
-- Table for risk assessment requests from clients
CREATE TABLE public.candex_risk_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.candex_clients(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL,
  requested_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Junction table for candidates in a risk request
CREATE TABLE public.candex_risk_request_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.candex_risk_requests(id) ON DELETE CASCADE NOT NULL,
  application_id uuid REFERENCES public.candex_applications(id) ON DELETE CASCADE NOT NULL,
  id_verified boolean DEFAULT false,
  risk_assessment_result text,
  risk_assessment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candex_risk_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candex_risk_request_candidates ENABLE ROW LEVEL SECURITY;

-- Admins can view their own requests, master admins see all
CREATE POLICY "Admin view own risk requests" ON public.candex_risk_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR is_master_admin(auth.uid()));

CREATE POLICY "Admin insert risk requests" ON public.candex_risk_requests
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Master admin manage risk requests" ON public.candex_risk_requests
  FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));

CREATE POLICY "Admin view risk request candidates" ON public.candex_risk_request_candidates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.candex_risk_requests r WHERE r.id = request_id AND (r.requested_by = auth.uid() OR is_master_admin(auth.uid())))
  );

CREATE POLICY "Admin insert risk request candidates" ON public.candex_risk_request_candidates
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.candex_risk_requests r WHERE r.id = request_id AND (r.requested_by = auth.uid() OR is_master_admin(auth.uid())))
  );

CREATE POLICY "Master admin manage risk request candidates" ON public.candex_risk_request_candidates
  FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));
