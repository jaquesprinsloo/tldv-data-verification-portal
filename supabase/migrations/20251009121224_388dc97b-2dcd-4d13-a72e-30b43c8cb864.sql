-- Rename selfie column to proof of residence
ALTER TABLE submissions 
  RENAME COLUMN selfie_photo_url TO proof_of_residence_url;

-- Add comment to clarify proof of residence requirements
COMMENT ON COLUMN submissions.proof_of_residence_url IS 'Valid rental contract, municipal bill (not older than 3 months), or SAPS stamped letter (not older than 3 months) showing physical address, name, and ID number';