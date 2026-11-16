import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {COURSE as FOUR_HOURS} from '../education/study/live/courses/mnu-factchat-2026.js';
import {COURSE as TWO_HOURS} from '../education/study/live/courses/mnu-factchat-120m-2026.js';
import {validateCourse,missionContext,missionMaterials,totalMinutes,practiceMinutes} from '../education/study/live/engine/model.js';
import {practiceSourceExport} from '../education/study/live/engine/practice-source-export.js';
import {inspectOfficeDocument} from '../proposal/import.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const officeFile=out=>({name:out.filename,size:out.bytes.length,arrayBuffer:async()=>out.bytes.buffer.slice(out.bytes.byteOffset,out.bytes.byteOffset+out.bytes.byteLength)});
function verifyRealZip(out,source,kind){
  const script=[
    'import io,sys,zipfile,xml.etree.ElementTree as ET',
    'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))',
    'assert z.testzip() is None',
    'ns=z.namelist()',
    'assert len(set(ns))==len(ns)',
    'for n in ns:',
    '  if n.endswith((".xml",".rels",".hpf")): ET.fromstring(z.read(n))',
    'if "'+kind+'"=="hwp":',
    '  assert ns[0]=="mimetype" and z.read("mimetype")==b"application/hwp+zip"',
    '  assert z.getinfo("mimetype").compress_type==zipfile.ZIP_STORED',
    '  assert "Contents/header.xml" in ns and "Contents/section0.xml" in ns and "Contents/content.hpf" in ns',
    '  xml=ET.fromstring(z.read("Contents/section0.xml"))',
    '  data="".join((node.text or "") for node in xml.iter() if node.tag.endswith("}t"))',
    'else:',
    '  assert "[Content_Types].xml" in ns and "_rels/.rels" in ns and "ppt/presentation.xml" in ns and "ppt/slideMasters/slideMaster1.xml" in ns',
    '  xml=ET.fromstring(z.read("ppt/slides/slide1.xml"))',
    '  shapes=[sh for sh in xml.iter() if sh.tag.endswith("}sp")]',
    '  originals=[sh for sh in shapes if any(node.tag.endswith("}cNvPr") and node.get("name")=="실습 원문" for node in sh.iter())]',
    '  assert len(originals)==1',
    '  data="\\n".join("".join((node.text or "") for node in p.iter() if node.tag.endswith("}t")) for p in originals[0].iter() if p.tag.endswith("}p"))',
    'assert data=='+JSON.stringify(source)+', ("content mismatch",data[:200])',
    'print(len(ns))'
  ].join('\n');
  const result=spawnSync('python3',['-c',script],{input:Buffer.from(out.bytes),encoding:'utf8',maxBuffer:30000});
  assert.equal(result.status,0,result.stderr||String(result.error));
}
test('source downloads preserve both FactChat schedules and job field choices',()=>{
  assert.equal(validateCourse(FOUR_HOURS),true);
  assert.equal(validateCourse(TWO_HOURS),true);
  assert.equal(totalMinutes(FOUR_HOURS),240);
  assert.equal(totalMinutes(TWO_HOURS),120);
  assert.equal(practiceMinutes(TWO_HOURS),90);
  for(const course of [FOUR_HOURS,TWO_HOURS]){
    assert.equal(course.tracks.length,7);
    for(const field of course.tracks){
      for(const kind of ['hwp','ppt']){
        const source=missionMaterials(course,kind,field.id)[0];
        const context=missionContext(course,kind,field.id);
        assert.ok(source.text.length>65);
        const out=practiceSourceExport({courseId:course.id,trackId:field.id,kind,title:context.doc||context.topic,text:source.text});
        assert.match(out.filename,kind==='hwp'?/\.hwpx$/:/\.pptx$/);
        assert.ok(out.bytes.length>500);
      }
    }
  }
});
test('real editable HWPX and PPTX downloads are valid ZIP XML and contain exact visible source text',async()=>{
  for(const [course,track] of [[FOUR_HOURS,'admin'],[TWO_HOURS,'student'],[TWO_HOURS,'research']]){
    for(const kind of ['hwp','ppt']){
      const text=missionMaterials(course,kind,track)[0].text;
      const info=missionContext(course,kind,track);
      const out=practiceSourceExport({courseId:course.id,trackId:track,kind,title:info.doc||info.topic,text});
      verifyRealZip(out,text,kind);
      const inspected=await inspectOfficeDocument(officeFile(out));
      assert.equal(inspected.format,kind==='hwp'?'hwpx':'pptx');
      assert.ok(inspected.excerpt.includes(text.slice(0,40)),out.filename+' does not render source');
    }
  }
});
test('malicious text escaped, no invented numbers or HTML renamed as Office files',()=>{
  const raw='[가상] 숫자: 42명 / <안내> & "정확히"';
  for(const kind of ['hwp','ppt']){
    const out=practiceSourceExport({courseId:'mnu-demo',trackId:'admin',kind,title:'가상 & 테스트',text:raw});
    verifyRealZip(out,raw,kind);
    assert.equal(out.mime,kind==='hwp'?'application/hwp+zip':'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  }
  assert.throws(()=>practiceSourceExport({courseId:'x',trackId:'admin',kind:'hwp',text:''}));
  assert.throws(()=>practiceSourceExport({courseId:'x',trackId:'admin',kind:'pdf',text:'xyz'}));
});
test('all 4h/2h learner and instructor surfaces expose full source/copy/TXT/HWPX/PPTX controls',async()=>{
  const [lab,studio,guide,css]=await Promise.all([
    read('education/study/live/lab.js'),read('education/study/live/instructor.js'),
    read('education/study/live/guide/guide.js'),read('education/study/live/live.css')
  ]);
  assert.match(lab,/data-native-source/);
  assert.match(lab,/data-download-material/);
  assert.match(lab,/data-copy-material/);
  assert.match(lab,/<details class="sample-source" open>/);
  assert.match(lab,/downloadPracticeSource\(document/);
  assert.match(studio,/data-mat-native/);
  assert.match(studio,/data-mat-copy/);
  assert.match(studio,/downloadPracticeSource\(document/);
  assert.match(guide,/data-download-demo/);
  assert.match(guide,/data-copy-sample/);
  assert.match(guide,/downloadPracticeSource\(document/);
  assert.match(css,/\.sample-source/);
  assert.doesNotMatch(lab,/localStorage\.clear\(\)/);
});
