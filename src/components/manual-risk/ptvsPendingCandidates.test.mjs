import { expect, test } from "bun:test";
import { readPendingPtvsCandidates } from "../../lib/ptvsPendingCandidates.ts";

test("original-account invoicing keeps discounted checks pending for PTVS", async () => {
  const candidate = { id: "check", submission_id: "order", is_ptvs_discount: true,
    invoice_batch_id: "original-invoice", ptvs_invoice_batch_id: null };
  const rows = await readPendingPtvsCandidates(() => Promise.resolve({ data: [candidate], error: null }), ["order"]);
  expect(rows.map((c) => c.id)).toEqual(["check"]);
});

test("PTVS invoicing removes the check only from PTVS pending", async () => {
  const candidate = { submission_id: "order", is_ptvs_discount: true, ptvs_invoice_batch_id: "ptvs-invoice" };
  expect(await readPendingPtvsCandidates(() => Promise.resolve({ data: [candidate], error: null }), ["order"])).toEqual([]);
});

test("reads all PTVS pages and scopes to loaded orders without a long URL filter", async () => {
  const data = Array.from({ length: 1022 }, (_, id) => ({ id, submission_id: id === 0 ? "archive" : "live",
    is_ptvs_discount: true, ptvs_invoice_batch_id: null }));
  const rows = await readPendingPtvsCandidates((from, to) => Promise.resolve({ data: data.slice(from, to + 1), error: null }), ["live"]);
  expect(rows.length).toBe(1021);
  expect(rows.at(-1)?.id).toBe(1021);
});

test("failed PTVS reads never return a partial pending list", async () => {
  await expect(readPendingPtvsCandidates(() => Promise.resolve({ data: null, error: new Error("failed") }), ["live"])).rejects.toThrow("failed");
});