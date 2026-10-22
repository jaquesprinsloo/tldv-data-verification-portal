// Pure helpers shared by the public /submit-request page, the admin Intake
// Requests tab and the intake edge function behaviour tests.

export type IntakeCandidate = {
  id_number: string;
  surname: string;
  first_name: string;
  gender?: string | null;
  date_of_birth?: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** "CC Watercrest 22 October 2026" (Johannesburg date) — matches the live order numbering. */
export function buildOrderNumberBase(clientName: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg", day: "numeric", month: "numeric", year: "numeric",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const store = clientName.replace(/^cash\s+crusaders\s+/i, "").trim() || clientName.trim();
  return `CC ${store} ${get("day")} ${MONTHS[Number(get("month")) - 1]} ${get("year")}`;
}

/** Duplicate orders on the same store/day get an incrementing "(n) " prefix. */
export function orderNumberWithSuffix(base: string, n: number): string {
  return `(${n}) ${base}`;
}

/** Derive gender (M/F) and YYYY-MM-DD DOB from a 13-digit SA ID number. */
export function parseSaId(idNumber: string): { gender: "M" | "F"; date_of_birth: string } | null {
  const id = (idNumber ?? "").trim();
  if (!/^\d{13}$/.test(id)) return null;
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY ? 1900 : 2000;
  const gender = Number(id.slice(6, 10)) >= 5000 ? "M" : "F";
  return { gender, date_of_birth: `${century + yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` };
}

/** Normalise gender input (MALE/FEMALE/Male/m/f) to the M/F codes used by the supplier template. */
export function normalizeGender(input?: string | null): "M" | "F" | null {
  const v = (input ?? "").trim().toLowerCase();
  if (["m", "male"].includes(v)) return "M";
  if (["f", "female"].includes(v)) return "F";
  return null;
}

/** The exact 18-column CSI supplier template headers (row 2 of their workbook). */
export const CSI_HEADERS = [
  "ID Number (Required)",
  "Surname (Required)",
  "First Name (Required)",
  "Gender (M/F/U)",
  "Date of Birth \nYYYY-MM-DD",
  "Qualification Name",
  "Institution Name",
  "Date Obtained",
  "Student Number",
  "Certificate Number",
  "Exam Number",
  "Race Group - African, Asian, Coloured, Indian, White,NA",
  "Mobile Number",
  "Email Address",
  "Province",
  "Highest Qualification",
  "Current Employer",
  "Drivers License Number",
] as const;

export const CSI_INSTRUCTION = "Note: please do not add rows or columns to this spreadsheet, the headings must appear on row 2 and all candidates to follow from row 3.";
export const CSI_QUALIFICATION_NOTE = "Qualification information only applies to Matric and Local Qualification verifications.";
export const CSI_SOCIAL_NOTE = "The below columns apply only to Social Media checks";
export const CSI_LICENSE_NOTE = "This column applies to Drivers License verifications";

/** Build the data rows for the CSI template (columns 6-18 stay empty for standard IDV + Risk). */
export function buildCsiRows(candidates: IntakeCandidate[]): string[][] {
  return candidates.map((c) => [
    (c.id_number ?? "").trim(),
    (c.surname ?? "").trim(),
    (c.first_name ?? "").trim(),
    normalizeGender(c.gender) ?? "U",
    (c.date_of_birth ?? "").trim(),
    "", "", "", "", "", "", "", "", "", "", "", "", "",
  ]);
}

/** Tolerant CSV/TSV batch parser: accepts id, surname, first name, gender, dob columns. */
export function parseBatchCsv(text: string): IntakeCandidate[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const rows = lines.map((l) => {
    const sep = l.includes("\t") ? "\t" : l.includes(";") && !l.includes(",") ? ";" : ",";
    return l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
  });
  const headerish = (cells: string[]) => {
    const joined = cells.join(" ").toLowerCase();
    return /surname/.test(joined) && /(first|name)/.test(joined);
  };
  const startIdx = headerish(rows[0]) ? 1 : 0;
  const out: IntakeCandidate[] = [];
  for (const cells of rows.slice(startIdx)) {
    if (cells.length < 3) continue;
    const [idNumber, surname, firstName, gender, dob] = cells;
    if (!idNumber || !surname || !firstName) continue;
    const parsedId = parseSaId(idNumber);
    out.push({
      id_number: idNumber,
      surname,
      first_name: firstName,
      gender: normalizeGender(gender) ?? parsedId?.gender ?? null,
      date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(dob ?? "") ? dob : parsedId?.date_of_birth ?? null,
    });
  }
  return out;
}

/** URL slug for store-specific share links (?store=watercrest). */
export function storeSlug(clientName: string): string {
  return (clientName ?? "")
    .toLowerCase()
    .replace(/^cash\s+crusaders\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}
