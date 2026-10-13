import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finalizeSeonamMediRelease } from '../scripts/finalize-seonammedi-release.mjs';

const assets=[
  'app.js','app.css','voice-public-admin.js',
  'admin/admin.js','admin/admin-minutes.js','admin/admin.css'
];
const pages=['index.html','admin/index.html','finance/index.html','notices/index.html'];

async function fixture(homeTitle='Homepage A',escapedHead=false){
  const output=await mkdtemp(path.join(tmpdir(),'seonammedi-release-head-'));
  const root=path.join(output,'seonammedi');
  await mkdir(path.join(root,'admin'),{recursive:true});
  await mkdir(path.join(root,'finance'),{recursive:true});
  await mkdir(path.join(root,'notices'),{recursive:true});
  for(const name of assets)await writeFile(path.join(root,name),'/* fixed asset */');
  for(const name of pages){
    const title=name==='index.html'?homeTitle:name;
    const whitespace=escapedHead?'\\n':'\n';
    const html='<!doctype html><html><head><meta name="twitter:card" content="summary_large_image">'
      +(name==='index.html'?whitespace:'\n')
      +'<meta property="og:image" content="/seonammedi/hero.png">'
      +'<title>'+title+'</title><script>const okay="\\n";</script></head><body>ready</body></html>';
    await writeFile(path.join(root,name),html);
  }
  return {output,root};
}

test('release fingerprint changes when only homepage HTML changes',async()=>{
  const first=await fixture('Homepage A');
  const second=await fixture('Homepage B');
  try{
    const a=await finalizeSeonamMediRelease(first.output+'/');
    const b=await finalizeSeonamMediRelease(second.output+'/');
    assert.notEqual(a.release,b.release);
    assert.notEqual(a.inputHtmlHashes['index.html'],b.inputHtmlHashes['index.html']);
    assert.equal(a.assets['app.js'].sha256,b.assets['app.js'].sha256);
    assert.equal(a.inputHtmlHashes['admin/index.html'],b.inputHtmlHashes['admin/index.html']);
    const html=await readFile(path.join(first.root,'index.html'),'utf8');
    assert.ok(html.includes('content="'+a.release+'"'));
  }finally{await rm(first.output,{recursive:true,force:true});await rm(second.output,{recursive:true,force:true})}
});

test('build rejects a literal escaped newline in homepage head, ignoring script source',async()=>{
  const good=await fixture('Homepage A',false);
  const bad=await fixture('Homepage A',true);
  try{
    await assert.doesNotReject(finalizeSeonamMediRelease(good.output+'/'));
    await assert.rejects(finalizeSeonamMediRelease(bad.output+'/'),/seonammedi_homepage_head_contains_literal_escaped_whitespace/);
  }finally{await rm(good.output,{recursive:true,force:true});await rm(bad.output,{recursive:true,force:true})}
});
