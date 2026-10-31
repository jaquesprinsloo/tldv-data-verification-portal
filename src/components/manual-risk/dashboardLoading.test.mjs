import { expect, test } from "bun:test";
import { readAllPages } from "../../lib/paginatedRead.ts";

test("all 1843 statement lines are loaded beyond the 1000-row limit", async () => {
  const lines = Array.from({ length: 1843 }, (_, id) => ({ id }));
  const requests = [];
  const result = await readAllPages(async (from, to) => {
    requests.push([from, to]);
    return { data: lines.slice(from, to + 1), error: null };
  });
  expect(result).toEqual(lines);
  expect(requests).toEqual([[0, 999], [1000, 1999]]);
});

test("an exact full page requires another read", async () => {
  const rows = Array.from({ length: 1000 }, (_, id) => id);
  let requests = 0;
  const result = await readAllPages(async (from, to) => {
    requests++;
    return { data: rows.slice(from, to + 1), error: null };
  });
  expect(result.length).toBe(1000);
  expect(requests).toBe(2);
});

test("a failed later page never returns misleading partial totals", async () => {
  const error = new Error("Statement read failed");
  await expect(readAllPages(async (from) => from === 0
    ? { data: Array.from({ length: 1000 }, (_, id) => id), error: null }
    : { data: null, error },
  )).rejects.toThrow("Statement read failed");
});