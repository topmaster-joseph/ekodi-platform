import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const ignoredPrefixes=['migrations/','supabase/migrations/','governance/amendments/','artifacts/','docs/'];
const ignoredFiles=new Set(['scripts/migrate-ekodi-subdomain-references.mjs']);
const files=execFileSync('git',['ls-files','-z'],{cwd:root}).toString('utf8').split('\0').filter(Boolean);
const errors=[];
const active=file=>!ignoredFiles.has(file)&&!ignoredPrefixes.some(prefix=>file.startsWith(prefix));
for(const file of files){
  if(!active(file))continue;
  let text='';try{text=fs.readFileSync(path.join(root,file),'utf8')}catch{continue}
  if(/(^|\/)wrangler[^/]*\.toml$/i.test(file)){
    for(const m of text.matchAll(/(?:pattern|route)\s*=\s*(?:\{[^\n]*pattern\s*=\s*)?"([^"]+)"/g)){
      const host=m[1].split('/')[0].toLowerCase();
      if(host.endsWith('.ekodi.kr')&&host!=='ekodi.kr')errors.push(`${file}: public route ${host}`);
    }
  }
  for(const m of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+\.ekodi\.kr)(?=[:/?#'"`\s<]|$)/gi))errors.push(`${file}: absolute URL ${m[0]}`);
}
if(errors.length){console.error(errors.slice(0,250).join('\n'));if(errors.length>250)console.error(`... ${errors.length-250} more`);process.exit(1)}
console.log('OK: active source declares no public non-apex *.ekodi.kr routes or absolute URLs.');
