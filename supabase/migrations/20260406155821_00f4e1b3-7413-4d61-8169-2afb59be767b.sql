
-- Create polygraph_venues table for TLDV vetted venues
CREATE TABLE public.polygraph_venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_name TEXT NOT NULL,
  address TEXT NOT NULL,
  gps_latitude NUMERIC,
  gps_longitude NUMERIC,
  city TEXT,
  province TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.polygraph_venues ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active venues
CREATE POLICY "Authenticated users can view active venues"
  ON public.polygraph_venues FOR SELECT TO authenticated
  USING (is_active = true);

-- Master admins can manage venues
CREATE POLICY "Master admin manage venues"
  ON public.polygraph_venues FOR ALL TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));

-- Add preferred_area and venue_id to polygraph_appointments
ALTER TABLE public.polygraph_appointments
  ADD COLUMN preferred_area TEXT,
  ADD COLUMN venue_id UUID REFERENCES public.polygraph_venues(id);
