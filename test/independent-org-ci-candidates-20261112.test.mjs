import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('independent organizations retain own names and existing marks; no EKODI master imposed',()=>{
 const civic=read('sites/seonammedi/public/index.html');
 assert.match(civic,/data-site-ci="civic-dialogue"/);
 assert.match(civic,/서남권 의대 설립 비상대책위원회 관련 공개 기록/);
 assert.match(civic,/시민의견/);
 assert.match(civic,/활동이력/);
 assert.doesNotMatch(civic,/data-site-ci=".*(?:ekodi-master|medical-cross)"/);
 const study=read('sites/pyeonggongmok/public/index.html');
 assert.match(study,/data-study-ci="pastor-book"/);
 assert.match(study,/<b>平<\/b>/);
 assert.match(study,/평생공부하는 목회자/);
 for(const [p,mark] of [
  ['sites/mokpo-presbytery/index.html','presbytery-cross'],
  ['sites/mokpo-presbytery/mission/index.html','mission-cross']
 ]){
  const h=read(p);
  assert.ok(h.includes('data-local-ci="'+mark+'"'),p);
  assert.ok(h.includes('<i></i>'),p);
  assert.match(h,/noindex,nofollow/);
 }
});
