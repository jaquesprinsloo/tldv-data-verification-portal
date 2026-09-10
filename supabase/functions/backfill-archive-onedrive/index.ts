// Backfills OneDrive copies for archive reports and indemnities that were
// imported before OneDrive mirroring existed. Processes a small bounded batch
// per call and reports how much work is left, so the caller can loop safely.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Sub = {
  id: string;
  order_number: string;
  client_id: string | null;
  archive_report_path: string | null;
  archive_report_name: string | null;
  report_onedrive_item_id: string | null;
  report_shared_onedrive_item_id: string | null;
  indemnity_files: any[] | null;
};

/** How many single OneDrive copies this submission still needs (internal + shared). */
const pendingCopies = (s: Sub) => {
  let n = 0;
  if (s.archive_report_path) {
    if (!s.report_onedrive_item_id) n += 1;
    if (!s.report_shared_onedrive_item_id) n += 1;
  }
  for (const f of Array.isArray(s.indemnity_files) ? s.indemnity_files : []) {
    if (!f?.path) continue;
    if (!f?.onedrive_item_id) n += 1;
    if (!f?.shared_onedrive_item_id) n += 1;
  }
  return n;
};

const needsWork = (s: Sub) => pendingCopies(s) > 0;


function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ success: false, error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ success: false, error: "Unauthorized" }, 401);
    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.some((r: string) => ["admin", "master_admin"].includes(r))) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    // Each copy means loading a whole PDF into memory and re-encoding it, which is
    // the expensive part. Budget the work per call in single copies (not orders) so
    // a store with many indemnities can never blow the function's CPU/time limit.
    const maxCopies = Math.min(Math.max(Number(body?.maxCopies) || 4, 1), 10);
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 30_000;

    const countOnly = !!body?.countOnly;

    // Every archive submission that still carries a document.
    const { data: subsRaw, error: subsErr } = await admin
      .from("manual_risk_submissions")
      .select(
        "id, order_number, client_id, archive_report_path, archive_report_name, report_onedrive_item_id, report_shared_onedrive_item_id, indemnity_files",
      )
      .eq("is_archive", true)
      .order("created_at", { ascending: true });
    if (subsErr) throw subsErr;

    const pending = ((subsRaw ?? []) as Sub[]).filter(needsWork);
    if (countOnly) return json({ success: true, remaining: pending.length, processed: 0, uploaded: 0, failed: 0 });
    if (!pending.length) return json({ success: true, remaining: 0, processed: 0, uploaded: 0, failed: 0, logs: [] });

    const clientIds = Array.from(new Set(pending.map((s) => s.client_id).filter(Boolean)));
    const { data: clientRows } = await admin
      .from("manual_risk_clients").select("id, client_name").in("id", clientIds as string[]);
    const clientName = new Map((clientRows ?? []).map((c: any) => [c.id, c.client_name]));

    const push = async (args: {
      fileName: string; base64: string; contentType: string; clientName: string;
      orderNumber: string; kind: "report" | "indemnity"; shared: boolean;
    }) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-manual-risk-to-onedrive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: args.fileName,
          fileBase64: args.base64,
          contentType: args.contentType,
          clientName: args.clientName,
          orderNumber: args.orderNumber,
          kind: args.kind,
          shared: args.shared,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(`[${res.status}] ${data?.error ?? "OneDrive upload failed"}`);
      }
      return data as { webUrl: string | null; itemId: string | null; fullPath: string | null };
    };

    const download = async (bucket: string, path: string) => {
      const { data, error } = await admin.storage.from(bucket).download(path);
      if (error || !data) throw new Error(error?.message ?? "File missing from storage");
      const bytes = new Uint8Array(await data.arrayBuffer());
      return { base64: toBase64(bytes), contentType: data.type || "application/pdf" };
    };

    const logs: string[] = [];
    let uploaded = 0, failed = 0, processed = 0, copies = 0;
    const haveBudget = () => copies < maxCopies && Date.now() - startedAt < TIME_BUDGET_MS;

    for (const sub of pending) {
      if (!haveBudget()) break;
      processed += 1;
      const client = clientName.get(sub.client_id ?? "") ?? "Unassigned";

      // ---- report ----
      if (sub.archive_report_path && (!sub.report_onedrive_item_id || !sub.report_shared_onedrive_item_id)) {

        try {
          const file = await download("archive-reports", sub.archive_report_path);
          const name = sub.archive_report_name || sub.archive_report_path.split("/").pop() || "report.pdf";
          const update: Record<string, unknown> = {};
          if (!sub.report_onedrive_item_id) {
            const od = await push({ ...file, fileName: name, clientName: client, orderNumber: sub.order_number, kind: "report", shared: false });
            update.report_onedrive_web_url = od.webUrl;
            update.report_onedrive_item_id = od.itemId;
            update.report_onedrive_path = od.fullPath;
            copies += 1;
          }
          if (!sub.report_shared_onedrive_item_id) {
            const od = await push({ ...file, fileName: name, clientName: client, orderNumber: sub.order_number, kind: "report", shared: true });
            update.report_shared_onedrive_web_url = od.webUrl;
            update.report_shared_onedrive_item_id = od.itemId;
            update.report_shared_onedrive_path = od.fullPath;
            copies += 1;
          }

          if (Object.keys(update).length) {
            const { error } = await admin.from("manual_risk_submissions").update(update as any).eq("id", sub.id);
            if (error) throw error;
            uploaded += 1;
            logs.push(`${sub.order_number}: report "${name}" mirrored`);
          }
        } catch (e) {
          failed += 1;
          logs.push(`${sub.order_number}: report failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // ---- indemnities ----
      const files = Array.isArray(sub.indemnity_files) ? [...sub.indemnity_files] : [];
      let changed = false;
      for (let i = 0; i < files.length; i++) {
        const f = files[i] ?? {};
        if (!f.path || (f.onedrive_item_id && f.shared_onedrive_item_id)) continue;
        try {
          const file = await download("manual-risk-indemnities", f.path);
          const name = f.name || f.path.split("/").pop() || `indemnity-${i + 1}.pdf`;
          const next = { ...f };
          if (!f.onedrive_item_id) {
            const od = await push({ ...file, contentType: f.content_type || file.contentType, fileName: name, clientName: client, orderNumber: sub.order_number, kind: "indemnity", shared: false });
            next.onedrive_web_url = od.webUrl;
            next.onedrive_item_id = od.itemId;
          }
          if (!f.shared_onedrive_item_id) {
            const od = await push({ ...file, contentType: f.content_type || file.contentType, fileName: name, clientName: client, orderNumber: sub.order_number, kind: "indemnity", shared: true });
            next.shared_onedrive_web_url = od.webUrl;
            next.shared_onedrive_item_id = od.itemId;
          }
          files[i] = next;
          changed = true;
          uploaded += 1;
          logs.push(`${sub.order_number}: indemnity "${name}" mirrored`);
        } catch (e) {
          failed += 1;
          logs.push(`${sub.order_number}: indemnity "${f.name ?? f.path}" failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (changed) {
        const { error } = await admin
          .from("manual_risk_submissions").update({ indemnity_files: files } as any).eq("id", sub.id);
        if (error) {
          failed += 1;
          logs.push(`${sub.order_number}: could not save indemnity links — ${error.message}`);
        }
      }
    }

    return json({
      success: true,
      processed,
      uploaded,
      failed,
      remaining: Math.max(pending.length - processed, 0),
      logs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("backfill-archive-onedrive error:", message);
    return json({ success: false, error: message }, 500);
  }
});
