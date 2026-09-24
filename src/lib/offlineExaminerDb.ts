import { openDB, type IDBPDatabase } from "idb";

export interface OfflineFileRef {
  name: string;
  size: number;
  blob: Blob;
  /** Set once this file has reached the server, so retries skip it. */
  uploadedPath?: string;
  recordedAt?: string;
}

/** Ask the browser to keep our data, and report free space. */
export async function getStorageInfo(): Promise<{ usedMb: number; freeMb: number | null; persisted: boolean }> {
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
    if (!persisted) persisted = (await navigator.storage?.persist?.()) ?? false;
  } catch { /* ignore */ }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      const used = (est.usage ?? 0) / 1048576;
      const free = est.quota != null ? (est.quota - (est.usage ?? 0)) / 1048576 : null;
      return { usedMb: used, freeMb: free, persisted };
    }
  } catch { /* ignore */ }
  return { usedMb: 0, freeMb: null, persisted };
}

export interface OfflineSession {
  id: string;
  examinerUserId: string;
  mode: "single" | "batch";
  testType: string;
  clientName: string;
  appointmentDate: string; // yyyy-MM-dd
  venueLabel: string;
  status: "open" | "released";
  serverBatchId?: string;
  createdAt: string;
}

export interface ExamQuestionAnswer {
  questionText: string;
  response: "yes" | "no" | null;
  finding: "SR" | "NSR" | "INC" | "PNC" | null;
}

export interface AdmissionAnswer {
  category: string;
  confirmed: boolean;
  details: string;
}

export interface OfflineReportAnswers {
  suitability: {
    healthStatus: string;
    enoughSleep: boolean | null;
    medicationTaken: boolean | null;
    medicationDetails: string;
    recentAlcoholUse: boolean | null;
    alcoholDetails: string;
    suitableForExam: boolean | null;
    suitabilityComment: string;
  };
  questions: ExamQuestionAnswer[];
  admissions: AdmissionAnswer[];
  postExamAdmissions: string;
  examinerNotes: string;
  overallResult: "passed" | "failed" | "inconclusive" | null;
  findingMade: boolean;
  reviewedByExaminer: boolean;
}

export type OfflineReportStatus =
  | "draft"
  | "published_waiting"
  | "uploading"
  | "uploaded"
  | "error";

export interface OfflineReport {
  id: string;
  sessionId: string;
  testType: string;
  firstName: string;
  surname: string;
  idNumber: string; // ID or passport
  isWalkIn: boolean;
  answers: OfflineReportAnswers;
  pfFiles: OfflineFileRef[];
  essFile: OfflineFileRef | null;
  recordings?: OfflineFileRef[];
  status: OfflineReportStatus;
  lastError?: string;
  capturedAt?: string;
  publishedAt?: string;
  uploadedAt?: string;
  createdAt: string;
}

export const TEST_TYPES = ["Pre Employment", "Periodic Screening", "Diagnostic"] as const;

export function emptyAnswers(): OfflineReportAnswers {
  return {
    suitability: {
      healthStatus: "",
      enoughSleep: null,
      medicationTaken: null,
      medicationDetails: "",
      recentAlcoholUse: null,
      alcoholDetails: "",
      suitableForExam: null,
      suitabilityComment: "",
    },
    questions: [],
    admissions: [],
    postExamAdmissions: "",
    examinerNotes: "",
    overallResult: null,
    findingMade: false,
    reviewedByExaminer: false,
  };
}

const DB_NAME = "tldv-examiner-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("reports")) {
          const store = db.createObjectStore("reports", { keyPath: "id" });
          store.createIndex("bySession", "sessionId");
        }
      },
    });
  }
  return dbPromise;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function getDeviceId(): string {
  let id = localStorage.getItem("examiner-device-id");
  if (!id) {
    id = newId();
    localStorage.setItem("examiner-device-id", id);
  }
  return id;
}

// ---------- Sessions ----------
export async function saveSession(session: OfflineSession): Promise<void> {
  const db = await getDb();
  await db.put("sessions", session);
}

export async function getSession(id: string): Promise<OfflineSession | undefined> {
  const db = await getDb();
  return (await db.get("sessions", id)) as OfflineSession | undefined;
}

export async function listSessions(examinerUserId: string): Promise<OfflineSession[]> {
  const db = await getDb();
  const all = (await db.getAll("sessions")) as OfflineSession[];
  return all
    .filter((s) => s.examinerUserId === examinerUserId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const reports = await listReports(id);
  const tx = db.transaction(["sessions", "reports"], "readwrite");
  await tx.objectStore("sessions").delete(id);
  for (const r of reports) await tx.objectStore("reports").delete(r.id);
  await tx.done;
}

// ---------- Reports ----------
export async function saveReport(report: OfflineReport): Promise<void> {
  const db = await getDb();
  await db.put("reports", report);
}

export async function getReport(id: string): Promise<OfflineReport | undefined> {
  const db = await getDb();
  return (await db.get("reports", id)) as OfflineReport | undefined;
}

export async function listReports(sessionId: string): Promise<OfflineReport[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex("reports", "bySession", sessionId)) as OfflineReport[];
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listAllReports(examinerUserId: string): Promise<{ session: OfflineSession; report: OfflineReport }[]> {
  const sessions = await listSessions(examinerUserId);
  const out: { session: OfflineSession; report: OfflineReport }[] = [];
  for (const s of sessions) {
    const reports = await listReports(s.id);
    for (const r of reports) out.push({ session: s, report: r });
  }
  return out;
}

export async function deleteReport(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("reports", id);
}

// ---------- Cached option lists (for offline setup) ----------
const LISTS_KEY = "examiner-offline-lists";

export interface CachedLists {
  companies: string[];
  venues: string[];
  cachedAt: string;
}

export function getCachedLists(): CachedLists {
  try {
    const raw = localStorage.getItem(LISTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { companies: [], venues: [], cachedAt: "" };
}

export function setCachedLists(lists: CachedLists): void {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
}
