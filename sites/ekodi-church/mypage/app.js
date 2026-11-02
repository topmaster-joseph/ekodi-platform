const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const $=(id)=>document.getElementById(id);
let service='sunday';
let activeSession=null;
let accessReady=false;
const names={sunday:'주일모임',saturday:'토요모임'};
const defaultTimes={sunday:'일요일 오전 11시',saturday:'토요일 오전 11시'};

function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function todayFor(type){
  const d=new Date();const target=type==='sunday'?0:6;let diff=(target-d.getDay()+7)%7;
  if(diff===0&&d.getHours()>=12)diff=7;d.setDate(d.getDate()+diff);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
}
function payload(){return{service,serviceName:names[service],time:defaultTimes[service],date:$('serviceDate').value,scripture:$('scripture').value.trim(),title:$('title').value.trim(),preacher:$('preacher').value.trim(),songs:$('songs').value.trim(),prayer:$('prayer').value.trim(),notice:$('notice').value.trim(),meal:$('meal').value.trim(),updatedAt:new Date().toISOString()}}
function render(){const p=payload();$('serviceLabel').textContent=p.serviceName;$('summary').innerHTML=`<dl><dt>일시</dt><dd>${esc(p.date)} · ${esc(p.time)}</dd><dt>본문</dt><dd>${esc(p.scripture||'미입력')}</dd><dt>제목</dt><dd>${esc(p.title||'미입력')}</dd><dt>설교</dt><dd>${esc(p.preacher||'미입력')}</dd><dt>찬양</dt><dd>${esc(p.songs||'미입력')}</dd><dt>대표기도</dt><dd>${esc(p.prayer||'미입력')}</dd><dt>공지</dt><dd>${esc(p.notice||'없음')}</dd><dt>식사준비</dt><dd>${esc(p.meal||'미정')}</dd></dl>`}
function setStatus(id,text='준비됨'){$(id).textContent=text;$(id).classList.add('ready')}
function saveLocal(){localStorage.setItem(`ekodi:church:worship:${service}`,JSON.stringify(payload()));render()}
function fill(p){$('serviceDate').value=p.date||p.service_date||todayFor(service);snapDate();$('scripture').value=p.scripture||'';$('title').value=p.title||'';$('preacher').value=p.preacher||'정찬균 목사';$('songs').value=p.songs||'';$('prayer').value=p.prayer||'';$('notice').value=p.notice||'';$('meal').value=p.meal||'';render()}
function loadLocal(){const raw=localStorage.getItem(`ekodi:church:worship:${service}`);if(raw){try{fill(JSON.parse(raw));return}catch{}}fill({date:todayFor(service),preacher:'정찬균 목사'})}
function record(p,published=false){return{service_type:p.service,service_date:p.date,service_name:p.serviceName,service_time:p.time,scripture:p.scripture,title:p.title,preacher:p.preacher,songs:p.songs,prayer:p.prayer,notice:p.notice,meal:p.meal,is_published:published,created_by:activeSession?.user?.id||null,updated_at:new Date().toISOString()}}
function loginUrl(){const target='https://ekodi.kr/ekodichurch/mypage/';return `https://ekodi.kr/auth/?site=church&return_to=${encodeURIComponent(target)}`}
// The site's Content-Security-Policy allows only same-origin scripts, so the
// console talks to Supabase Auth/REST with fetch instead of a CDN client.
const SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
const sb={ready:false};
function readSession(){
  // Only the church project's session is valid here; another EKODI project's
  // token would be rejected by this database, so fall back to the handoff.
  try{
    const parsed=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    const s=parsed?.currentSession||parsed?.session||parsed;
    if(s?.access_token)return s;
  }catch{}
  return null;
}
function storeSession(s){
  const expires_at=s.expires_at||Math.floor(Date.now()/1000)+Number(s.expires_in||3600);
  const session={...s,expires_at};
  try{localStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch{}
  return session;
}
async function authCall(path,body){
  const r=await fetch(SUPABASE_URL+'/auth/v1/'+path,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.access_token)throw new Error(data.msg||data.error_description||('auth_'+r.status));
  return storeSession(data);
}
async function currentSession(){
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const handoff=hash.get('ekodi_token');
  if(handoff){
    const s=await authCall('verify',{type:hash.get('ekodi_type')||'email',token_hash:handoff});
    history.replaceState(null,'',location.pathname+location.search);
    return s;
  }
  let s=readSession();
  if(s&&Number(s.expires_at||0)<Math.floor(Date.now()/1000)+30){
    s=s.refresh_token?await authCall('token?grant_type=refresh_token',{refresh_token:s.refresh_token}).catch(()=>null):null;
  }
  return s;
}
async function rest(path,{method='GET',body,prefer}={}){
  const headers={apikey:PUBLISHABLE_KEY,authorization:'Bearer '+activeSession.access_token,accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(prefer)headers.Prefer=prefer;
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const text=await r.text();const data=text?JSON.parse(text):null;
  if(!r.ok)throw new Error(data?.message||('요청 실패 '+r.status));
  return data;
}
const TABLE='church_worship_materials';
async function ensureAuth(){
  try{
    activeSession=await currentSession();
    if(!activeSession){location.replace(loginUrl());return false}
    sessionStorage.setItem('ekodi-auth-token',activeSession.access_token);
    let access;
    try{access=await rest('rpc/current_site_access',{method:'POST',body:{p_site_key:'church'}})}
    catch(error){
      if(!sessionStorage.getItem('ekodi-church-mypage-relogin')){sessionStorage.setItem('ekodi-church-mypage-relogin','1');try{localStorage.removeItem(SESSION_KEY)}catch{}location.replace(loginUrl());return false}
      throw error;
    }
    sessionStorage.removeItem('ekodi-church-mypage-relogin');
    const status=String(access?.status||'');const role=String(access?.role||'');
    if(status!=='active'||role!=='tenant_admin'){
      document.body.innerHTML='<main style="max-width:720px;margin:80px auto;padding:24px;font-family:sans-serif"><h1>예배 운영 권한이 필요합니다.</h1><p>에코디교회 운영관리자 권한이 확인된 계정만 이 화면을 사용할 수 있습니다.</p><p><a href="https://ekodi.kr/my/">My EKODI로 돌아가기</a></p></main>';
      return false;
    }
    sb.ready=true;accessReady=true;
    const status2=document.querySelector('.status-card small');if(status2)status2.textContent=(activeSession.user?.email||'운영자')+' 계정으로 연결되었습니다.';
    await loadRemote();
    await loadReviews();
    await loadBulletinEditor();
    return true;
  }catch(error){
    console.error('[EKODI Church worship auth]',error);
    const status=document.querySelector('.status-card small');if(status)status.innerHTML='중앙 로그인 확인에 실패했습니다. <a href="'+loginUrl()+'">다시 로그인</a>';
    return false;
  }
}
async function loadRemote(){
  if(!accessReady||!sb.ready)return;
  const date=$('serviceDate').value||todayFor(service);
  let data=null;
  try{const rows=await rest(TABLE+'?select=*&service_type=eq.'+service+'&service_date=eq.'+date+'&limit=1');data=rows?.[0]||null}catch(error){console.warn('[worship load]',error.message);return}
  if(data){fill(data);localStorage.setItem(`ekodi:church:worship:${service}`,JSON.stringify({...data,service,serviceName:data.service_name,time:data.service_time,date:data.service_date}))}
}
async function loadReviews(){
  const card=$('reviewCard'),list=$('reviewList');
  if(!card||!accessReady||!sb.ready)return;
  card.hidden=false;
  try{
    const weekly=await fetch('../worship/weekly.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('목록 '+r.status);return r.json()});
    const items=(weekly.services||[]).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v.date)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2);
    const data=items.length?await rest(TABLE+'?select=service_date,title,is_published&service_type=eq.sunday&service_date=in.('+items.map(v=>v.date).join(',')+')'):[];
    const rows=Object.fromEntries((data||[]).map(r=>[r.service_date,r]));
    // Google Drive originals (managers only; the table is closed to the public).
    let src={};try{const s=items.length?await rest('church_worship_sources?select=service_date,bulletin_url,sermon_url,slides_url&service_type=eq.sunday&service_date=in.('+items.map(v=>v.date).join(',')+')'):[];src=Object.fromEntries((s||[]).map(r=>[r.service_date,r]))}catch{}
    const google=u=>/^https:\/\/(docs|drive)\.google\.com\//.test(u||'')?u:'';
    const originals=d=>{const o=src[d]||{};const links=[['bulletin_url','원본 주보'],['sermon_url','설교원고'],['slides_url','예배 PPT']].map(([k,t])=>google(o[k])?`<a class="source" href="${esc(o[k])}" target="_blank" rel="noopener">${t} ↗</a>`:'').join('');return `<div class="review-sources"><span>구글 원본</span>${links||'<span>아직 연결 안 됨</span>'}<button type="button" class="source-edit" data-sources="${esc(d)}">${links?'링크 바꾸기':'링크 넣기'}</button></div>`};
    list.innerHTML=items.map(v=>{const r=rows[v.date]||{};const pub=r.is_published===true;return `<div class="review-row" data-date="${esc(v.date)}"><div><strong>${esc(v.date)} 주일모임</strong> <span class="review-badge ${pub?'public':''}">${pub?'공개됨':'검토 중 · 비공개'}</span><small>${esc(r.title||'제목 확인 중')}</small>${originals(v.date)}</div><div class="review-actions"><a href="${esc(v.page)}">검토 화면</a><a href="${esc(v.page)}?view=stage">PPT 16:9</a><a href="${esc(v.page)}sermon/">말씀나눔</a>${pub?'<button type="button" data-review="hide">비공개로 되돌리기</button>':'<button type="button" class="primary" data-review="publish">최종 검토 완료 · 공개</button>'}</div></div>`}).join('')||'<p>등록된 예배자료가 없습니다.</p>';
  }catch(error){list.innerHTML=`<p>목록을 불러오지 못했습니다: ${esc(error.message)}</p>`}
}
document.addEventListener('click',async event=>{
  const edit=event.target.closest('[data-sources]');if(!edit||!sb.ready)return;
  const date=edit.dataset.sources;const ok=v=>!v||/^https:\/\/(docs|drive)\.google\.com\//.test(v);
  const ask=t=>{const v=prompt(`${date} ${t} 구글 링크를 붙여 넣으세요 (없으면 비워 두기)`,'');return v===null?null:v.trim()};
  const bulletin=ask('원본 주보');if(bulletin===null)return;const sermon=ask('설교원고');if(sermon===null)return;const slides=ask('예배 PPT');if(slides===null)return;
  if(![bulletin,sermon,slides].every(ok)){alert('docs.google.com 또는 drive.google.com 링크만 넣을 수 있습니다.');return}
  const row={service_type:'sunday',service_date:date,updated_at:new Date().toISOString()};
  if(bulletin)row.bulletin_url=bulletin;if(sermon)row.sermon_url=sermon;if(slides)row.slides_url=slides;
  try{await rest('church_worship_sources?on_conflict=service_type,service_date',{method:'POST',body:row,prefer:'resolution=merge-duplicates,return=minimal'});await loadReviews()}catch(e){alert('저장 실패: '+e.message)}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-review]');if(!button)return;
  const date=button.closest('[data-date]')?.dataset.date;if(!date||!sb.ready)return;
  const publish=button.dataset.review==='publish';
  if(!confirm(publish?`${date} 예배자료를 최종 검토했고 일반에 공개합니다.`:`${date} 예배자료를 다시 비공개로 돌립니다.`))return;
  button.disabled=true;
  let data=null,error=null;
  try{data=await rest(TABLE+'?service_type=eq.sunday&service_date=eq.'+date,{method:'PATCH',body:{is_published:publish,updated_at:new Date().toISOString()},prefer:'return=representation'})}catch(e){error=e}
  if(error||!data?.length){alert(`처리 실패: ${error?.message||'예배 기록이 없습니다. 위 입력란에서 먼저 저장해 주세요.'}`);button.disabled=false;return}
  await loadReviews();
});
// ---- Bulletin editor (photo + content), Sunday only ----
const BE=['Week','Announce','Serve','Stats','Committee','Sponsors','Questions'];
const lines=v=>String(v||'').split('\n').map(x=>x.trim()).filter(Boolean);
const cells=v=>lines(v).map(l=>l.split('|').map(c=>c.trim()));
const toText=rows=>(rows||[]).map(r=>Array.isArray(r)?r.join(' | '):String(r)).join('\n');
function fromPage(doc){
  const b={};const q=n=>doc.querySelector(`[data-b="${n}"]`);
  const trs=el=>el?[...el.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>c.textContent.trim())):[];
  const wk=trs(q('week'));if(wk.length===2)b.week=wk[0].map((h,i)=>[h,wk[1][i]||'']);
  b.announce=[...(q('announce')?.querySelectorAll('li')||[])].map(li=>li.textContent.trim());
  const sv=trs(q('serve')).slice(1);b.serve=sv.flatMap(r=>[[r[0],r[1]],[r[2],r[3]]]).filter(r=>r[0]||r[1]);
  const st=trs(q('stats')).slice(1);b.stats=st.flatMap(r=>[r.slice(0,4),r.slice(4,8)]).filter(r=>r.some(Boolean));
  b.committee=trs(q('committee'));
  b.sponsors=[...(q('sponsors')?.querySelectorAll('li')||[])].map(li=>li.textContent.trim());
  b.questions=[...(q('questions')?.querySelectorAll('li')||[])].map(li=>li.textContent.trim());
  return b;
}
async function loadBulletinEditor(){
  const box=$('bulletinEditor');if(!box)return;
  const isSunday=service==='sunday';
  $('bulletinCardTitle').textContent=isSunday?'주보':'순서지';$('bulletinStatusLabel').textContent=isSunday?'주보':'순서지';
  box.hidden=!(accessReady&&sb.ready&&isSunday);const locked=$('bulletinLocked');if(locked)locked.hidden=!box.hidden;if(box.hidden)return;
  const date=$('serviceDate').value;$('bulletinEditDate').textContent=date+' 주일모임';
  $('beOpen').href=`/ekodichurch/worship/${date}/`;$('beStatus').textContent='불러오는 중…';
  let b=null;
  try{const r=await rest(TABLE+'?select=bulletin,photo_url&service_type=eq.sunday&service_date=eq.'+date+'&limit=1');b=r?.[0]?.bulletin||null;box.dataset.photo=r?.[0]?.photo_url||''}catch{}
  if(!b){
    try{const html=await fetch(`/ekodichurch/worship/${date}/`,{cache:'no-store'}).then(r=>r.ok?r.text():'');if(html.includes('data-bulletin-date'))b=fromPage(new DOMParser().parseFromString(html,'text/html'))}catch{}
  }
  b=b||{};
  $('beWeek').value=toText(b.week);$('beAnnounce').value=(b.announce||[]).join('\n');$('beServe').value=toText(b.serve);$('beStats').value=toText(b.stats);
  $('beCommittee').value=toText(b.committee);$('beSponsors').value=(b.sponsors||[]).join('\n');$('beQuestions').value=(b.questions||[]).join('\n');
  $('bePhotoCaption').value=b.photoCaption||'';$('bePhotoText').value=b.photoText||'';$('beDriveLink').value='';
  const mode=b.photoMode||(box.dataset.photo?'photo':'photo');document.querySelectorAll('input[name=bePhotoMode]').forEach(r=>r.checked=r.value===mode);
  const pv=$('bePhotoPreview');if(box.dataset.photo){pv.querySelector('img').src=box.dataset.photo;pv.hidden=false}else pv.hidden=true;
  $('beStatus').textContent=b.week?'불러왔습니다. 고친 뒤 [주보 저장]을 누르세요.':'이 날짜의 예배 페이지가 아직 없습니다. 내용을 입력해 저장할 수 있습니다.';
}
// Simple photo editor: rotate, shape, zoom, position and brightness on a canvas.
// The saved photo is always re-encoded as a right-sized JPEG, so a large phone
// photo never hits the storage size limit.
const edit={img:null,rot:0};
function editState(){return{ratio:Number($('beRatio').value),zoom:Number($('beZoom').value),x:Number($('beX').value)/100,y:Number($('beY').value)/100,bright:Number($('beBright').value)}}
function drawEdit(canvas,maxSide){
  const img=edit.img;if(!img)return false;
  const st=editState();const turned=edit.rot%180!==0;
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  const sw=turned?ih:iw,sh=turned?iw:ih;
  const ratio=st.ratio||sw/sh;
  let cw=sw,ch=sw/ratio;if(ch>sh){ch=sh;cw=sh*ratio}
  cw/=st.zoom;ch/=st.zoom;
  const cx=(sw-cw)*st.x,cy=(sh-ch)*st.y;
  const scale=Math.min(1,maxSide/Math.max(cw,ch));
  canvas.width=Math.round(cw*scale);canvas.height=Math.round(ch*scale);
  const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);
  g.filter=`brightness(${st.bright}%)`;
  g.save();g.scale(scale,scale);g.translate(-cx,-cy);
  g.translate(sw/2,sh/2);g.rotate(edit.rot*Math.PI/180);
  g.drawImage(img,-iw/2,-ih/2);g.restore();
  return true;
}
function previewEdit(){if(drawEdit($('beCanvas'),900))$('beEditInfo').textContent='보이는 모습 그대로 저장됩니다. 크기는 주보에 맞게 자동으로 줄어듭니다.'}
function resetEdit(){edit.rot=0;$('beRatio').value='1.3333';$('beZoom').value='1';$('beX').value='50';$('beY').value='50';$('beBright').value='100';previewEdit()}
async function openEditor(file){
  const box=$('bePhotoEdit');edit.img=null;box.hidden=true;if(!file)return;
  // createImageBitmap decodes the file directly; a blob: image URL is blocked by the site CSP (img-src).
  let img;
  try{img=await createImageBitmap(file,{imageOrientation:'from-image'})}
  catch{try{img=await createImageBitmap(file)}catch{$('beStatus').textContent='이 사진은 열 수 없습니다. 휴대폰 사진(HEIC)이면 JPG로 바꾸거나 구글 드라이브 링크를 써 주세요.';return}}
  edit.img=img;box.hidden=false;resetEdit();$('beStatus').textContent='사진을 불러왔습니다. 모양을 맞춘 뒤 [주보 저장]을 누르세요.';
  const mode=document.querySelector('input[name=bePhotoMode][value=photo]');if(mode)mode.checked=true;
}
async function editedBlob(){
  const c=document.createElement('canvas');
  for(const [side,q] of [[1800,.86],[1600,.8],[1400,.75],[1200,.7],[1000,.65]]){
    drawEdit(c,side);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',q));
    if(blob&&blob.size<=4.5*1024*1024)return blob;
  }
  throw new Error('사진을 줄이지 못했습니다. 다른 사진을 골라 주세요.');
}
async function uploadPhoto(date){
  const blob=await editedBlob();
  const path=`sunday/${date}/photo-${Date.now()}.jpg`;
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/church-bulletin/${path}`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+activeSession.access_token,'content-type':'image/jpeg','x-upsert':'true'},body:blob});
  if(!r.ok)throw new Error('사진 올리기 실패 '+r.status);
  return `${SUPABASE_URL}/storage/v1/object/public/church-bulletin/${path}`;
}
function driveThumb(link){
  const v=String(link||'').trim();if(!v)return '';
  const m=v.match(/\/d\/([\w-]{20,})/)||v.match(/[?&]id=([\w-]{20,})/);
  return m?`https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`:'';
}
async function saveBulletin(){
  const date=$('serviceDate').value;const btn=$('beSave');btn.disabled=true;$('beStatus').textContent='저장 중…';
  try{
    const bulletin={week:cells($('beWeek').value),announce:lines($('beAnnounce').value),serve:cells($('beServe').value),stats:cells($('beStats').value),committee:cells($('beCommittee').value),sponsors:lines($('beSponsors').value),questions:lines($('beQuestions').value),photoCaption:$('bePhotoCaption').value.trim()};
    const patch={bulletin,updated_at:new Date().toISOString()};
    bulletin.photoMode=document.querySelector('input[name=bePhotoMode]:checked')?.value||'photo';
    bulletin.photoText=$('bePhotoText').value.trim();
    const file=edit.img?$('bePhoto').files?.[0]:null;
    const drive=driveThumb($('beDriveLink').value);
    if($('beDriveLink').value.trim()&&!drive)throw new Error('구글 드라이브 파일 링크를 확인해 주세요.');
    if(file)patch.photo_url=await uploadPhoto(date);else if(drive)patch.photo_url=drive;
    if(bulletin.photoMode==='photo'&&!patch.photo_url&&!$('bulletinEditor').dataset.photo)bulletin.photoMode='blank';
    let saved=await rest(TABLE+'?service_type=eq.sunday&service_date=eq.'+date,{method:'PATCH',body:patch,prefer:'return=representation'});
    if(!saved?.length){const p=payload();await rest(TABLE+'?on_conflict=service_type,service_date',{method:'POST',body:{...record(p,false),...patch},prefer:'resolution=merge-duplicates,return=minimal'})}
    $('bePhoto').value='';edit.img=null;$('bePhotoEdit').hidden=true;$('beDriveLink').value='';if(patch.photo_url){$('bulletinEditor').dataset.photo=patch.photo_url;const pv=$('bePhotoPreview');pv.querySelector('img').src=patch.photo_url;pv.hidden=false}$('beStatus').textContent='저장했습니다. [주보 화면 열기]로 확인하세요.';
  }catch(error){$('beStatus').textContent='저장 실패: '+error.message}
  finally{btn.disabled=false}
}
async function persist(published=false){
  saveLocal();
  if(!accessReady||!sb.ready)throw new Error('login_required');
  const p=payload();
  if(!p.date)throw new Error('날짜를 입력해 주세요.');
  await rest(TABLE+'?on_conflict=service_type,service_date',{method:'POST',body:record(p,published),prefer:'resolution=merge-duplicates,return=minimal'});
  return p;
}
async function saveDraft(){try{await persist(false);setStatus('webStatus','초안 저장됨')}catch(error){alert(`저장 실패: ${error.message}`)}}
function bulletinHtml(p){return`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(p.serviceName)} ${p.service==='saturday'?'순서지':'주보'}</title><style>body{font-family:serif;max-width:760px;margin:40px auto;padding:24px;color:#222}h1{text-align:center;margin-bottom:6px}.meta{text-align:center;color:#555;margin-bottom:30px}.row{padding:12px 0;border-bottom:1px solid #ddd}.row b{display:inline-block;width:110px}.notice{white-space:pre-wrap}@media print{button{display:none}}</style><h1>에코디교회 ${esc(p.serviceName)} ${p.service==='saturday'?'순서지':'주보'}</h1><div class="meta">${esc(p.date)} · ${esc(p.time)}</div><div class="row"><b>본문</b>${esc(p.scripture)}</div><div class="row"><b>말씀</b>${esc(p.title)}</div><div class="row"><b>설교</b>${esc(p.preacher)}</div><div class="row"><b>찬양</b><span style="white-space:pre-wrap">${esc(p.songs)}</span></div><div class="row"><b>대표기도</b>${esc(p.prayer)}</div><div class="row"><b>식사준비</b>${esc(p.meal)}</div><div class="row"><b>공지</b><span class="notice">${esc(p.notice)}</span></div><p style="margin-top:36px;text-align:center">말씀대로 살아내고 살려내는 공동체 · EKODI CHURCH</p><button onclick="print()">인쇄 / PDF 저장</button></html>`}
function openBulletin(){saveLocal();const w=window.open('','_blank');w.document.write(bulletinHtml(payload()));w.document.close();setStatus('bulletinStatus')}
function pptHtml(p){const slides=[['에코디교회 '+p.serviceName,`${p.date} · ${p.time}`],[p.scripture||'오늘의 말씀',p.title||'말씀으로 삶을 읽습니다'],['찬양',p.songs||'찬양 순서'],['말씀',`${p.title||''}\n${p.scripture||''}\n${p.preacher||''}`],['공동체 소식',p.notice||'함께 나눌 소식'],['보냄','들은 말씀을 오늘의 삶으로 살아냅니다.']];return`<html><head><meta charset="utf-8"><style>@page{size:13.333in 7.5in;margin:0}body{margin:0;font-family:Arial,sans-serif}.slide{page-break-after:always;width:13.333in;height:7.5in;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:1in;box-sizing:border-box}.slide h1{font-size:34pt}.slide p{font-size:22pt;white-space:pre-wrap;line-height:1.5}</style></head><body>${slides.map(s=>`<section class="slide"><h1>${esc(s[0])}</h1><p>${esc(s[1])}</p></section>`).join('')}</body></html>`}
function downloadPpt(){saveLocal();const p=payload();const blob=new Blob([pptHtml(p)],{type:'application/vnd.ms-powerpoint'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${p.date||'service'}-${p.serviceName}-EKODI.ppt`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setStatus('pptStatus')}
async function publishWebsite(){try{await persist(true);setStatus('webStatus','홈페이지 게시됨');return true}catch(error){alert(`게시 실패: ${error.message}`);return false}}
function openLive(){saveLocal();const p=payload();const q=new URLSearchParams({mode:'studio',service:p.serviceName,date:p.date,title:p.title,scripture:p.scripture,preacher:p.preacher,notice:p.notice});setStatus('liveStatus','스튜디오 연결');window.open(`../live/?${q.toString()}`,'_blank')}

document.querySelectorAll('.service-tab').forEach(btn=>btn.addEventListener('click',async()=>{document.querySelectorAll('.service-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');service=btn.dataset.service;loadLocal();await loadRemote();await loadBulletinEditor()}));
['serviceDate','scripture','title','preacher','songs','prayer','notice','meal'].forEach(id=>$(id).addEventListener('input',render));
function snapDate(){
  const el=$('serviceDate');if(!el.value)return;
  const target=service==='sunday'?0:6;const d=new Date(el.value+'T00:00:00');
  const diff=(target-d.getDay()+7)%7;if(!diff)return;
  d.setDate(d.getDate()+diff);el.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
$('serviceDate').addEventListener('change',()=>{snapDate();render();void loadRemote().then(loadBulletinEditor)});
$('beSave')?.addEventListener('click',()=>void saveBulletin());
// Compact console: each editor opens below its button, one at a time.
document.querySelectorAll('.panel-tabs [data-panel]').forEach(btn=>btn.addEventListener('click',()=>{
  const open=btn.getAttribute('aria-expanded')!=='true';
  document.querySelectorAll('.panel-tabs [data-panel]').forEach(b=>{b.setAttribute('aria-expanded','false');$(b.dataset.panel).hidden=true});
  if(open){btn.setAttribute('aria-expanded','true');$(btn.dataset.panel).hidden=false}
}));
$('bePhoto')?.addEventListener('change',e=>void openEditor(e.target.files?.[0]));
document.querySelectorAll('#bePhotoEdit [data-rot]').forEach(b=>b.addEventListener('click',()=>{edit.rot=(edit.rot+Number(b.dataset.rot)+360)%360;previewEdit()}));
['beRatio','beZoom','beX','beY','beBright'].forEach(id=>$(id)?.addEventListener('input',previewEdit));
$('beReset')?.addEventListener('click',resetEdit);
$('saveDraft').addEventListener('click',()=>void saveDraft());
$('openBulletin').addEventListener('click',openBulletin);
$('downloadPpt').addEventListener('click',downloadPpt);
$('prepareWeb').addEventListener('click',()=>void publishWebsite());
$('openLive').addEventListener('click',openLive);
$('prepareAll').addEventListener('click',async()=>{saveLocal();setStatus('bulletinStatus','생성 가능');setStatus('pptStatus','생성 가능');const published=await publishWebsite();if(published)setStatus('liveStatus','설정값 준비됨')});
loadLocal();
void ensureAuth();
