import { describe, expect, test } from "bun:test";
import {
  buildOrderNumberBase,
  orderNumberWithSuffix,
  parseSaId,
  normalizeGender,
  buildCsiRows,
  parseBatchCsv,
  storeSlug,
  CSI_HEADERS,
} from "./intakeLogic.ts";

describe("SA ID number parsing", () => {
  test("derives gender and DOB from a 13-digit ID", () => {
    const parsed = parseSaId("0608076300086"); // sample row from the CSI template
    expect(parsed?.gender).toBe("M");
    expect(parsed?.date_of_birth).toBe("2006-08-07");
  });
  test("rejects malformed IDs", () => {
    expect(parseSaId("12345")).toBeNull();
    expect(parseSaId("0000000000000")).toBeNull(); // month 00
  });
  test("maps IDs before the current birth year to the 1900s", () => {
    const parsed = parseSaId("7501015001089"); // 1975, digit 7 = male
    expect(parsed?.date_of_birth).toBe("1975-01-01");
    expect(parsed?.gender).toBe("M");
  });
});

describe("gender normalisation", () => {
  test("accepts MALE/FEMALE variants", () => {
    expect(normalizeGender("MALE")).toBe("M");
    expect(normalizeGender("Female")).toBe("F");
    expect(normalizeGender("m")).toBe("M");
    expect(normalizeGender("x")).toBeNull();
  });
});

describe("order number convention", () => {
  test("matches the live CC - store - date format", () => {
    const base = buildOrderNumberBase("Cash Crusaders Watercrest", new Date("2026-10-22T10:00:00Z"));
    expect(base).toBe("CC Watercrest 22 October 2026");
  });
  test("non-CC clients keep their own name after the CC prefix", () => {
    const base = buildOrderNumberBase("Acme Holdings", new Date("2026-10-22T10:00:00Z"));
    expect(base).toBe("CC Acme Holdings 22 October 2026");
  });
  test("duplicates get an incrementing (n) prefix", () => {
    expect(orderNumberWithSuffix("CC Watercrest 22 October 2026", 1)).toBe("(1) CC Watercrest 22 October 2026");
    expect(orderNumberWithSuffix("CC Watercrest 22 October 2026", 2)).toBe("(2) CC Watercrest 22 October 2026");
  });
});

describe("CSI supplier template rows", () => {
  test("emits 18 columns with ID first and standard fields blank", () => {
    const rows = buildCsiRows([{ id_number: "0608076300086", surname: "Mbanyaru", first_name: "Ahluma", gender: "M", date_of_birth: "2006-08-07" }]);
    expect(rows.length).toBe(1);
    expect(rows[0].length).toBe(18);
    expect(rows[0][0]).toBe("0608076300086");
    expect(rows[0][1]).toBe("Mbanyaru");
    expect(rows[0][3]).toBe("M");
    expect(rows[0][4]).toBe("2006-08-07");
    expect(rows[0].slice(5).every((c) => c === "")).toBe(true);
  });
  test("keeps the exact supplier header row", () => {
    expect(CSI_HEADERS[0]).toBe("ID Number (Required)");
    expect(CSI_HEADERS[1]).toBe("Surname (Required)");
    expect(CSI_HEADERS[4]).toContain("YYYY-MM-DD");
    expect(CSI_HEADERS.length).toBe(18);
  });
});

describe("batch CSV parsing", () => {
  test("skips a header row and fills gender/DOB from the ID", () => {
    const rows = parseBatchCsv("ID Number,Surname,First Name,Gender,Date of Birth\n0608076300086,Mbanyaru,Ahluma,,\n7501015001089,Doe,Jane,FEMALE,1975-01-01");
    expect(rows.length).toBe(2);
    expect(rows[0].first_name).toBe("Ahluma");
    expect(rows[0].gender).toBe("M");
    expect(rows[0].date_of_birth).toBe("2006-08-07");
    expect(rows[1].gender).toBe("F");
    expect(rows[1].date_of_birth).toBe("1975-01-01");
  });
  test("parses headerless rows", () => {
    const rows = parseBatchCsv("0608076300086,Mbanyaru,Ahluma");
    expect(rows.length).toBe(1);
    expect(rows[0].surname).toBe("Mbanyaru");
  });
});

describe("store share-link slugs", () => {
  test("drops the Cash Crusaders brand from the slug", () => {
    expect(storeSlug("Cash Crusaders Makhado Crossing")).toBe("makhadocrossing");
  });
});
