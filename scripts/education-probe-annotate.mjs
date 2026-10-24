#!/usr/bin/env node
// Surfaces why an Education native probe failed as GitHub workflow annotations, readable through the
// check-run API without downloading logs or artifacts. Reads only the probe's own result.json (public pages,
// no credentials) and prints a bounded number of sanitized ::error lines. Never fails on its own.
import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_PER_KIND=4;
const clean=v=>String(v??'').replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A').slice(0,600);
export function annotationsFrom(report,label='probe'){
  const out=[];
  if(!report||typeof report!=='object')return [`::error title=${clean(label)}::result.json missing or unreadable`];
  if(report.error)out.push(`::error title=${clean(label)} failed::${clean(report.error)}`);
  for(const kind of ['pageErrors','consoleErrors','requestFailures','httpErrors']){
    const rows=Array.isArray(report[kind])?report[kind]:[];
    for(const row of rows.slice(0,MAX_PER_KIND)){
      const detail=[row.profile,row.status,row.url,row.failure,row.message].filter(x=>x!==undefined&&x!=='').join(' · ');
      out.push(`::error title=${clean(label)} ${kind}::${clean(detail)}`);
    }
    if(rows.length>MAX_PER_KIND)out.push(`::error title=${clean(label)} ${kind}::+${rows.length-MAX_PER_KIND} more`);
  }
  if(report.lastSteps)out.push(`::error title=${clean(label)} last steps::${clean([].concat(report.lastSteps).join(' → '))}`);
  return out.length?out:[`::error title=${clean(label)}::probe failed without a recorded reason`];
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  const dir=process.argv[2]||'.';
  let report=null;
  try{report=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8'));}catch{}
  for(const line of annotationsFrom(report,path.basename(dir)))console.log(line);
}
