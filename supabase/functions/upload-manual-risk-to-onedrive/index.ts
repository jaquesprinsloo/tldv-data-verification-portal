// Uploads Manual Risk Assessment files (report PDF + candidate indemnities) to OneDrive
// Folder: /PreAppliCheck/ManualRiskAssessments/{ClientName}/{OrderNumber}/[Indemnities/]{file}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/microsoft_onedrive";

import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/",
  "application/octet-stream",
];

function sanitize(part: string): string {
  return (part || "")
    .replace(/[\\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120) || "Unknown";
}

async function gatewayFetch(path: string, init: RequestInit, lovableKey: string, oneDriveKey: string) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${lovableKey}`);
  headers.set("X-Connection-Api-Key", oneDriveKey);
  return fetch(`${GATEWAY_URL}${path}`, { ...init, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.some((r: string) => ["admin", "master_admin"].includes(r))) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const ONEDRIVE_API_KEY = Deno.env.get("MICROSOFT_ONEDRIVE_API_KEY");
    if (!ONEDRIVE_API_KEY) throw new Error("MICROSOFT_ONEDRIVE_API_KEY is not configured");

    const body = await req.json();
    const {
      action,
      itemId: deleteItemId,
      fileName,
      fileBase64,
      contentType,
      clientName,
      orderNumber,
      kind, // "report" | "indemnity" | "supplier" | "invoice"
      shared, // true => client-facing folder (never supplier reports / invoices)
    } = body || {};

    if (shared && kind !== "report" && kind !== "indemnity") {
      return new Response(
        JSON.stringify({ success: false, error: "Only reports and indemnities may be placed in the client-shared folder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Delete an existing OneDrive item by id
    if (action === "delete") {
      if (!deleteItemId) {
        return new Response(
          JSON.stringify({ success: false, error: "itemId is required for delete" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const delRes = await gatewayFetch(
        `/me/drive/items/${encodeURIComponent(deleteItemId)}`,
        { method: "DELETE" },
        LOVABLE_API_KEY,
        ONEDRIVE_API_KEY,
      );
      // 204 = deleted, 404 = already gone (treat as success)
      if (delRes.status !== 204 && delRes.status !== 404) {
        const txt = await delRes.text().catch(() => "");
        throw new Error(`OneDrive delete failed [${delRes.status}]: ${txt}`);
      }
      return new Response(
        JSON.stringify({ success: true, deleted: true, itemId: deleteItemId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!fileName || !fileBase64 || !orderNumber) {
      return new Response(
        JSON.stringify({ success: false, error: "fileName, fileBase64 and orderNumber are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mime = String(contentType || "application/octet-stream").toLowerCase();
    if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported contentType: ${mime}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const binaryStr = atob(fileBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const totalSize = bytes.byteLength;
    if (totalSize > MAX_UPLOAD_BYTES) {
      return new Response(
        JSON.stringify({ success: false, error: `File exceeds maximum size` }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const client = sanitize(clientName || "Unassigned");
    const order = sanitize(orderNumber);
    const subFolder =
      kind === "indemnity" ? "/Indemnities" :
      kind === "supplier" ? "/SupplierReports" : "";
    // Invoices are filed per client under a single Invoices folder, keyed by the
    // invoice reference (passed as orderNumber) so one invoice maps to one batch.
    // Shared copies live in a separate per-client tree that can be shared with the
    // client directly; it never contains supplier reports or invoices.
    const folderPath = shared
      ? `PreAppliCheck/ClientShared/${client}/${order}${subFolder}`
      : kind === "invoice"
        ? `PreAppliCheck/ManualRiskAssessments/${client}/Invoices/${order}`
        : `PreAppliCheck/ManualRiskAssessments/${client}/${order}${subFolder}`;
    const safeFileName = sanitize(fileName.replace(/\//g, "_"));
    const fullPath = `${folderPath}/${safeFileName}`;
    const encodedPath = encodeURI(fullPath);

    const SIMPLE_LIMIT = 4 * 1024 * 1024;
    let webUrl: string | null = null;
    let itemId: string | null = null;

    if (totalSize <= SIMPLE_LIMIT) {
      // OneDrive returns 409 (nameAlreadyExists / resourceModified) when the same
      // file is written concurrently or already exists. Force a replace and retry
      // a few times; if it still conflicts, fall back to reading the existing item.
      const readExisting = async () => {
        for (let i = 0; i < 3; i++) {
          const res = await gatewayFetch(
            `/me/drive/root:/${encodedPath}`,
            { method: "GET" },
            LOVABLE_API_KEY,
            ONEDRIVE_API_KEY,
          );
          const json = await res.json().catch(() => ({}));
          if (res.ok && json?.id) return json;
          await new Promise((r) => setTimeout(r, 600 * (i + 1)));
        }
        return null;
      };

      let data: any = null;
      let lastStatus = 0;
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await gatewayFetch(
          `/me/drive/root:/${encodedPath}:/content?@microsoft.graph.conflictBehavior=replace`,
          {
            method: "PUT",
            headers: { "Content-Type": contentType || "application/octet-stream" },
            body: bytes,
          },
          LOVABLE_API_KEY,
          ONEDRIVE_API_KEY,
        );
        data = await res.json().catch(() => ({}));
        lastStatus = res.status;
        if (res.ok) break;
        if (res.status !== 409 && res.status !== 423 && res.status < 500) {
          throw new Error(`OneDrive upload failed [${res.status}]: ${JSON.stringify(data)}`);
        }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }

      if (lastStatus < 200 || lastStatus >= 300) {
        // Last resort: the file most likely landed already — return the existing item.
        const existingRes = await gatewayFetch(
          `/me/drive/root:/${encodedPath}`,
          { method: "GET" },
          LOVABLE_API_KEY,
          ONEDRIVE_API_KEY,
        );
        const existing = await existingRes.json().catch(() => ({}));
        if (!existingRes.ok || !existing?.id) {
          throw new Error(`OneDrive upload failed [${lastStatus}]: ${JSON.stringify(data)}`);
        }
        data = existing;
      }
      webUrl = data.webUrl ?? null;
      itemId = data.id ?? null;

    } else {
      const sessionRes = await gatewayFetch(
        `/me/drive/root:/${encodedPath}:/createUploadSession`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: { "@microsoft.graph.conflictBehavior": "rename", name: safeFileName },
          }),
        },
        LOVABLE_API_KEY,
        ONEDRIVE_API_KEY,
      );
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData.uploadUrl) {
        throw new Error(`OneDrive upload session failed [${sessionRes.status}]: ${JSON.stringify(sessionData)}`);
      }
      const uploadUrl = sessionData.uploadUrl as string;
      const CHUNK = 5 * 320 * 1024;
      let offset = 0;
      let lastJson: any = null;
      while (offset < totalSize) {
        const end = Math.min(offset + CHUNK, totalSize);
        const chunk = bytes.subarray(offset, end);
        const range = `bytes ${offset}-${end - 1}/${totalSize}`;
        const chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Length": String(chunk.byteLength), "Content-Range": range },
          body: chunk,
        });
        if (chunkRes.status === 202) {
          await chunkRes.text().catch(() => null);
        } else if (chunkRes.status === 200 || chunkRes.status === 201) {
          lastJson = await chunkRes.json();
        } else {
          const errText = await chunkRes.text();
          throw new Error(`OneDrive chunk upload failed [${chunkRes.status}] @ ${range}: ${errText}`);
        }
        offset = end;
      }
      webUrl = lastJson?.webUrl ?? null;
      itemId = lastJson?.id ?? null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileName: safeFileName,
        folderPath,
        fullPath,
        webUrl,
        itemId,
        size: totalSize,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("upload-manual-risk-to-onedrive error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});