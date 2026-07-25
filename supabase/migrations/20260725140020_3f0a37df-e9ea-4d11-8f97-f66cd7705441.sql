ALTER TABLE public.candex_template_sections
  ADD COLUMN IF NOT EXISTS is_pre_screening boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_if jsonb;

ALTER TABLE public.candex_section_tables
  ADD COLUMN IF NOT EXISTS visible_if jsonb;

ALTER TABLE public.candex_template_questions
  ADD COLUMN IF NOT EXISTS visible_if jsonb,
  ADD COLUMN IF NOT EXISTS prefill_target_question_id uuid;