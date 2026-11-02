(()=>{
'use strict';
const section=document.querySelector('[data-church-weekly]');
if(!section)return;
const $=selector=>section.querySelector(selector);
const select=$('[data-weekly-date]');
const status=$('[data-weekly-status]');
const title=$('[data-weekly-title]');
const metadata=$('[data-weekly-meta]');
const bulletin=$('[data-weekly-bulletin]');
const slides=$('[data-weekly-slides]');
const broadcast=$('[data-weekly-broadcast]');
const liveHost=$('[data-weekly-live-host]');
const editorLink=$('[data-church-worship-admin]');
const panel=$('[data-weekly-editor]');
const form=$('[data-weekly-form]');
const flash=$('[data-weekly-flash]');
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const API=SUPABASE_URL+'/rest/v1/church_worship_materials';
const PERMISSION=SUPABASE_URL+'/functions/v1/church-pastor-api?scope=worship-access';
let entries=[],selected=null,packet=null;
function token(){
  try{
    const s=JSON.parse(sessionStorage.getItem('ekodi-church-pastor-session')||'null');
    if(s?.accessToken&&Number(s.expiresAt)>Math.floor(Date.now()/1000)+15)return s.accessToken;
  }catch{}
  return window.EKODI_MY_AUTH?.getAccessToken?.()||sessionStorage.getItem('ekodi-auth-token')||'';
}
function kstToday(){const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(part=>[part.type,part.value]));return map.year+'-'+map.month+'-'+map.day;}
function sunday(date){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(date+'T00:00:00Z').getUTCDay()===0;}
// Use the canonical Church locale selection for newly fetched weekly data.
// Never display untranslated Korean metadata in a non-Korean language surface.
function weeklyLocale(){
  const query=new URLSearchParams(location.search).get('lang');
  const raw=String(query||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||'ko-KR');
  if(raw==='ko'||raw.startsWith('ko-'))return 'ko-KR';
  if(raw==='zh'||raw.startsWith('zh-'))return 'zh-CN';
  if(raw==='ja'||raw.startsWith('ja-'))return 'ja';
  return 'en';
}
function localize(value,fallback){
  const original=String(value??'');
  const target=weeklyLocale();
  if(target==='ko-KR')return original;
  const translated=window.EKODIChurchI18n?.translate?.(original,target)||original;
  return /[가-힣]/.test(translated)?String(fallback||'See the full bulletin'):translated;
}
function metadataText(data){
  if(weeklyLocale()==='ko-KR')return [data.date+' (일) · '+(data.time||'11:00'),data.scripture||'본문 확인 중','말씀나눔 '+(data.preacher||'담당 확인 중')].join(' · ');
  return [data.date+' (Sunday) · '+(data.time||'11:00'),localize(data.scripture||'본문 확인 중','Scripture details in bulletin'),localize(data.preacher||'담당 확인 중','Speaker details in bulletin')].join(' · ');
}
function studioUrl(date,sermon=''){
  const url=new URL('/live/church/',location.origin);
  url.searchParams.set('mode','studio');
  url.searchParams.set('activity','sunday');
  url.searchParams.set('date',date);
  if(sermon)url.searchParams.set('title',(date+' 주일모임 · '+sermon).slice(0,150));
  return url.pathname+url.search;
}
function archivePath(entry){return entry.page;}
function showPacket(data){
  packet=data;
  if(liveHost)liveHost.href=studioUrl(data.date,data.title||'');
  title.textContent=localize(data.title||'주일모임 예배','Sunday worship');
  metadata.textContent=metadataText(data);
  status.textContent=localize(data.youtube?.status==='scheduled'?'방송 예약 연결 확인 필요':'방송 예약 확인 전 · 예배자료 준비','Broadcast scheduling not verified');
  panel.hidden=true;form.reset();
}
async function isPublished(date){
  try{
    const r=await fetch(API+'?select=service_date&service_type=eq.sunday&service_date=eq.'+encodeURIComponent(date)+'&is_published=eq.true&limit=1',{headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+PUBLISHABLE_KEY,accept:'application/json'},cache:'no-store'});
    if(!r.ok)return true;
    const rows=await r.json();return Array.isArray(rows)&&rows.length>0;
  }catch{return true;}
}
async function load(entry){
  selected=entry;
  if(liveHost)liveHost.href=studioUrl(entry.date);
  const href=archivePath(entry);
  bulletin.href=href;
  slides.href=href+'?view=stage';
  broadcast.href=href+'?view=operator';
  try{
    const response=await fetch(href+'materials.json',{cache:'no-store'});
    if(!response.ok)throw new Error('자료를 불러올 수 없습니다.');
    const data=await response.json();
    if(data.date!==entry.date)throw new Error('자료의 예배 날짜가 일치하지 않습니다.');
    showPacket(data);
    // Merged materials stay unannounced until a worship manager confirms the final review.
    if(!(await isPublished(entry.date))){
      title.textContent=localize('예배자료 최종 검토 중','Worship materials under final review');
      metadata.textContent=entry.date+(weeklyLocale()==='ko-KR'?' (일) · 공개 전':' (Sunday) · not yet published');
      status.textContent=localize('최종 검토 후 공개됩니다','Published after final review');
    }
  }catch(error){
    packet=null;title.textContent=entry.date+' '+(weeklyLocale()==='ko-KR'?'예배자료':'worship materials');
    metadata.textContent=localize('자료 확인 필요','Verification required');
    status.textContent=localize(error.message,'Could not load worship materials');
    panel.hidden=true;
  }
}
async function init(){
  try{
    const res=await fetch('./worship/weekly.json',{cache:'no-store'});
    if(!res.ok)throw new Error('날짜 목록을 불러오지 못했습니다.');
    const data=await res.json();
    entries=(data.services||[]).filter(v=>sunday(v.date)&&/^\/ekodichurch\/worship\/\d{4}-\d{2}-\d{2}\/$/.test(v.page)).sort((a,b)=>a.date.localeCompare(b.date));
    if(!entries.length)throw new Error('등록된 예배가 없습니다.');
    let next=entries.find(v=>v.date>=kstToday())||entries[entries.length-1];
    // Until the coming Sunday is published after final review, show the most recent published Sunday.
    if(!(await isPublished(next.date))){
      const earlier=entries.filter(v=>v.date<next.date).reverse();
      for(const item of earlier){if(await isPublished(item.date)){next=item;break;}}
    }
    for(const item of [...entries].reverse()){const o=document.createElement('option');o.value=item.date;o.textContent=item.date+' '+localize('주일모임','Sunday worship');select.append(o);}
    select.value=next.date;await load(next);
  }catch(error){status.textContent=localize(error.message,'Unable to load worship dates');}
}
select.addEventListener('change',()=>{const entry=entries.find(v=>v.date===select.value);if(entry)load(entry);});
editorLink.addEventListener('click',async event=>{
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  if(editorLink.hidden||!selected||!packet)return;
  const key=token();
  if(!key){flash.textContent='로그인 확인이 필요합니다.';return;}
  flash.textContent='예배 운영 권한을 다시 확인하고 있습니다.';
  try{
    const permitted=await fetch(PERMISSION,{headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+key,accept:'application/json'},cache:'no-store'});
    const decision=permitted.ok?await permitted.json():null;
    if(!permitted.ok||decision?.permissions?.worship!==true)throw new Error('현재 계정에는 예배관리 권한이 없습니다.');
    panel.hidden=false;
    const current=await fetch(API+'?service_type=eq.sunday&service_date=eq.'+encodeURIComponent(selected.date)+'&limit=1',{headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+key,accept:'application/json'},cache:'no-store'});
    if(!current.ok)throw new Error('예배기록 조회가 거부되었습니다.');
    const list=await current.json();
    const db=Array.isArray(list)?list[0]||{}:{};
    const data={service_date:selected.date,service_time:db.service_time||packet.time||'11:00',scripture:db.scripture||packet.scripture||'',title:db.title||packet.title||'',preacher:db.preacher||packet.preacher||'',songs:db.songs||'',prayer:db.prayer||'',notice:db.notice||''};
    for(const [k,v] of Object.entries(data)){const field=form.elements.namedItem(k);if(field)field.value=v;}
    flash.textContent='서버에서 편집 권한 확인 완료 · 저장 후 게시 상태를 확인해 주세요.';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){panel.hidden=true;flash.textContent=error.message;status.textContent=error.message;}
});
form?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selected||!packet)return;
  const date=selected.date;
  const key=token();
  if(!key){flash.textContent='로그인 후 다시 시도해 주세요.';return;}
  const publish=event.submitter?.value==='publish';
  if(publish&&!window.confirm('검토가 끝난 예배 내용을 공개하시겠습니까?'))return;
  const d=Object.fromEntries(new FormData(form));
  if(d.service_date!==date||!sunday(date)){flash.textContent='날짜가 일치하지 않아 저장하지 않았습니다.';return;}
  if(publish&&(!d.title?.trim()||!d.scripture?.trim())){flash.textContent='본문과 제목을 먼저 확인해 주세요.';return;}
  flash.textContent='본문과 권한을 검증하고 있습니다.';
  try{
    const access=await fetch(PERMISSION,{headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+key},cache:'no-store'});
    const check=access.ok?await access.json():null;
    if(!access.ok||check?.permissions?.worship!==true)throw new Error('권한이 변경되어 저장할 수 없습니다.');
    if(date.startsWith('2026-10-')){
      const r=await fetch('/api/public/scripture/common?date='+encodeURIComponent(date),{cache:'no-store'});
      if(!r.ok)throw new Error('공통본문 검증에 실패했습니다.');
      const official=await r.json();
      if(official.status!=='approved'||official.passage!==d.scripture)throw new Error('승인된 공통본문과 일치하지 않습니다.');
    }
    const payload={service_type:'sunday',service_date:date,service_name:'에코디 주일모임',service_time:d.service_time||'11:00',scripture:d.scripture||'',title:d.title||'',preacher:d.preacher||'',songs:d.songs||'',prayer:d.prayer||'',notice:d.notice||'',is_published:publish,updated_at:new Date().toISOString()};
    const saved=await fetch(API+'?on_conflict=service_type,service_date',{method:'POST',headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+key,'content-type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload),cache:'no-store'});
    if(!saved.ok){const error=await saved.json().catch(()=>({}));throw new Error(error.message||'저장에 실패했습니다: '+saved.status);}
    flash.textContent=publish?'예배 기록 게시 완료 · 정적 주보·PPT는 별도 배포 확인이 필요합니다.':'예배 기록 초안 저장 완료 · 일반 사용자에게 공개되지 않습니다.';
  }catch(error){flash.textContent=error.message;}
});
window.addEventListener('ekodi:locale-change',()=>{
  for(const option of select.options){option.textContent=option.value+' '+localize('주일모임','Sunday worship');}
  if(packet)showPacket(packet);
});
window.addEventListener('ekodi:auth-logout',()=>{panel.hidden=true;form?.reset();});
init();
})();