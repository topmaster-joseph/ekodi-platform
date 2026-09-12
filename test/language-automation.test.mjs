import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  extractTranslatableStrings,
  handleLanguageAutomationPublic,
  LANGUAGE_AUTOMATION_CONTRACT,
  publicTranslationTargets,
  validateTranslationItems
} from '../language-automation.js';

const source=()=>readFile(new URL('../language-automation.js',import.meta.url),'utf8');

test('source extraction keeps visible page copy and ignores executable markup',()=>{
  const html='<main aria-label="주요 콘텐츠"><h1 title="환영 제목">안녕하세요</h1><input placeholder="검색어 입력"><img alt="대표 이미지"><p>새로운 서비스 안내</p><p>새로운 서비스 안내</p><script>악성문장</script><style>.x{content:"숨김"}</style></main>';
  const strings=extractTranslatableStrings(html);
  for(const value of ['주요 콘텐츠','환영 제목','검색어 입력','대표 이미지','안녕하세요','새로운 서비스 안내'])assert.ok(strings.includes(value));
  assert.ok(!strings.includes('악성문장'));
  assert.ok(!strings.includes('숨김')); 
});

test('translation validation enforces key parity and rejects unsafe output',()=>{
  const sourceStrings=['첫 문장','둘째 문장'];
  assert.deepEqual(validateTranslationItems(sourceStrings,[{id:'t1',text:'First'},{id:'t2',text:'Second'}]),{'첫 문장':'First','둘째 문장':'Second'});
  assert.throws(()=>validateTranslationItems(sourceStrings,[{id:'t1',text:'First'}]),/translation_key_parity_failed/);
  assert.throws(()=>validateTranslationItems(['문장'],[{id:'t1',text:'<script>alert(1)</script>'}]),/translation_validation_failed/);
});
test('quality gate rejects untranslated Korean and protected-token loss',()=>{
  assert.throws(()=>validateTranslationItems(['서비스 이용 안내'],[{id:'t1',text:'서비스 이용 안내'}],{targetLocale:'en'}),/translation_untranslated_source/);
  const source='EKODI 문의 https://ekodi.kr support@ekodi.kr 2026';
  assert.throws(()=>validateTranslationItems([source],[{id:'t1',text:'Contact us'}],{targetLocale:'en'}),/translation_protected_token_lost/);
  assert.deepEqual(validateTranslationItems([source],[{id:'t1',text:'EKODI Contact https://ekodi.kr support@ekodi.kr 2026'}],{targetLocale:'en'}),{[source]:'EKODI Contact https://ekodi.kr support@ekodi.kr 2026'});
});

test('automation probes only public non-planned user content',()=>{
  const targets=publicTranslationTargets();
  assert.ok(targets.length>1);
  assert.ok(targets.some(item=>item.id==='ekodi'));
  assert.ok(targets.every(item=>item.defaultSurface==='public'));
  assert.ok(targets.every(item=>item.state!=='planned'));
  assert.equal(LANGUAGE_AUTOMATION_CONTRACT.publicSurfacesOnly,true);
  assert.equal(LANGUAGE_AUTOMATION_CONTRACT.adminReadOnly,false);
  assert.equal(LANGUAGE_AUTOMATION_CONTRACT.publicationControl,'site-scoped-and-platform-aggregate');
});

test('public readiness endpoint exposes only published locales without mutation access',async()=>{
  const response=await handleLanguageAutomationPublic(new Request('https://api.ekodi.kr/api/i18n/v1/status?service=community'),{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.publishedLocales,['ko-KR']);
  assert.equal(data.languages.find(item=>item.locale==='en')?.public,false);
  const blocked=await handleLanguageAutomationPublic(new Request('https://api.ekodi.kr/api/i18n/v1/status?service=community',{method:'POST'}),{});
  assert.equal(blocked.status,405);
});
test('publication control uses an idempotent side table so partially applied legacy columns cannot block staging',async()=>{
  const sql=await readFile(new URL('../migrations/0083_language_publication_control.sql',import.meta.url),'utf8');
  assert.match(sql,/CREATE TABLE IF NOT EXISTS language_publication_state/);
  assert.match(sql,/INSERT OR IGNORE INTO language_publication_state/);
  assert.doesNotMatch(sql,/ALTER TABLE language_site_state ADD COLUMN publication_/);
});
test('source changes hide previously published translations until revalidated',async()=>{
  const text=await source();
  assert.match(text,/WHEN stage='published' THEN 'stale'/);
  assert.match(text,/const PROBE_BATCH=6/);
  assert.match(text,/Promise\.all\(selected\.map\(service=>probeServiceSource/);
  assert.ok(text.includes("setJobStage(env,job,'release-ready'"));
  assert.ok(text.includes("setJobStage(env,job,'published'"));
  assert.match(text,/publication_status='hidden'/);
  assert.match(text,/setLanguagePublication/);
  assert.match(text,/handleLanguageTenantAdmin/);
});