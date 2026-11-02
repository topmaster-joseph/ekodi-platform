// Private, local-only reviewer page; never turns an audio draft into public media.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const [scriptPath, draftDirectory] = process.argv.slice(2);
if(!scriptPath||!draftDirectory)throw Error('usage: node build-preset-review-page.mjs SCRIPT_JSON DRAFT_DIRECTORY');
const script=JSON.parse(readFileSync(scriptPath,'utf8'));
const draft=JSON.parse(readFileSync(join(draftDirectory,'draft-provenance.json'),'utf8'));
if(draft.status!=='draft-unapproved'||script.sha256!==draft.sourceScriptSha256||script.date!==draft.date||
  draft.speakerCloning!==false||draft.modelLicense!=='OpenRAIL-M') throw Error('invalid_draft_source');
for(const gender of ['male','female']){
  const info=draft.tracks[gender];
  const actual=createHash('sha256').update(readFileSync(join(draftDirectory,gender+'.mp3'))).digest('hex');
  if(info.file!==gender+'.mp3'||info.sha256!==actual)throw Error('draft_file_integrity_failed');
}
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=script.segments.map((x,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span> '+esc(x)+'</li>').join('\n');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EKODI 낭독 비공개 검수 · ${esc(script.date)}</title>
<style>body{max-width:980px;margin:auto;padding:24px 16px;font:16px/1.75 system-ui,sans-serif;color:#172a23;background:#f8fbfa}main{background:white;border:1px solid #d8e2dc;border-radius:16px;padding:20px}h1{font-size:1.7rem}h2{font-size:1.2rem}section{border:1px solid #d8e2dc;border-radius:12px;padding:16px;margin:12px 0}audio{width:100%}ol{padding-left:2.2rem}li{padding:5px 0}li span{color:#647970;margin-right:8px;font-variant-numeric:tabular-nums}.note{padding:12px;background:#fff3d8;border-left:4px solid #a96f00;border-radius:7px}label{display:block;padding:3px}</style>
<main><h1>에코디 매일묵상 · 비공개 음성 검수</h1><p><strong>${esc(script.date)}</strong> · ${esc(script.passage)} · 합성 음성 / 아직 미승인</p><p class="note">이 페이지는 로컬 파일에서만 청취하는 검수용입니다. 공개배포·인물 음성복제·권리 승인 기록으로 사용하지 않습니다. 성경 문구·읽기 정확성·속도·기도의 경건한 톤·잡음·누락을 확인해야 합니다.</p>
<section><h2>남성 · 에코디 기본 음색 M4</h2><audio controls preload="metadata" src="male.mp3"></audio><label><input type="checkbox"> 낭독 구간 누락 없음</label><label><input type="checkbox"> 성경 발음·억양 적절</label><label><input type="checkbox"> 음질·음량 적절</label></section>
<section><h2>여성 · 에코디 기본 음색 F5</h2><audio controls preload="metadata" src="female.mp3"></audio><label><input type="checkbox"> 낭독 구간 누락 없음</label><label><input type="checkbox"> 성경 발음·억양 적절</label><label><input type="checkbox"> 음질·음량 적절</label></section>
<details><summary>녹음 기준 원문 ${script.segments.length}개 구간</summary><ol>${lines}</ol></details><p>모델: Supertone Supertonic 3 · MIT 프로그램 / OpenRAIL-M 모델. 화자 원본은 복제하지 않았습니다.</p><p>검수 체크는 이 파일에 저장되지 않으며, 공식 배포는 별도 서명된 검수 기록과 보호된 PR을 요구합니다.</p></main></html>`;
const out=resolve(draftDirectory,'review-local.html');writeFileSync(out,html,'utf8');
console.log(JSON.stringify({date:script.date,out,sourceHash:script.sha256,reviewOnly:true}));
