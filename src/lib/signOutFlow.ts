/** Local credentials must disappear before any animation or network request. */
export function beginSignOut(actions: {
  clearLocalSession: () => void;
  revokeSession: () => Promise<{ error: unknown }>;
}) {
  actions.clearLocalSession();
  return actions.revokeSession();
}