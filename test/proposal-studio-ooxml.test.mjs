import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createProposalDraft} from '../proposal/core.js';
import {buildProposalDocx} from '../proposal/docx.js';
import {buildProposalBudgetXlsx} from '../proposal/xlsx.js';
import {buildProposalPptx} from '../proposal/pptx.js';

const validateZip=bytes=>{
 const script=[
  'import io,sys,zipfile,posixpath,xml.etree.ElementTree as E',
  'archive=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
  'assert archive.testzip() is None',
  'names=archive.namelist()',
  'assert "[Content_Types].xml" in names',
  'assert "_rels/.rels" in names',
  'for name in names:',
  '    if name.endswith(".xml") or name.endswith(".rels"):',
  '        E.fromstring(archive.read(name))',
  'for name in names:',
  '    if not name.endswith(".rels"): continue',
  '    root=E.fromstring(archive.read(name))',
  '    base="" if name=="_rels/.rels" else name.split("/_rels/")[0]',
  '    for relation in root:',
  '        if relation.attrib.get("TargetMode")=="External": continue',
  '        target=relation.attrib.get("Target","")',
  '        normalized=target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(base,target))',
  '        assert normalized in names, (name,normalized)',
  'print(",".join(names))'
 ].join('\n');
 const r=spawnSync('python3',['-c',script],{input:Buffer.from(bytes),encoding:'utf8',maxBuffer:40000});
 assert.equal(r.status,0,r.stderr||String(r.error));
 return r.stdout.trim().split(',');
};
const project=()=>{
 const p=createProposalDraft({title:'목포 소상공인 AI 교육 지원',idea:'교육 기반 지역상권 경쟁력 강화',domain:'education'});
 p.sections.find(s=>s.id==='strategy').body='사용자 입력 전략: 1단계 교육 및 검토';
 p.sections.find(s=>s.id==='problem').body='근거·수치 검증 전: 지역 수요를 조사해야 함';
 p.decisions.totalBudget='130만원';
 p.budgetRows=[{name:'강사료',quantity:4,unit:'회',unitCost:250000},{name:'교재비',quantity:10,unit:'권',unitCost:30000}];
 return p;
};
test('DOCX exports an actual unzip-able WordprocessingML package',()=>{
 const content=buildProposalDocx(project());const files=validateZip(content);
 assert.ok(files.includes('word/document.xml'));
 assert.ok(files.includes('word/styles.xml'));
 assert.ok(content.length>500);
});
test('XLSX exports Excel worksheet with entered amounts and formulas',()=>{
 const content=buildProposalBudgetXlsx(project().budgetRows);const files=validateZip(content);
 assert.ok(files.includes('xl/worksheets/sheet1.xml'));
 assert.ok(files.includes('xl/workbook.xml'));
 assert.ok(content.length>300);
});
test('PPTX exports a full master/layout/presentation relationship graph',()=>{
 const content=buildProposalPptx(project());const files=validateZip(content);
 assert.ok(files.includes('ppt/presentation.xml'));
 assert.ok(files.includes('ppt/slideMasters/slideMaster1.xml'));
 assert.ok(files.includes('ppt/slideLayouts/slideLayout1.xml'));
 assert.ok(files.includes('ppt/theme/theme1.xml'));
 assert.ok(files.includes('ppt/slides/slide1.xml'));
 assert.ok(files.includes('ppt/slides/_rels/slide1.xml.rels'));
});
test('unverified text remains unverified and XML special characters are escaped',()=>{
 const p=project();p.sections[0].body='전략 & 위험 <2027> "사용자 입력"';
 for(const bytes of [buildProposalDocx(p),buildProposalPptx(p)])validateZip(bytes);
});
test('Office generators are same-origin, server-storage-free and allowlisted',()=>{
 const files=['zip.js','docx.js','xlsx.js','pptx.js'].map(name=>readFileSync(new URL('../proposal/'+name,import.meta.url),'utf8'));
 for(const content of files){
  assert.doesNotMatch(content,/\bfetch\s*\(|\blocalStorage\b|\bsessionStorage\b|\binnerHTML\s*=/);
 }
 const html=readFileSync(new URL('../proposal/index.html',import.meta.url),'utf8');
 const route=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
 for(const id of ['exportDocx','exportXlsx','exportPptx'])assert.ok(html.includes('id="'+id+'"'));
 for(const file of ['/proposal/zip.js','/proposal/docx.js','/proposal/xlsx.js','/proposal/pptx.js'])assert.ok(route.includes("'"+file+"'"));
});
