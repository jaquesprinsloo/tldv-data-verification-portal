
CREATE TABLE IF NOT EXISTS public.candex_ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES public.candex_applications(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  usd_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candex_ai_usage_application ON public.candex_ai_usage(application_id);
CREATE INDEX IF NOT EXISTS idx_candex_ai_usage_created ON public.candex_ai_usage(created_at DESC);

ALTER TABLE public.candex_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins can view all AI usage"
  ON public.candex_ai_usage
  FOR SELECT
  TO authenticated
  USING (is_master_admin(auth.uid()));

CREATE POLICY "Admins can view AI usage"
  ON public.candex_ai_usage
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
