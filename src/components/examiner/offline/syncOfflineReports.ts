import { supabase } from "@/integrations/supabase/client";
import {
  getDeviceId,
  listAllReports,
  listReports,
  saveReport,
  saveSession,
  type OfflineReport,
  type OfflineSession,
} from "@/lib/offlineExaminerDb";

const BUCKET = "polygraph-reports";

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeId(s: string): string {
  return s.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

async function findRiskAssessmentLink(report: OfflineReport): Promise<string | null> {
  const id = normalizeId(report.idNumber || "");
  if (!id || id.length < 6) return null;
  const { data } = await supabase
    .from("manual_risk_candidates")
    .select("id, id_number, passport_number, first_name, surname")
    .or(`id_number.ilike.%${id}%,passport_number.ilike.%${id}%`)
    .limit(20);
  const match = (data || []).find(
    (c: any) =>
      (normalizeId(c.id_number || "") === id || normalizeId(c.passport_number || "") === id) &&
      normalizeName(c.first_name || "") === normalizeName(report.firstName) &&
      normalizeName(c.surname || "") === normalizeName(report.surname)
  );
  return match?.id ?? null;
}

async function findScreeningLink(report: OfflineReport): Promise<string | null> {
  const id = normalizeId(report.idNumber || "");
  if (!id || id.length < 6) return null;
  const { data } = await supabase
    .from("candex_applications")
    .select("id, candidate_id_number, candidate_name, status")
    .ilike("candidate_id_number", `%${id}%`)
    .eq("status", "submitted")
    .limit(20);
  const fullName = `${normalizeName(report.firstName)}${normalizeName(report.surname)}`;
  const revName = `${normalizeName(report.surname)}${normalizeName(report.firstName)}`;
  const match = (data || []).find((a: any) => {
    if (normalizeId(a.candidate_id_number || "") !== id) return false;
    const n = normalizeName(a.candidate_name || "");
    return n.includes(normalizeName(report.firstName)) && n.includes(normalizeName(report.surname)) ||
      n === fullName || n === revName;
  });
  return match?.id ?? null;
}

async function uploadFile(
  report: OfflineReport,
  kind: "pf" | "ess" | "recordings",
  file: OfflineFileRef
): Promise<string> {
  // Already on the server from an earlier (interrupted) attempt — skip.
  if (file.uploadedPath) return file.uploadedPath;
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `offline-reports/${report.id}/${kind}/${safeName}`;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!navigator.onLine) throw new Error("Connection lost — will resume");
    const { error } = await supabase.storage.from(BUCKET).upload(path, file.blob, {
      upsert: true,
      contentType: file.blob.type || "application/octet-stream",
    });
    if (!error) {
      file.uploadedPath = path;
      await saveReport(report); // remember progress so a retry resumes here
      return path;
    }
    lastErr = error.message;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`${file.name}: ${lastErr}`);
}

async function ensureServerBatch(session: OfflineSession): Promise<string> {
  if (session.serverBatchId) return session.serverBatchId;
  const { data, error } = await supabase
    .from("examiner_report_batches" as any)
    .insert({
      examiner_user_id: session.examinerUserId,
      mode: session.mode,
      test_type: session.testType,
      client_name: session.clientName,
      appointment_date: session.appointmentDate,
      venue_label: session.venueLabel,
      status: "open",
      device_id: getDeviceId(),
    } as any)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  session.serverBatchId = (data as any).id;
  await saveSession(session);
  return session.serverBatchId!;
}

async function uploadOneReport(session: OfflineSession, report: OfflineReport): Promise<void> {
  const batchId = await ensureServerBatch(session);

  report.status = "uploading";
  await saveReport(report);

  // Upload PF folder + ESS report + recordings (each file resumes independently)
  let pfFolderPath: string | null = null;
  for (const f of report.pfFiles) {
    const p = await uploadFile(report, "pf", f);
    if (!pfFolderPath) pfFolderPath = p.substring(0, p.lastIndexOf("/"));
  }
  let essPath: string | null = null;
  if (report.essFile) essPath = await uploadFile(report, "ess", report.essFile);
  const recordingPaths: string[] = [];
  for (const f of report.recordings ?? []) recordingPaths.push(await uploadFile(report, "recordings", f));

  // Auto-link on exact ID + name match
  const [riskCandidateId, applicationId] = await Promise.all([
    findRiskAssessmentLink(report).catch(() => null),
    findScreeningLink(report).catch(() => null),
  ]);

  const { error } = await supabase.from("examiner_report_drafts" as any).upsert(
    {
      id: report.id,
      batch_id: batchId,
      examiner_user_id: session.examinerUserId,
      test_type: report.testType,
      candidate_first_name: report.firstName,
      candidate_surname: report.surname,
      candidate_id_number: report.idNumber || null,
      answers: report.answers as any,
      overall_result: report.answers.overallResult,
      examiner_notes: report.answers.examinerNotes || null,
      pf_folder_path: pfFolderPath,
      ess_report_path: essPath,
      is_walk_in: report.isWalkIn,
      status: "uploaded",
      captured_at: report.capturedAt,
      published_at: report.publishedAt,
      uploaded_at: new Date().toISOString(),
      linked_risk_candidate_id: riskCandidateId,
      linked_application_id: applicationId,
      device_id: getDeviceId(),
    } as any,
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);

  report.status = "uploaded";
  report.uploadedAt = new Date().toISOString();
  report.lastError = undefined;
  await saveReport(report);
}

async function maybeReleaseBatch(session: OfflineSession): Promise<void> {
  const reports = await listReports(session.id);
  if (reports.length === 0) return;
  const allUploaded = reports.every((r) => r.status === "uploaded");
  if (allUploaded && session.status !== "released") {
    session.status = "released";
    await saveSession(session);
    if (session.serverBatchId) {
      await supabase
        .from("examiner_report_batches" as any)
        .update({ status: "released", released_at: new Date().toISOString() } as any)
        .eq("id", session.serverBatchId);
    }
  }
}

let syncing = false;

/** Upload every locally published report. Returns counts. */
export async function syncOfflineReports(
  examinerUserId: string,
  onProgress?: (msg: string) => void
): Promise<{ uploaded: number; failed: number }> {
  if (syncing) return { uploaded: 0, failed: 0 };
  syncing = true;
  let uploaded = 0;
  let failed = 0;
  try {
    const all = await listAllReports(examinerUserId);
    const pending = all.filter(({ report }) => report.status === "published_waiting" || report.status === "error");
    for (const { session, report } of pending) {
      onProgress?.(`Uploading ${report.firstName} ${report.surname}…`);
      try {
        await uploadOneReport(session, report);
        uploaded++;
      } catch (e: any) {
        failed++;
        report.status = "error";
        report.lastError = e?.message || "Upload failed";
        await saveReport(report);
      }
    }
    // Release any batch whose last report is now uploaded
    const sessions = new Map(all.map(({ session }) => [session.id, session]));
    for (const s of sessions.values()) {
      try {
        await maybeReleaseBatch(s);
      } catch {
        /* ignore */
      }
    }
  } finally {
    syncing = false;
  }
  return { uploaded, failed };
}
