import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = createClient(url, key);
const buckets = ['polygraph-reports','pending-documents','candex-selfies','candex-videos','employee-selfies','employee-ids','employee-documents','invoices','dismissal-documents','proof-of-residence'];

async function listAll(bucket, prefix='') {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supa.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) { console.error(bucket, prefix, error.message); return out; }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || (!item.metadata && !item.id)) {
        // folder
        const sub = await listAll(bucket, path);
        out.push(...sub);
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
  console.log(b, 'files:', files.length);
  for (let i = 0; i < files.length; i += 100) {
    const chunk = files.slice(i, i+100);
    const { error } = await supa.storage.from(b).remove(chunk);
    if (error) console.error('remove err', b, error.message);
  }
}
console.log('done');
