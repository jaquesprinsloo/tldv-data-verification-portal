ALTER TABLE public.candex_template_questions
  ADD COLUMN IF NOT EXISTS prefill_target jsonb;