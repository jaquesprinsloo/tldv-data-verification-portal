-- Create proof-of-residence storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('proof-of-residence', 'proof-of-residence', false);

-- Create RLS policies for proof-of-residence bucket
CREATE POLICY "Admins can view all proof of residence documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'proof-of-residence' AND
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can upload their own proof of residence"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'proof-of-residence'
);

CREATE POLICY "Users can update their own proof of residence"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'proof-of-residence'
);