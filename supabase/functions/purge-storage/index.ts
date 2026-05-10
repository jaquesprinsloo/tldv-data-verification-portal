import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const buckets = ["polygraph-reports","pending-documents","candex-selfies","candex-videos","employee-selfies","employee-ids","employee-documents","invoices","dismissal-documents","proof-of-residence"];
  const summary: Record<string, number> = {};

  async function listAll(bucket: string, prefix = ""): Promise<string[]> {
    const out: string[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supa.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error || !data || data.length === 0) break;
      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          out.push(...await listAll(bucket, path));
        } else {
          out.push(path);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
    return out;
  }

  for (const b of buckets) {
    const files = await listAll(b);
    summary[b] = files.length;
    for (let i = 0; i < files.length; i += 100) {
      await supa.storage.from(b).remove(files.slice(i, i + 100));
    }
  }
  return new Response(JSON.stringify({ ok: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
