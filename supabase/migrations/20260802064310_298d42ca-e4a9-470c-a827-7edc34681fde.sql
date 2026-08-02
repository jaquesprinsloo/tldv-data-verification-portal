CREATE TABLE public.manual_risk_invoice_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.manual_risk_clients(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT current_date,
  invoice_file_path text,
  invoice_file_name text,
  invoice_onedrive_web_url text,
  invoice_onedrive_item_id text,
  invoice_onedrive_path text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_risk_invoice_batches TO authenticated;
GRANT ALL ON public.manual_risk_invoice_batches TO service_role;

ALTER TABLE public.manual_risk_invoice_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins manage manual_risk_invoice_batches"
ON public.manual_risk_invoice_batches
FOR ALL
TO authenticated
USING (is_master_admin(auth.uid()))
WITH CHECK (is_master_admin(auth.uid()));

CREATE TRIGGER update_manual_risk_invoice_batches_updated_at
BEFORE UPDATE ON public.manual_risk_invoice_batches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.manual_risk_candidates
  ADD COLUMN invoice_batch_id uuid REFERENCES public.manual_risk_invoice_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_mr_candidates_invoice_batch ON public.manual_risk_candidates(invoice_batch_id);