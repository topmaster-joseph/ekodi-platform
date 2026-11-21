// EKODI-SUPPLY-CHAIN-001 — CI supply-chain guardrails.
// Production Workers bundle no npm packages; the exposed surface is what CI downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const dir=new URL('../.github/workflows/',import.meta.url);
async function workflows(){
  const out=[];
  for(const name of await readdir(dir))if(/\.ya?ml$/.test(name))out.push([name,await readFile(new URL(name,dir),'utf8')]);
  return out;
}
const FIRST_PARTY=/^(?:actions|github)\//;

test('third-party GitHub Actions are pinned to a full commit SHA',async()=>{
  const loose=[];
  for(const [name,text] of await workflows()){
    for(const m of text.matchAll(/^\s*-?\s*uses:\s*([^\s#'"]+)/gm)){
      const ref=m[1];
      if(ref.startsWith('./')||FIRST_PARTY.test(ref))continue;
      if(!/@[0-9a-f]{40}$/.test(ref))loose.push(`${name}: ${ref}`);
    }
  }
  assert.deepEqual(loose,[],'pin with: uses: owner/repo@<40-hex sha> # vX');
});

test('CI never installs floating or known-vulnerable browser tooling',async()=>{
  const bad=[];
  for(const [name,text] of await workflows()){
    for(const m of text.matchAll(/npm (?:install|i)\b[^\n]*/g)){
      const line=m[0];
      for(const pkg of ['playwright','@playwright/test','puppeteer','puppeteer-core']){
        const re=new RegExp(`(?:^|\\s)${pkg.replace(/[/@]/g,c=>'\\'+c)}(?:@([^\\s]+))?(?=\\s|$)`);
        const hit=line.match(re);
        if(!hit)continue;
        if(!hit[1]||hit[1]==='latest'){bad.push(`${name}: ${pkg} is not pinned`);continue;}
        if(pkg==='playwright'){
          const [a,b,c]=hit[1].split('.').map(Number);
          if(a===1&&(b<55||(b===55&&c<1)))bad.push(`${name}: playwright ${hit[1]} < 1.55.1 (GHSA browser download without TLS verification)`);
        }
      }
    }
    if(/npx\s+(?:--yes\s+)?[a-z@][^\s@]*@latest\b/.test(text))bad.push(`${name}: npx …@latest`);
  }
  assert.deepEqual(bad,[]);
});

test('repository tool manifests do not float to "latest"',async()=>{
  const files=['tools/books-publisher-agent/package.json','sites/ekodi-church/package.json','package.json'];
  for(const file of files){
    const pkg=JSON.parse(await readFile(new URL('../'+file,import.meta.url),'utf8'));
    for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies}))
      assert.notEqual(String(version).trim(),'latest',`${file}: ${name}`);
  }
});
