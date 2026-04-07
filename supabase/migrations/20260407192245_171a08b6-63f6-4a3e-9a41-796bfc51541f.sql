
CREATE TABLE public.popia_indemnity_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  popia_text text NOT NULL,
  indemnity_text text NOT NULL,
  popia_audio_url text,
  indemnity_audio_url text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.popia_indemnity_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read popia settings"
  ON public.popia_indemnity_settings FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Master admin manage popia settings"
  ON public.popia_indemnity_settings FOR ALL
  TO authenticated
  USING (is_master_admin(auth.uid()))
  WITH CHECK (is_master_admin(auth.uid()));
