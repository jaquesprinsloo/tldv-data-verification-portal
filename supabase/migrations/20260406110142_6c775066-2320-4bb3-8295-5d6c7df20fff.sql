
-- Add 'examiner' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'examiner';

-- Create polygraph appointments table
CREATE TABLE public.polygraph_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.candex_clients(id),
  account_id UUID REFERENCES public.accounts(id),
  store_id UUID REFERENCES public.stores(id),
  requested_by UUID NOT NULL,
  venue_type TEXT NOT NULL DEFAULT 'own_location',
  venue_address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  scheduled_date DATE,
  scheduled_time TIME,
  examiner_id UUID REFERENCES public.examiners(id),
  assigned_examiner_user_id UUID,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  booking_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointment candidates junction table
CREATE TABLE public.polygraph_appointment_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.polygraph_appointments(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.candex_applications(id),
  candidate_name TEXT NOT NULL,
  candidate_id_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polygraph_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polygraph_appointment_candidates ENABLE ROW LEVEL SECURITY;

-- RLS for polygraph_appointments
CREATE POLICY "Master admin manage appointments" ON public.polygraph_appointments
  FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));

CREATE POLICY "Admins can view own appointments" ON public.polygraph_appointments
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR is_master_admin(auth.uid()));

CREATE POLICY "Admins can create appointments" ON public.polygraph_appointments
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_master_admin(auth.uid()));

CREATE POLICY "Examiners can view assigned appointments" ON public.polygraph_appointments
  FOR SELECT TO authenticated
  USING (assigned_examiner_user_id = auth.uid());

-- RLS for polygraph_appointment_candidates
CREATE POLICY "Master admin manage appointment candidates" ON public.polygraph_appointment_candidates
  FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));

CREATE POLICY "Admins view appointment candidates" ON public.polygraph_appointment_candidates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.polygraph_appointments pa
    WHERE pa.id = polygraph_appointment_candidates.appointment_id
    AND (pa.requested_by = auth.uid() OR is_master_admin(auth.uid()))
  ));

CREATE POLICY "Admins insert appointment candidates" ON public.polygraph_appointment_candidates
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.polygraph_appointments pa
    WHERE pa.id = polygraph_appointment_candidates.appointment_id
    AND (pa.requested_by = auth.uid() OR is_master_admin(auth.uid()))
  ));

CREATE POLICY "Examiners view assigned appointment candidates" ON public.polygraph_appointment_candidates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.polygraph_appointments pa
    WHERE pa.id = polygraph_appointment_candidates.appointment_id
    AND pa.assigned_examiner_user_id = auth.uid()
  ));
