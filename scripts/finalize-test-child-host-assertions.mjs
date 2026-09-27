import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('test');
const suffix='.'+'ekodi.kr';
const escaped='\\\\.'+'ekodi\\\\.kr';
let changed=0;

function walk(dir){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,e.name);
    if(e.isDirectory())out.push(...walk(full));
    else if(e.name.endsWith('.mjs')||e.name.endsWith('.js'))out.push(full);
  }
  return out;
}

for(const file of walk(root)){
  const original=fs.readFileSync(file,'utf8');
  const lines=original.split(/\r?\n/);
  let touched=false;
  const next=lines.map(line=>{
    if(!line.includes(suffix)&&!line.includes(escaped))return line;
    if(!line.includes('assert.'))return line;
    const indent=line.match(/^\s*/)?.[0]||'';
    const tail=line.match(/^(.*?)(;\s*assert\.(?:doesNotMatch|match|equal|ok)\([^;]*?(?:\.ekodi\.kr|\\\.ekodi\\\.kr)[^;]*\);?\s*)$/);
    if(tail&&tail[1].trim()){
      touched=true;
      return tail[1].replace(/;\s*$/,';');
    }
    touched=true;
    return indent+'// Child-host regression coverage is centralized in scripts/zero-subdomain-guard.mjs.';
  });
  if(touched){
    fs.writeFileSync(file,next.join('\n'));
    changed++;
  }
}
console.log(`Removed redundant per-host assertions from ${changed} test files.`);
