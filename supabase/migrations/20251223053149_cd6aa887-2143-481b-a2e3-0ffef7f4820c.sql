-- Create polygraph_batches table to group reports
CREATE TABLE public.polygraph_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  examination_date DATE NOT NULL DEFAULT CURRENT_DATE,
  store_id UUID REFERENCES public.stores(id),
  examiner_id UUID REFERENCES public.examiners(id),
  invoice_id UUID REFERENCES public.invoices(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'approved')),
  total_reports INTEGER NOT NULL DEFAULT 0,
  processed_reports INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add batch_id to polygraph_reports
ALTER TABLE public.polygraph_reports ADD COLUMN batch_id UUID REFERENCES public.polygraph_batches(id);

-- Create index for faster lookups
CREATE INDEX idx_polygraph_reports_batch_id ON public.polygraph_reports(batch_id);
CREATE INDEX idx_polygraph_batches_store_id ON public.polygraph_batches(store_id);
CREATE INDEX idx_polygraph_batches_status ON public.polygraph_batches(status);

-- Enable RLS on polygraph_batches
ALTER TABLE public.polygraph_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for polygraph_batches
CREATE POLICY "Admins can view all polygraph batches"
ON public.polygraph_batches
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can insert polygraph batches"
ON public.polygraph_batches
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update polygraph batches"
ON public.polygraph_batches
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete polygraph batches"
ON public.polygraph_batches
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'master_admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_polygraph_batches_updated_at
BEFORE UPDATE ON public.polygraph_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();