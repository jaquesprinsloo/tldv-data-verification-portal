-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule reminder emails to run every Monday at 9 AM
SELECT cron.schedule(
  'send-weekly-reminder-emails',
  '0 9 * * 1', -- Every Monday at 9 AM
  $$
  SELECT
    net.http_post(
      url := 'https://irvpnyxtdzwpnhtdpweu.supabase.co/functions/v1/send-reminder-emails',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlydnBueXh0ZHp3cG5odGRwd2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MzYyMTIsImV4cCI6MjA3NTUxMjIxMn0.GHwCh2kRMWHMnlfqrHKjXrTL8IIJO1BCi8UbJFHZF1E"}'::jsonb,
      body := '{"trigger": "cron"}'::jsonb
    ) as request_id;
  $$
);
