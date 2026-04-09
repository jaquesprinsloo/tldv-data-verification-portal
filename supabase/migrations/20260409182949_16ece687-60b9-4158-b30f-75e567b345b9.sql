-- Fix stored URLs: extract just the storage path from expired signed URLs
UPDATE public.popia_indemnity_settings
SET popia_audio_url = regexp_replace(
  popia_audio_url,
  '^.*/object/(?:public|sign)/employee-documents/(.+?)(?:\?.*)?$',
  '\1'
)
WHERE popia_audio_url LIKE '%/object/%/employee-documents/%';

UPDATE public.popia_indemnity_settings
SET indemnity_audio_url = regexp_replace(
  indemnity_audio_url,
  '^.*/object/(?:public|sign)/employee-documents/(.+?)(?:\?.*)?$',
  '\1'
)
WHERE indemnity_audio_url LIKE '%/object/%/employee-documents/%';

-- Allow anonymous users to read POPIA/Indemnity audio files from storage
CREATE POLICY "Anon can read popia-indemnity audio"
  ON storage.objects FOR SELECT
  TO anon
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = 'popia-indemnity'
  );