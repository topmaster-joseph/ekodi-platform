import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finalizeSeonamMediRelease, repairSeonamMediHeadMarkup } from '../scripts/finalize-seonammedi-release.mjs';

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
    assert.equal(a.publishedHtmlHashes['index.html'],createHash('sha256').update(html).digest('hex'));
    const published=JSON.parse(await readFile(path.join(first.root,'.well-known/ekodi-release.json'),'utf8'));
    assert.deepEqual(published.publishedHtmlHashes,a.publishedHtmlHashes);
    assert.equal(published.rendererSha256,a.rendererSha256);
  }finally{await rm(first.output,{recursive:true,force:true});await rm(second.output,{recursive:true,force:true})}
});

test('build self-heals literal escaped newline between head tags without hiding source code',async()=>{
  const good=await fixture('Homepage A',false);
  const bad=await fixture('Homepage A',true);
  try{
    const a=await finalizeSeonamMediRelease(good.output+'/');
    const b=await finalizeSeonamMediRelease(bad.output+'/');
    const html=await readFile(path.join(bad.root,'index.html'),'utf8');
    assert.match(html, /summary_large_image">\n<meta property="og:image"/);
    assert.doesNotMatch(html, /summary_large_image">\\n/);
    assert.ok(html.includes('const okay="\\n"'));
    assert.notEqual(a.release,b.release,'the repaired source has a distinct version fingerprint');
  }finally{await rm(good.output,{recursive:true,force:true});await rm(bad.output,{recursive:true,force:true})}
});

test('HTML head repair preserves script/style and rejects unrepairable malformed markup',()=>{
  const source='<html><head><script>const x="\\n"</script><style>i:after{content:"\\n"}</style>'
    +'<meta name="twitter:card" content="summary_large_image">\\n  <meta property="og:image" content="x">'
    +'</head><body>body</body></html>';
  const result=repairSeonamMediHeadMarkup(source);
  assert.equal(result.repaired,1);
  assert.ok(result.html.includes('<script>const x="\\n"</script>'));
  assert.ok(result.html.includes('<style>i:after{content:"\\n"}</style>'));
  assert.ok(result.html.includes('summary_large_image">\n  <meta property="og:image"'));
  assert.throws(()=>repairSeonamMediHeadMarkup('<head><meta content="literal \\n value"></head>'),/unrepairable_literal/);
  assert.throws(()=>repairSeonamMediHeadMarkup('<html><body>missing head</body></html>'),/html_head_missing/);
});
