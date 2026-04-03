
CREATE TABLE public.candex_section_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.candex_template_sections(id) ON DELETE CASCADE,
  table_title text NOT NULL,
  column_headers jsonb NOT NULL DEFAULT '["Field", "Details"]'::jsonb,
  row_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_repeatable boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.candex_section_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex section tables"
  ON public.candex_section_tables FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Master admin manage candex section tables"
  ON public.candex_section_tables FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));
