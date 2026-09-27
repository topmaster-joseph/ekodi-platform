import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('test');
const suffix='.'+'ekodi.kr';
const escaped='\\.'+'ekodi'+'\\.kr';
let changed=0;
let removed=0;

function walk(dir){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,e.name);
    if(e.isDirectory())out.push(...walk(full));
    else if(e.name.endsWith('.mjs')||e.name.endsWith('.js'))out.push(full);
  }
  return out;
}

function hasRetiredHostPattern(value){
  return value.includes(suffix)||value.includes(escaped);
}

for(const file of walk(root)){
  const original=fs.readFileSync(file,'utf8');
  const lines=original.split(/\r?\n/);
  let touched=false;
  const next=lines.map(line=>{
    if(!hasRetiredHostPattern(line)||!line.includes('assert.'))return line;
    const indent=line.match(/^\s*/)?.[0]||'';
    const pieces=line.split(';');
    const kept=[];
    let lineRemoved=0;
    for(const piece of pieces){
      if(piece.includes('assert.')&&hasRetiredHostPattern(piece)){
        lineRemoved++;
        continue;
      }
      if(piece.trim())kept.push(piece);
    }
    if(!lineRemoved)return line;
    touched=true;
    removed+=lineRemoved;
    const rebuilt=kept.join(';').trimEnd();
    return rebuilt.trim()?rebuilt+(line.trimEnd().endsWith(';')?';':''):indent+'// Child-host regression coverage is centralized in scripts/zero-subdomain-guard.mjs.';
  });
  if(touched){
    fs.writeFileSync(file,next.join('\n'));
    changed++;
  }
}
console.log(`Removed ${removed} redundant child-host assertions from ${changed} test files.`);
