import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HWPX_CONTRACT,
  HWPX_ROUNDTRIP_CONTRACT,
  HWPX_MIMETYPE,
  buildHwpxParts,
  sectionXmlToHtml,
} from '../my/docs/hwpx.js';

test('HWPX adapter exposes a bounded EKODI open-document contract',()=>{
  assert.equal(HWPX_CONTRACT,'ekodi.hwpx.v1');
  assert.equal(HWPX_ROUNDTRIP_CONTRACT,'ekodi.hwpx.roundtrip.v2');
  assert.equal(HWPX_MIMETYPE,'application/hwp+zip');
});

test('HWPX parts contain the required OWPML package spine and body',()=>{
  const parts=buildHwpxParts({
    title:'에코디 HWPX 실증',
    blocks:[
      {type:'heading1',text:'문서 제목'},
      {type:'paragraph',text:'한글 본문 123'},
      {type:'paragraph',text:'표 셀1\t표 셀2'},
    ],
  });
  assert.equal(parts.mimetype,HWPX_MIMETYPE);
  for(const name of ['version.xml','META-INF/container.xml','Contents/content.hpf','Contents/header.xml','Contents/section0.xml','Preview/PrvText.txt']) assert.ok(parts[name],name);
  assert.match(parts['META-INF/container.xml'],/Contents\/content\.hpf/);
  assert.match(parts['Contents/content.hpf'],/application\/xml/);
  assert.match(parts['Contents/content.hpf'],/에코디 HWPX 실증/);
  assert.match(parts['Contents/header.xml'],/함초롬바탕/);
  assert.match(parts['Contents/section0.xml'],/<hp:secPr/);
  assert.match(parts['Contents/section0.xml'],/문서 제목/);
  assert.match(parts['Contents/section0.xml'],/한글 본문 123/);
});


test('validated HWPX skeleton ships with required third-party attribution',()=>{
  const skeleton=readFileSync(new URL('../my/docs/Skeleton.hwpx',import.meta.url));
  const license=readFileSync(new URL('../my/docs/third_party/python-hwpx/LICENSE',import.meta.url),'utf8');
  const notice=readFileSync(new URL('../my/docs/third_party/python-hwpx/NOTICE',import.meta.url),'utf8');
  assert.equal(skeleton.subarray(0,2).toString('ascii'),'PK');
  assert.match(license,/Apache License/);
  assert.match(license,/Version 2.0/);
  assert.match(notice,/python-hwpx/);
  assert.match(notice,/HWPX Format/);
});

test('generated HWPX section round-trips basic document text without executing embedded objects',()=>{
  const parts=buildHwpxParts({
    title:'round trip',
    blocks:[{type:'heading2',text:'둘째 제목'},{type:'paragraph',text:'안전한 본문'}],
  });
  const html=sectionXmlToHtml(parts['Contents/section0.xml']);
  assert.match(html,/둘째 제목/);
  assert.match(html,/안전한 본문/);
  assert.doesNotMatch(html,/<script/i);
});
