CREATE TABLE public.manual_risk_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_key text NOT NULL UNIQUE,
  label text NOT NULL,
  supplier_cost numeric NOT NULL DEFAULT 0,
  client_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_pricing TO authenticated;
GRANT ALL ON public.manual_risk_pricing TO service_role;
ALTER TABLE public.manual_risk_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage manual risk pricing" ON public.manual_risk_pricing FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));
CREATE TRIGGER trg_mr_pricing_updated BEFORE UPDATE ON public.manual_risk_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.manual_risk_supplier_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  period_start date,
  period_end date,
  source_file_name text,
  supplier_invoice_number text,
  supplier_invoice_total numeric,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_supplier_batches TO authenticated;
GRANT ALL ON public.manual_risk_supplier_batches TO service_role;
ALTER TABLE public.manual_risk_supplier_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage supplier batches" ON public.manual_risk_supplier_batches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));
CREATE TRIGGER trg_mr_supplier_batches_updated BEFORE UPDATE ON public.manual_risk_supplier_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.manual_risk_supplier_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.manual_risk_supplier_batches(id) ON DELETE CASCADE,
  enquiry_no text,
  supplier_created_at timestamptz,
  internal_order_number text,
  cost_centre text,
  contact_name text,
  full_name text,
  id_number text,
  passport text,
  dob date,
  gender text,
  check_status text,
  check_title text,
  check_result text,
  check_key text,
  matched_candidate_id uuid REFERENCES public.manual_risk_candidates(id) ON DELETE SET NULL,
  matched_submission_id uuid REFERENCES public.manual_risk_submissions(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'unmatched',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mr_supplier_lines_batch ON public.manual_risk_supplier_lines(batch_id);
CREATE INDEX idx_mr_supplier_lines_id_number ON public.manual_risk_supplier_lines(id_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_supplier_lines TO authenticated;
GRANT ALL ON public.manual_risk_supplier_lines TO service_role;
ALTER TABLE public.manual_risk_supplier_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage supplier lines" ON public.manual_risk_supplier_lines FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));

INSERT INTO public.manual_risk_pricing (item_key, label, supplier_cost, client_price) VALUES
  ('risk_assessment', 'Risk Assessment', 0, 0),
  ('id_verification', 'ID Verification', 0, 0),
  ('criminal', 'Criminal Check', 0, 0),
  ('credit', 'Credit Check', 0, 0),
  ('drivers_license', 'Driver''s License Verification', 0, 0),
  ('pdp', 'PDP Verification', 0, 0),
  ('qualification', 'Qualification Verification', 0, 0),
  ('discount_tldv_internal', 'TLDV Internal discount (%)', 0, 100),
  ('discount_ptvs', 'PTVS discount (%)', 0, 0);