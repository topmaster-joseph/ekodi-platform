import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const add=(file,line,reason,text)=>failures.push({file,line,reason,text:String(text||'').trim().slice(0,260)});
const textExt=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.md','.html','.css','.toml','.yml','.yaml','.txt','.sql','.sh','.cmd','.ps1','.xml']);
function walk(dir,base=''){
  const out=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','dist'].includes(e.name))continue;
    const rel=path.join(base,e.name),full=path.join(dir,e.name);
    if(e.isDirectory())out.push(...walk(full,rel));
    else if(textExt.has(path.extname(e.name).toLowerCase())||e.name.startsWith('.')||['_headers','_redirects'].includes(e.name))out.push(rel.replaceAll('\\','/'));
  }
  return out;
}

for(const file of walk(root)){
  if(file==='scripts/validate-apex-path-semantics.mjs'||file==='scripts/migrate-apex-paths-20260924.mjs'||file.startsWith('docs/')||file.endsWith('.md'))continue;
  let text='';try{text=fs.readFileSync(path.join(root,file),'utf8')}catch{continue}
  const lines=text.split(/\r?\n/);
  lines.forEach((line,index)=>{
    const n=index+1;
    if(/\b(?:hostname|host)\s*(?:===|==|=|:)\s*['"`]ekodi\.kr\//i.test(line))
      add(file,n,'path used as hostname',line);
    if(/\b[A-Z0-9_]*(?:HOST|HOSTNAME)[A-Z0-9_]*\s*[:=]\s*['"`]ekodi\.kr\//i.test(line))
      add(file,n,'HOST variable contains a path',line);
    if(/\bOrigin:\s*https:\/\/ekodi\.kr\//i.test(line))
      add(file,n,'HTTP Origin header contains a path',line);
    if(/access-control-allow-origin:\s*https:\/\/ekodi\.kr\//i.test(line))
      add(file,n,'CORS allow-origin contains a path',line);
    if(/\bALLOWED_ORIGINS?\b\s*[:=]\s*["'`][^"'`]*https:\/\/ekodi\.kr\//i.test(line))
      add(file,n,'CORS origin string contains a path',line);
  });
  for(const m of text.matchAll(/\bALLOWED_ORIGINS?\b\s*=\s*new Set\(\[([\s\S]*?)\]\)/gi)){
    const values=[...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x=>x[1]);
    for(const value of values){
      if(/^https:\/\/ekodi\.kr\//i.test(value)){
        const before=text.slice(0,m.index).split(/\r?\n/).length;
        add(file,before,'CORS origin Set contains a path',value);
      }
    }
  }
  for(const m of text.matchAll(/\b(?:const|let|var)\s+([A-Z0-9_]*HOSTS?[A-Z0-9_]*)\s*=\s*new Set\(\[([\s\S]*?)\]\)/gi)){
    const values=[...m[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x=>x[1]);
    for(const value of values){
      if(/^ekodi\.kr\//i.test(value)){
        const before=text.slice(0,m.index).split(/\r?\n/).length;
        add(file,before,`${m[1]} contains path-valued host`,value);
      }
    }
  }
  for(const m of text.matchAll(/\b(?:const|let|var)\s+([A-Z0-9_]*(?:HOST|HOSTNAME)[A-Z0-9_]*)\s*=\s*['"`]([^'"`]+)['"`]/gi)){
    if(/^ekodi\.kr\//i.test(m[2])){
      const before=text.slice(0,m.index).split(/\r?\n/).length;
      add(file,before,`${m[1]} contains path-valued host`,m[2]);
    }
  }
}
if(failures.length){
  console.error(`Apex-path semantic validation failed (${failures.length})`);
  for(const f of failures.slice(0,200))console.error(`- ${f.file}:${f.line} [${f.reason}] ${f.text}`);
  process.exit(1);
}
console.log('Apex-path semantic validation OK: hostname and CORS origin semantics are path-safe; apex path route patterns are allowed.');
