import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../my/presentation/index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../my/presentation/presentation.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../my-worker.js',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../my/index.html',import.meta.url),'utf8');
const registry=JSON.parse(fs.readFileSync(new URL('../config/capability-registry.json',import.meta.url),'utf8'));
const vendor=new URL('../my/presentation/vendor/',import.meta.url);

test('My EKODI exposes the canonical presentation entry and capability',()=>{
  assert.match(home,/\/my\/presentation\//);
  assert.match(worker,/presentationEngine:true/);
  assert.match(worker,/presentationProcessing:'browser-local-first'/);
  const capability=registry.capabilities.find(item=>item.id==='core.presentation');
  assert.equal(capability?.provider?.surface,'https://ekodi.kr/my/presentation/');
  assert.equal(capability?.provider?.entitlements,'ekodi.entitlements.v1');
});

test('presentation surface supports required local-first formats',()=>{
  for(const ext of ['pptx','pdf','docx','hwp','hwpx','xlsx','xls','csv','txt','md','html']) assert.match(js,new RegExp(`['\"]${ext}['\"]`),ext);
  assert.match(html,/파일은 기본적으로 이 브라우저에서 처리/);
  assert.match(js,/const API='https:\/\/api\.ekodi\.kr\/api\/entitlements'/);
  assert.match(js,/\$\{API\}\/me/);
  assert.match(js,/requestFullscreen/);
  assert.match(js,/name==='src'.*!value\.startsWith\('data:'\).*!value\.startsWith\('blob:'\)/);
});
test('presentation parser assets are pinned and self-hosted',()=>{
  for(const name of [
    'pptx-renderer-1.2.4.js','pdf-6.3.289.mjs','pdf.worker-6.3.289.mjs',
    'mammoth-1.12.3.min.js','hwpxjs-0.4.0.mjs','xlsx-0.18.5.min.js',
    'LICENSE-pptx-renderer.txt','LICENSE-pdfjs.txt','LICENSE-mammoth.txt','LICENSE-hwpxjs.txt','LICENSE-xlsx.txt'
  ]) assert.equal(fs.existsSync(new URL(name,vendor)),true,name);
  for(const parser of ['pptx-renderer-1.2.4.js','pdf-6.3.289.mjs','mammoth-1.12.3.min.js','hwpxjs-0.4.0.mjs','xlsx-0.18.5.min.js']) assert.match(js,new RegExp(parser.replaceAll('.','\\.')));
  assert.doesNotMatch(js,/fetch\([^)]*file/i);
});

test('presentation navigation and presenter notes remain available in free core UI',()=>{
  assert.match(html,/id="speakerNotes"/);
  assert.match(html,/id="fullscreen"/);
  assert.match(js,/ArrowRight/);
  assert.match(js,/ArrowLeft/);
  assert.match(js,/presentation\.speaker-notes/);
});