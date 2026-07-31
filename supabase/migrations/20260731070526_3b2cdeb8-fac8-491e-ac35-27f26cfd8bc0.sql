CREATE UNIQUE INDEX IF NOT EXISTS manual_risk_contacts_client_email_uidx
  ON public.manual_risk_contacts (client_id, lower(btrim(email)));