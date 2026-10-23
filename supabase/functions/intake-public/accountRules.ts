export function isSubmissionAccount(name: string): boolean {
  return !["test", "polygraph & truth verification services"].includes(name.trim().replace(/\s+/g, " ").toLowerCase());
}

export function includeInvoicedAccountChecks(clientFacing: boolean): boolean {
  return clientFacing;
}