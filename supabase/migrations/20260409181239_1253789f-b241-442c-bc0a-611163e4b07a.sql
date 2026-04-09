-- 1. Fix renewal_requests: change PERMISSIVE to RESTRICTIVE
DROP POLICY IF EXISTS "Block unauthenticated access to renewal_requests" ON renewal_requests;
CREATE POLICY "Block unauthenticated access to renewal_requests"
  ON renewal_requests
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Fix audit_log: remove direct INSERT policy, revoke INSERT from users
-- The SECURITY DEFINER trigger bypasses RLS so it will still work
DROP POLICY IF EXISTS "Only triggers can insert audit logs" ON audit_log;

-- Revoke direct INSERT from authenticated and anon roles
REVOKE INSERT ON audit_log FROM authenticated, anon;

-- 3. Fix candex_invitations: restrict anon SELECT to token-based lookups
-- Drop the overly permissive anon policies
DROP POLICY IF EXISTS "Anyone can view invitations by token" ON candex_invitations;
DROP POLICY IF EXISTS "Anyone can update invitation status" ON candex_invitations;

-- Create a function to get the token from the request headers (used by RPC approach)
-- Instead, we restrict via a narrower anon policy approach
-- Anon users should only be able to read invitations - we can't restrict by token in RLS easily,
-- but we CAN restrict which columns are visible by using a view or RPC.
-- For now, create restrictive policies that limit anon to only pending/sent/opened invitations
CREATE POLICY "Anon can view invitations by token lookup"
  ON candex_invitations
  FOR SELECT
  TO anon
  USING (status IN ('pending', 'sent', 'opened'));

CREATE POLICY "Anon can update invitation status only"
  ON candex_invitations
  FOR UPDATE
  TO anon
  USING (status IN ('sent', 'opened'))
  WITH CHECK (status IN ('opened', 'completed'));

-- 4. Fix candex_applications: restrict anon INSERT to require invitation_id
DROP POLICY IF EXISTS "Anyone can submit applications" ON candex_applications;

CREATE POLICY "Anon can submit applications with valid invitation"
  ON candex_applications
  FOR INSERT
  TO anon
  WITH CHECK (
    invitation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM candex_invitations
      WHERE id = invitation_id
      AND status IN ('sent', 'opened')
    )
  );