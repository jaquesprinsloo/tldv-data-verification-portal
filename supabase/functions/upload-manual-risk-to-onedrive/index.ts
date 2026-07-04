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
      fileName,
      fileBase64,
      contentType,
      clientName,
      orderNumber,
      kind, // "report" | "indemnity"
    } = body || {};

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
    const subFolder = kind === "indemnity" ? "/Indemnities" : "";
    const folderPath = `PreAppliCheck/ManualRiskAssessments/${client}/${order}${subFolder}`;
    const safeFileName = sanitize(fileName.replace(/\//g, "_"));
    const fullPath = `${folderPath}/${safeFileName}`;
    const encodedPath = encodeURI(fullPath);

    const SIMPLE_LIMIT = 4 * 1024 * 1024;
    let webUrl: string | null = null;
    let itemId: string | null = null;

    if (totalSize <= SIMPLE_LIMIT) {
      const res = await gatewayFetch(
        `/me/drive/root:/${encodedPath}:/content`,
        {
          method: "PUT",
          headers: { "Content-Type": contentType || "application/octet-stream" },
          body: bytes,
        },
        LOVABLE_API_KEY,
        ONEDRIVE_API_KEY,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`OneDrive upload failed [${res.status}]: ${JSON.stringify(data)}`);
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