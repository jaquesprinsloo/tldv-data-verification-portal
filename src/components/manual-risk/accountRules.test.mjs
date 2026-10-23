import { expect, test } from "bun:test";
import { isSubmissionAccount, includeInvoicedAccountChecks } from "../../../supabase/functions/intake-public/accountRules.ts";

test("Test is not available for submissions", () => {
  expect(isSubmissionAccount("test")).toBe(false);
});
test("Polygraph & Truth Verification Services is not available for submissions", () => {
  expect(isSubmissionAccount("Polygraph & Truth Verification Services")).toBe(false);
  expect(isSubmissionAccount("Cash Crusaders Watercrest")).toBe(true);
});
test("client-facing history includes invoiced checks", () => {
  expect(includeInvoicedAccountChecks(true)).toBe(true);
  expect(includeInvoicedAccountChecks(false)).toBe(false);
});