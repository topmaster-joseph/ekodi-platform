import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ORGANIZATIONS,PUBLIC_DEFAULT,organizationMatches,permittedForAudience,canPublishPublic,giftDisclosure,draftText,duplicateFingerprint,photoKeys,csvRows } from '../sosik-core.js';
import { handleSosikRequest } from '../sosik-api.js';
const sample=(organization='church')=>({id:'a',organization,visibility:'supporters',public_consent:0,people_present:1,external_consent:0,published_at:null});
test('organization separation: no church/mission mixing; joint record visible in both',()=>{
  assert.equal(organizationMatches('church','mission'),false);
  assert.equal(organizationMatches('mission','church'),false);
  assert.equal(organizationMatches('joint','church'),true);
  assert.equal(organizationMatches('joint','mission'),true);
  assert.deepEqual(ORGANIZATIONS,['church','mission','joint']);
});
test('foreign ministry defaults private and public requires published + consent',()=>{
  assert.equal(PUBLIC_DEFAULT,'supporters');
  assert.equal(canPublishPublic(sample()),false);
  assert.equal(permittedForAudience({...sample('church'),visibility:'public',public_consent:1,published_at:null},'site','church'),false);
  assert.equal(permittedForAudience({...sample('church'),visibility:'public',public_consent:1,published_at:'2026-11-03'},'site','church'),true);
  assert.equal(permittedForAudience({...sample('church'),visibility:'public',public_consent:0,published_at:'2026-11-03'},'site','church'),false);
});
test('external reporting requires separate subject consent, does not reuse public consent',()=>{
  assert.equal(permittedForAudience({...sample(),public_consent:1},'fan','church'),false);
  assert.equal(permittedForAudience({...sample(),external_consent:1},'fan','church'),true);
  assert.equal(permittedForAudience({...sample(),external_consent:1},'missionfund','mission'),false);
});
test('recipient organization disclosure remains distinct',()=>{
  assert.match(giftDisclosure('church'),/307-82-82097/);
  assert.match(giftDisclosure('church'),/발급 가능/);
  assert.match(giftDisclosure('mission'),/120-82-72255/);
  assert.match(giftDisclosure('mission'),/발급 불가/);
});
test('draft uses only real source and known date, missing body marked for review',()=>{
  const text=draftText([{id:'x',title:'토요모임',occurred_on:'2026-11-07',body:''}],{organization:'church',format:'letter',title:'소식'});
  assert.match(text,/토요모임/);assert.match(text,/2026-11-07/);assert.match(text,/확인필요/);assert.match(text,/목사/);
  assert.ok(!text.includes('실제 발송 완료'));
});
test('duplicate fingerprints are order independent',()=>{
  assert.equal(duplicateFingerprint([{id:'b'},{id:'a'}]),duplicateFingerprint([{id:'a'},{id:'b'}]));
});
test('image key whitelist excludes other R2 prefixes',()=>{
  assert.deepEqual(photoKeys(['sosik/media/12345678-1234-1234-1234-123456789012.jpg','../../secrets.txt','cgma/edocs/abc.jpg']),['sosik/media/12345678-1234-1234-1234-123456789012.jpg']);
});
test('CSV parser handles quotes, escaped quotes, CRLF, rejects unfinished quote',()=>{
  assert.deepEqual(csvRows('name,email\r\n"김, 윤","hello@example.org"\r\n"say ""hi""",b@example.org').slice(1),[['김, 윤','hello@example.org'],['say "hi"','b@example.org']]);
  assert.throws(()=>csvRows('"unterminated'),/닫히지/);
});
test('unauthenticated and wrong-origin mutation fail closed before D1 writes',async()=>{
  const denied=await handleSosikRequest(new Request('https://api.ekodi.kr/api/sosik/entries',{method:'POST',headers:{'origin':'https://ekodi.kr','content-type':'application/json'},body:'{}'}),{DB:{prepare(){throw Error('should never reach db');}}});
  assert.equal(denied.status,401);
  const cross=await handleSosikRequest(new Request('https://api.ekodi.kr/api/sosik/entries',{method:'POST',headers:{'origin':'https://attacker.example','content-type':'application/json'},body:'{}'}),{DB:{}});
  assert.equal(cross.status,403);
});
test('external submit and send must not be available in public interface',async()=>{
  const source=await readFile(new URL('../sosik-api.js',import.meta.url),'utf8');
  assert.match(source,/EXTERNAL_HUMAN_GATE_REQUIRED/);
  assert.ok(!source.includes('sendBulkGmail('));
  const page=await readFile(new URL('../sosik/admin/index.html',import.meta.url),'utf8');
  assert.match(page,/외부기관 제출.*차단/);
});
test('publishing and unsubscribe URLs are present in static assets',async()=>{
  const app=await readFile(new URL('../sosik/app.js',import.meta.url),'utf8');
  const home=await readFile(new URL('../sosik/index.html',import.meta.url),'utf8');
  assert.match(app,/\/publications\/.*\/approve/);
  assert.match(app,/\/unsubscribe/);
  assert.match(home,/id="subscribeForm"/);
});
