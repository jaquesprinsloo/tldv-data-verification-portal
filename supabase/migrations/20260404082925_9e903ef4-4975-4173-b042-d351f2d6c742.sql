
ALTER TABLE public.candex_clients
ADD COLUMN template_id uuid REFERENCES public.candex_questionnaire_templates(id) ON DELETE SET NULL;
