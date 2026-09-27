import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('production Control API CORS allows only the apex and constitution-registered customer domains',async()=>{
  const [wrangler,constitutionRaw]=await Promise.all([
    read('wrangler.api.toml'),
    read('governance/constitution/constitution.json'),
  ]);
  const line=wrangler.match(/ALLOWED_ORIGINS\s*=\s*"([^"]*)"/)?.[1]||'';
  const origins=line.split(',').map(value=>value.trim()).filter(Boolean);
  const constitution=JSON.parse(constitutionRaw);
  const customerHosts=new Set(Object.keys(constitution.customerOwnedDomainMappings||{}).map(value=>String(value).toLowerCase()));

  assert.ok(origins.includes('https://ekodi.kr'));
  for(const origin of origins){
    const url=new URL(origin);
    assert.equal(url.protocol,'https:');
    const host=url.hostname.toLowerCase();
    assert.ok(host==='ekodi.kr'||customerHosts.has(host),origin);
    assert.equal(host.endsWith('.ekodi.kr'),false,origin);
  }
});

test('current production Control API CORS keeps only the canonical apex plus CGMA customer domain',async()=>{
  const wrangler=await read('wrangler.api.toml');
  const line=wrangler.match(/ALLOWED_ORIGINS\s*=\s*"([^"]*)"/)?.[1]||'';
  assert.deepEqual(line.split(',').map(value=>value.trim()).filter(Boolean),[
    'https://ekodi.kr',
    'https://cgma.or.kr',
  ]);
});
