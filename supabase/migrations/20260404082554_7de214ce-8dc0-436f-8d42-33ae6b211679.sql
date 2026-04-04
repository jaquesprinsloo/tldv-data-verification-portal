
-- Allow anon to read questionnaire templates (needed for candidate application)
CREATE POLICY "Anon can read active candex templates"
ON public.candex_questionnaire_templates FOR SELECT
TO anon
USING (is_active = true);

-- Allow anon to read template sections
CREATE POLICY "Anon can read candex sections"
ON public.candex_template_sections FOR SELECT
TO anon
USING (true);

-- Allow anon to read section tables
CREATE POLICY "Anon can read candex section tables"
ON public.candex_section_tables FOR SELECT
TO anon
USING (true);

-- Allow anon to read template questions
CREATE POLICY "Anon can read candex questions"
ON public.candex_template_questions FOR SELECT
TO anon
USING (true);
