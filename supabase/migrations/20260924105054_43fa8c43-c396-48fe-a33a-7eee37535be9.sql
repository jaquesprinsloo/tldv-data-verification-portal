CREATE TABLE public.examiner_report_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  examiner_user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'single',
  test_type text NOT NULL,
  client_name text NOT NULL,
  appointment_date date NOT NULL,
  venue_label text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  released_at timestamp with time zone,
  device_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examiner_report_batches TO authenticated;
GRANT ALL ON public.examiner_report_batches TO service_role;
ALTER TABLE public.examiner_report_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Examiners manage own batches" ON public.examiner_report_batches
  FOR ALL TO authenticated
  USING (examiner_user_id = auth.uid())
  WITH CHECK (examiner_user_id = auth.uid());
CREATE POLICY "Admins view all batches" ON public.examiner_report_batches
  FOR SELECT TO authenticated
  USING (is_master_admin(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE TABLE public.examiner_report_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid REFERENCES public.examiner_report_batches(id) ON DELETE CASCADE,
  examiner_user_id uuid NOT NULL,
  test_type text NOT NULL,
  candidate_first_name text NOT NULL,
  candidate_surname text NOT NULL,
  candidate_id_number text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_result text,
  examiner_notes text,
  pf_folder_path text,
  ess_report_path text,
  is_walk_in boolean NOT NULL DEFAULT false,
  appointment_id uuid REFERENCES public.polygraph_appointments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  captured_at timestamp with time zone,
  published_at timestamp with time zone,
  uploaded_at timestamp with time zone,
  linked_risk_candidate_id uuid REFERENCES public.manual_risk_candidates(id) ON DELETE SET NULL,
  linked_application_id uuid REFERENCES public.candex_applications(id) ON DELETE SET NULL,
  device_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.examiner_report_drafts TO authenticated;
GRANT ALL ON public.examiner_report_drafts TO service_role;
ALTER TABLE public.examiner_report_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Examiners manage own report drafts" ON public.examiner_report_drafts
  FOR ALL TO authenticated
  USING (examiner_user_id = auth.uid())
  WITH CHECK (examiner_user_id = auth.uid());
CREATE POLICY "Admins view all report drafts" ON public.examiner_report_drafts
  FOR SELECT TO authenticated
  USING (is_master_admin(auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_examiner_report_batches_updated_at
  BEFORE UPDATE ON public.examiner_report_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_examiner_report_drafts_updated_at
  BEFORE UPDATE ON public.examiner_report_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();