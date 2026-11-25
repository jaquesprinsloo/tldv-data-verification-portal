import { describe, expect, test } from "bun:test";
import {
  ACCOUNTS_GUIDE_DEMO_CUES,
  ACCOUNTS_GUIDE_STEPS,
  getActiveAccountsDemoAction,
  getActiveAccountsGuideStep,
  isAccountsDemoModalOpen,
} from "./accountsGuideSteps.ts";

describe("AccountsAudioGuide step & demo synchronization", () => {
  test("maps audio timestamps cleanly across all 10 Accounts walkthrough steps", () => {
    expect(ACCOUNTS_GUIDE_STEPS.length).toBe(10);
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 0)?.target).toBe("accounts-overview");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 15)?.target).toBe("accounts-search");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 32)?.target).toBe("accounts-columns");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 52)?.target).toBe("demo-account-ledger");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 68)?.target).toBe("demo-report-action");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 78)?.target).toBe("demo-indemnity-action");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 87)?.target).toBe("demo-download-action");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 108)?.target).toBe("demo-batch-linking");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 130)?.target).toBe("demo-bulk-toolbar");
    expect(getActiveAccountsGuideStep(ACCOUNTS_GUIDE_STEPS, 148)?.target).toBe("demo-audit-note");
  });

  test("triggers interactive mock demos and closes the demo modal before audio ends", () => {
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 20)).toBe("demo-search-typing");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 47.6)).toBe("click-open-account");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 52)).toBe("open-demo-ledger");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 66)).toBe("click-report-icon");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 70)).toBe("show-mock-report");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 76.5)).toBe("click-indemnity-icon");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 80)).toBe("show-mock-indemnity");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 88)).toBe("click-download-icon");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 99)).toBe("highlight-single-row");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 108)).toBe("highlight-batch-rows");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 128)).toBe("highlight-bulk-select");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 138)).toBe("click-bulk-download");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 147)).toBe("highlight-audit-note");
    expect(getActiveAccountsDemoAction(ACCOUNTS_GUIDE_DEMO_CUES, 153)).toBeNull();
    expect(isAccountsDemoModalOpen("open-demo-ledger", "demo-account-ledger")).toBe(true);
    expect(isAccountsDemoModalOpen(null, "demo-audit-note")).toBe(false);
  });
});