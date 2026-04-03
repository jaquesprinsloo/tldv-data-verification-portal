
-- CanDex Questionnaire Templates
CREATE TABLE public.candex_questionnaire_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candex_questionnaire_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex templates" ON public.candex_questionnaire_templates
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
CREATE POLICY "Master admin manage candex templates" ON public.candex_questionnaire_templates
  FOR ALL TO authenticated USING (is_master_admin(auth.uid())) WITH CHECK (is_master_admin(auth.uid()));

-- CanDex Template Sections
CREATE TABLE public.candex_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.candex_questionnaire_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candex_template_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex sections" ON public.candex_template_sections
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
CREATE POLICY "Master admin manage candex sections" ON public.candex_template_sections
  FOR ALL TO authenticated USING (is_master_admin(auth.uid())) WITH CHECK (is_master_admin(auth.uid()));

-- CanDex Template Questions
CREATE TABLE public.candex_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.candex_template_sections(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL DEFAULT 'text',
  options jsonb DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candex_template_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex questions" ON public.candex_template_questions
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
CREATE POLICY "Master admin manage candex questions" ON public.candex_template_questions
  FOR ALL TO authenticated USING (is_master_admin(auth.uid())) WITH CHECK (is_master_admin(auth.uid()));

-- CanDex Clients
CREATE TABLE public.candex_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  company_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candex_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex clients" ON public.candex_clients
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
CREATE POLICY "Master admin manage candex clients" ON public.candex_clients
  FOR ALL TO authenticated USING (is_master_admin(auth.uid())) WITH CHECK (is_master_admin(auth.uid()));

-- CanDex Invitations (sent to candidates for a client)
CREATE TABLE public.candex_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.candex_clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.candex_questionnaire_templates(id),
  candidate_name text NOT NULL,
  candidate_email text,
  candidate_phone text,
  candidate_id_number text,
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candex_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex invitations" ON public.candex_invitations
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
CREATE POLICY "Master admin manage candex invitations" ON public.candex_invitations
  FOR ALL TO authenticated USING (is_master_admin(auth.uid())) WITH CHECK (is_master_admin(auth.uid()));

-- CanDex Applications (completed screenings)
CREATE TABLE public.candex_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES public.candex_invitations(id),
  client_id uuid NOT NULL REFERENCES public.candex_clients(id),
  template_id uuid REFERENCES public.candex_questionnaire_templates(id),
  candidate_name text NOT NULL,
  candidate_email text,
  candidate_id_number text,
  candidate_phone text,
  status text NOT NULL DEFAULT 'in_progress',
  submitted_at timestamptz,
  answers jsonb DEFAULT '{}'::jsonb,
  risk_score integer,
  risk_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candex_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view candex applications" ON public.candex_applications
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));
CREATE POLICY "Master admin manage candex applications" ON public.candex_applications
  FOR ALL TO authenticated USING (is_master_admin(auth.uid())) WITH CHECK (is_master_admin(auth.uid()));
