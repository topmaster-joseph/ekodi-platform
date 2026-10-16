#!/usr/bin/env node
// Read-only GitHub Actions inventory. No tokens, network, or mutations.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const dir = join(process.cwd(), '.github', 'workflows');
const files = (await readdir(dir)).filter(f => /\.ya?ml$/i.test(f)).sort();
const items = [];
for (const file of files) {
  const source = await readFile(join(dir, file), 'utf8');
  const lines = source.split(/\r?\n/);
  const begin = lines.findIndex(l => /^(on|'on'|"on")\s*:/.test(l));
  const end = begin < 0 ? begin : lines.findIndex((l,i) => i > begin && /^[^\s#][^:]*:/.test(l));
  const trigger = begin < 0 ? '' : lines.slice(begin, end < 0 ? undefined : end).join('\n');
  const name = lines.find(l => /^name\s*:/.test(l))?.replace(/^name\s*:\s*/, '').trim() || file;
  const crons = [...trigger.matchAll(/\bcron\s*:\s*['"]?([^\n'"#]+)/g)].map(m => m[1].trim());
  items.push({file,name,crons,triggers:Object.fromEntries(['schedule','push','pull_request','workflow_dispatch','workflow_call'].map(k => [k,new RegExp('\\b'+k+'\\s*:').test(trigger)]))});
}
const duplicates = (key) => {
  const grouped = new Map();
  for (const item of items) for (const value of key(item)) grouped.set(value, [...(grouped.get(value)||[]), item.file]);
  return [...grouped].filter(([,f])=>f.length>1).map(([value,files])=>({value,files}));
};
console.log(JSON.stringify({
  schema_version:1, generated_at:new Date().toISOString(),
  total:items.length, scheduled:items.filter(i=>i.triggers.schedule).length,
  duplicate_names:duplicates(i=>[i.name]),
  same_cron_candidates:duplicates(i=>i.crons),
  note:'Matching schedules are candidates for manual review, not confirmed duplicated work or billed usage.',
  items
},null,2));
