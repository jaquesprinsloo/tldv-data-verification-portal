CREATE POLICY "Client facing read submissions"
  ON public.manual_risk_submissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'client_facing'));

CREATE POLICY "Client facing read candidates"
  ON public.manual_risk_candidates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'client_facing'));

CREATE POLICY "Client facing read clients"
  ON public.manual_risk_clients FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'client_facing'));

CREATE POLICY "Client facing read settings"
  ON public.manual_risk_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'client_facing'));

CREATE POLICY "MRA indemnities: client facing read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manual-risk-indemnities' AND public.has_role(auth.uid(), 'client_facing'));