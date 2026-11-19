export function portalSignInStep(roles: readonly string[]) {
  if (roles.includes('admin') || roles.includes('master_admin')) return 'session';
  if (roles.includes('client_facing')) return 'code';
  if (roles.includes('examiner')) return 'session';
  return 'denied';
}