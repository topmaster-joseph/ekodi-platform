// EKODI Education — instructor document share manager. Talks only to the same-origin docs API (instructor
// session cookie, HttpOnly); never stores anything in the browser.
import {bindChrome,copyText,esc} from './engine/render.js';
import {acceptAdminHandoff,readToken,adminInstructorSession} from './engine/admin-instructor.js';

const $=s=>document.querySelector(s);
let toastTimer=0;
function toast(text,ms=3200){const el=$('#toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},ms);}
const MAX_BYTES=10*1024*1024;
const MAX_EDGE=2400;
const mb=n=>(n/1048576).toFixed(1)+'MB';
// Phone photos are re-encoded on the device before upload: at most 2400 px on the long edge, JPEG 0.85.
// This keeps uploads small on mobile networks and drops embedded metadata (location, camera data).
// PDFs are sent as they are, within the 10 MB limit.
async function prepareFile(file){
  if(!file||!file.size)throw new Error('파일을 선택해 주세요.');
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
    if(file.size>MAX_BYTES)throw new Error('PDF가 '+mb(file.size)+'로 10MB를 넘습니다. 사진으로 찍어 올리거나 용량을 줄여 주세요.');
    return file;
  }
  try{
    const bmp=await createImageBitmap(file,{imageOrientation:'from-image'});
    const scale=Math.min(1,MAX_EDGE/Math.max(bmp.width,bmp.height));
    const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bmp,0,0,w,h);bmp.close?.();
    const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',0.85));
    if(blob&&blob.size)return new File([blob],'document.jpg',{type:'image/jpeg'});
  }catch{}
  if(file.size>MAX_BYTES)throw new Error('파일이 '+mb(file.size)+'로 10MB를 넘습니다. 더 작은 사진으로 올려 주세요.');
  return file;
}
const api=p=>new URL('api/'+p,location.href).href;
const fmt=ms=>new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
const kb=n=>n>1048576?(n/1048576).toFixed(1)+'MB':Math.max(1,Math.round(n/1024))+'KB';
const linkOf=item=>new URL(item.path,location.href).href;

async function call(path,init){
  let r;
  try{r=await fetch(api(path),{credentials:'same-origin',...init});}
  catch{throw new Error('인터넷 연결이 끊겨 서버에 닿지 못했습니다. 와이파이·데이터 연결을 확인한 뒤 다시 눌러 주세요.');}
  let data={};try{data=await r.json();}catch{}
  if(r.status===401){$('#docsNotice').textContent='강사 비밀번호 로그인이 필요합니다. 이 페이지를 새로고침해 비밀번호를 입력하세요.';}
  if(!r.ok||data.ok===false)throw new Error(data.message||('요청 실패 ('+r.status+')'));
  return data;
}
function renderList(items){
  $('#docsList').innerHTML=items.length?'<ul class="docs-list">'+items.map(it=>'<li class="docs-item"><div><b>'+esc(it.label)+'</b>'+(it.purpose?' · '+esc(it.purpose):'')+
    '<p class="meta">'+fmt(it.expiresAt)+'까지 · '+esc(kb(it.size))+' · '+(it.type==='application/pdf'?'PDF':'이미지')+'</p>'+
    '<code class="docs-link">'+esc(linkOf(it))+'</code></div><div class="btn-row">'+
    '<button type="button" class="btn btn-small btn-primary" data-copy="'+esc(linkOf(it))+'">링크 복사</button>'+
    '<a class="btn btn-small" href="'+esc(linkOf(it))+'" target="_blank" rel="noopener noreferrer">열어 보기</a>'+
    '<button type="button" class="btn btn-small" data-revoke="'+esc(it.token)+'">지금 삭제</button></div></li>').join('')+'</ul>'
    :'<p class="meta">공유 중인 링크가 없습니다.</p>';
}
async function refresh(){try{renderList((await call('list')).items||[]);}catch(e){$('#docsList').innerHTML='<p class="meta">'+esc(e.message)+'</p>';}}

document.addEventListener('submit',async e=>{
  const form=e.target.closest('form[data-kind]');if(!form)return;
  e.preventDefault();
  const fd=new FormData(form);fd.set('kind',form.dataset.kind);
  const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='준비 중…';
  try{
    const file=await prepareFile(form.querySelector('input[type="file"]').files[0]);
    fd.set('file',file,file.name||'document');
    btn.textContent='올리는 중… ('+mb(file.size)+')';
    const {item}=await call('upload',{method:'POST',body:fd});
    form.reset();
    const r=await copyText(window,linkOf(item));
    toast(item.label+' 링크를 만들었습니다'+(r==='copied'?' · 링크가 복사되었습니다.':'.'));
    await refresh();
  }catch(err){toast(err.message,7000);}
  finally{btn.disabled=false;btn.textContent='링크 만들기';}
});
document.addEventListener('click',async e=>{
  const c=e.target.closest('[data-copy]');
  if(c){const r=await copyText(window,c.dataset.copy);toast(r==='copied'?'링크를 복사했습니다.':'링크를 선택했습니다. Ctrl+C로 복사하세요.');return;}
  const d=e.target.closest('[data-revoke]');
  if(d){if(!confirm('이 링크와 파일을 지금 삭제할까요? 받은 사람도 더 이상 볼 수 없습니다.'))return;
    try{await call('delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:d.dataset.revoke})});toast('삭제했습니다.');await refresh();}catch(err){toast(err.message);}}
});
const c=new URLSearchParams(location.search).get('c');
if(c)$('#docsBack').href='../?c='+encodeURIComponent(c);
bindChrome(document,{top:$('#docsTop')});
acceptAdminHandoff(window);
(async()=>{
  // EKODI super admin: open the instructor session from the admin sign-in when the password session is absent.
  if(readToken(window)){const probe=await fetch(api('list'),{credentials:'same-origin'}).catch(()=>null);if(probe?.status===401)await adminInstructorSession(window);}
  await refresh();
})().finally(()=>{document.body.dataset.ready='true';});
