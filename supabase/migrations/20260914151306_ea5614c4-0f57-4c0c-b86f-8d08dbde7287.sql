CREATE TABLE public.booking_list_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_type text NOT NULL,
  label text NOT NULL,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_type, label)
);

CREATE TABLE public.booking_confirmations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_reference text NOT NULL UNIQUE,
  attention_name text NOT NULL,
  attention_email text,
  company_name text NOT NULL,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  examiners text[] NOT NULL DEFAULT '{}',
  examiner_emails text[] NOT NULL DEFAULT '{}',
  service_required text NOT NULL,
  polygraph_types text[] NOT NULL DEFAULT '{}',
  vetting_types text[] NOT NULL DEFAULT '{}',
  candidate_quantity integer NOT NULL DEFAULT 1,
  venue_id uuid REFERENCES public.polygraph_venues(id) ON DELETE SET NULL,
  location_label text,
  special_notes text,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  sent_to text[] NOT NULL DEFAULT '{}',
  appointment_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_confirmations_date ON public.booking_confirmations (scheduled_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_list_options TO authenticated;
GRANT ALL ON public.booking_list_options TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_confirmations TO authenticated;
GRANT ALL ON public.booking_confirmations TO service_role;

ALTER TABLE public.booking_list_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage booking lists" ON public.booking_list_options FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Admins manage booking confirmations" ON public.booking_confirmations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));

CREATE POLICY "Examiners view own booking confirmations" ON public.booking_confirmations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'examiner'));

CREATE TRIGGER update_booking_confirmations_updated_at
BEFORE UPDATE ON public.booking_confirmations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.booking_list_options (list_type, label) VALUES
  ('polygraph_type','Diagnostics'),
  ('polygraph_type','Screening'),
  ('polygraph_type','Pre Employment'),
  ('vetting_type','ID Verification (IDV)'),
  ('vetting_type','Criminal Record Check'),
  ('vetting_type','Credit Check'),
  ('vetting_type','Qualification Verification'),
  ('vetting_type','Employment Reference Check'),
  ('vetting_type','Driver''s Licence Verification')
ON CONFLICT DO NOTHING;