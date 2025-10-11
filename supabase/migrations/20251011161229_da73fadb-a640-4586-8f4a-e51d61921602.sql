-- Create storage bucket for employee dismissal documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('dismissal-documents', 'dismissal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Add RLS policies for dismissal documents bucket
CREATE POLICY "Admins can upload dismissal documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dismissal-documents' AND
  (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ))
);

CREATE POLICY "Admins can view dismissal documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dismissal-documents' AND
  (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ))
);

CREATE POLICY "Admins can delete dismissal documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dismissal-documents' AND
  (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ))
);

-- Fix RLS policy for employee_invitations deletion (ensure admins can delete)
DROP POLICY IF EXISTS "Admins can delete invitations" ON employee_invitations;

CREATE POLICY "Admins can delete invitations"
ON employee_invitations FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);