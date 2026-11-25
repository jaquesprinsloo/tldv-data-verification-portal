export type AccountsGuideTarget =
  | "accounts-overview"
  | "accounts-search"
  | "accounts-columns"
  | "demo-account-ledger"
  | "demo-report-action"
  | "demo-indemnity-action"
  | "demo-download-action"
  | "demo-batch-linking"
  | "demo-bulk-toolbar"
  | "demo-audit-note";

export type AccountsGuideStep = {
  target: AccountsGuideTarget;
  label: string;
  start: number;
  end: number;
};

export type AccountsDemoAction =
  | "demo-search-typing"
  | "click-open-account"
  | "open-demo-ledger"
  | "highlight-row-actions"
  | "click-report-icon"
  | "show-mock-report"
  | "click-indemnity-icon"
  | "show-mock-indemnity"
  | "click-download-icon"
  | "highlight-single-row"
  | "highlight-batch-rows"
  | "highlight-bulk-select"
  | "click-bulk-download"
  | "highlight-audit-note";

export type AccountsDemoCue = {
  action: AccountsDemoAction;
  start: number;
  end: number;
};

export const ACCOUNTS_GUIDE_DURATION = 154.1;

export const ACCOUNTS_GUIDE_STEPS: AccountsGuideStep[] = [
  { target: "accounts-overview", label: "Accounts repository overview", start: 0, end: 11.4 },
  { target: "accounts-search", label: "Candidate search (current & archive)", start: 11.4, end: 28.4 },
  { target: "accounts-columns", label: "Current vs. Historical Archive", start: 28.4, end: 47.0 },
  { target: "demo-account-ledger", label: "Opening an account ledger", start: 47.0, end: 61.2 },
  { target: "demo-report-action", label: "Row action: Report preview", start: 61.2, end: 75.6 },
  { target: "demo-indemnity-action", label: "Row action: Indemnity viewer", start: 75.6, end: 85.0 },
  { target: "demo-download-action", label: "Row action: Single download", start: 85.0, end: 92.0 },
  { target: "demo-batch-linking", label: "Single vs. Batch document linking", start: 92.0, end: 120.6 },
  { target: "demo-bulk-toolbar", label: "Bulk ZIP downloads & Excel summary", start: 120.6, end: 144.5 },
  { target: "demo-audit-note", label: "POPIA audit trail", start: 144.5, end: 155.0 },
];

export const ACCOUNTS_GUIDE_DEMO_CUES: AccountsDemoCue[] = [
  { action: "demo-search-typing", start: 14.5, end: 28.0 },
  { action: "click-open-account", start: 47.2, end: 48.4 },
  { action: "open-demo-ledger", start: 48.4, end: 61.2 },
  { action: "highlight-row-actions", start: 61.2, end: 65.2 },
  { action: "click-report-icon", start: 65.2, end: 66.6 },
  { action: "show-mock-report", start: 66.6, end: 75.4 },
  { action: "click-indemnity-icon", start: 75.8, end: 77.2 },
  { action: "show-mock-indemnity", start: 77.2, end: 84.8 },
  { action: "click-download-icon", start: 85.2, end: 91.8 },
  { action: "highlight-single-row", start: 96.4, end: 103.0 },
  { action: "highlight-batch-rows", start: 103.0, end: 120.6 },
  { action: "highlight-bulk-select", start: 120.6, end: 133.5 },
  { action: "click-bulk-download", start: 133.5, end: 144.5 },
  { action: "highlight-audit-note", start: 144.5, end: 152.0 },
];

const MODAL_DEMO_ACTIONS = new Set<AccountsDemoAction>([
  "open-demo-ledger",
  "highlight-row-actions",
  "click-report-icon",
  "show-mock-report",
  "click-indemnity-icon",
  "show-mock-indemnity",
  "click-download-icon",
  "highlight-single-row",
  "highlight-batch-rows",
  "highlight-bulk-select",
  "click-bulk-download",
  "highlight-audit-note",
]);

export function isAccountsDemoModalOpen(
  action: AccountsDemoAction | null,
  target: AccountsGuideTarget | null,
): boolean {
  if (action && MODAL_DEMO_ACTIONS.has(action)) return true;
  if (
    action === null &&
    target !== null &&
    target.startsWith("demo-") &&
    target !== "demo-account-ledger" &&
    target !== "demo-audit-note"
  ) {
    return true;
  }
  return false;
}

export function getActiveAccountsGuideStep(
  steps: AccountsGuideStep[],
  currentTime: number,
): AccountsGuideStep | null {
  if (!Number.isFinite(currentTime) || currentTime < 0) return steps[0] ?? null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step && currentTime >= step.start) return step;
  }
  return steps[0] ?? null;
}

export function getActiveAccountsDemoAction(
  cues: AccountsDemoCue[],
  currentTime: number,
): AccountsDemoAction | null {
  if (!Number.isFinite(currentTime) || currentTime < 0) return null;
  for (const cue of cues) {
    if (currentTime >= cue.start && currentTime < cue.end) {
      return cue.action;
    }
  }
  return null;
}