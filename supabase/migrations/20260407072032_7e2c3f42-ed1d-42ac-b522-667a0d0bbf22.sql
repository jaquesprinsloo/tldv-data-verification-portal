
CREATE POLICY "Examiners can view template sections"
ON public.candex_template_sections
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'examiner'::app_role));

CREATE POLICY "Examiners can view section tables"
ON public.candex_section_tables
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'examiner'::app_role));
