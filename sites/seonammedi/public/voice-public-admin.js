(()=>{
'use strict';
const ROOT_ID='publicVoiceList';
const ADMIN_MARK='data-seonammedi-voice-admin';
const SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
const categoryLabels={question:'질문',proposal:'정책제안',experience:'의료경험',factcheck:'사실확인 요청',tip:'자료제보',other:'기타'};
const statusLabels={received:'접수됨',reviewing:'검토중',answered:'답변완료',published:'공개',archived:'보관'};
let controller=null;
let authorized=false;
let rows=new Map();
let observer=null;
let decorating=false;

function token(){
  try{const platform=sessionStorage.getItem('ekodi-auth-token')||'';if(platform)return platform}catch{}
  try{
    const raw=localStorage.getItem(SESSION_KEY)||'';if(!raw)return'';
    const parsed=JSON.parse(raw),session=parsed?.currentSession||parsed?.session||parsed;
    const access=String(session?.access_token||''),expires=Number(session?.expires_at||0);
    return access&&(!expires||expires>Math.floor(Date.now()/1000)+30)?access:'';
  }catch{return''}
}
async function adminRequest(path,options={}){
  const bearer=token();if(!bearer)throw new Error('authentication_required');
  const headers=new Headers(options.headers||{});
  headers.set('authorization','Bearer '+bearer);
  if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(path,{...options,headers,cache:'no-store',credentials:'same-origin'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false)throw Object.assign(new Error(data.message||data.error||'request_failed'),{status:response.status,data});
  return data;
}
function field(tag,name,value=''){
  const el=document.createElement(tag);
  el.name=name;
  if(tag==='textarea')el.rows=4;
  el.value=value??'';
  return el;
}
function label(textValue,control){
  const wrap=document.createElement('label');
  const title=document.createElement('span');title.textContent=textValue;
  wrap.append(title,control);return wrap;
}
function selectField(name,options,current,disabledValue=''){
  const select=document.createElement('select');select.name=name;
  for(const [value,labelText] of Object.entries(options)){
    const option=document.createElement('option');option.value=value;option.textContent=labelText;option.selected=value===current;
    if(disabledValue&&value===disabledValue)option.disabled=true;
    select.append(option);
  }
  return select;
}
async function reloadPublic(){
  document.getElementById('reloadVoices')?.click();
  await new Promise(resolve=>setTimeout(resolve,80));
}
async function refreshAdminRows(){
  if(!authorized)return;
  const data=await adminRequest('/board/api/admin/posts');
  rows=new Map((data.items||[]).map(item=>[Number(item.id),item]));
}
function statusNode(message,error=false){
  const node=document.createElement('span');node.className='voice-inline-admin-status'+(error?' error':'');node.setAttribute('role','status');node.textContent=message;return node;
}
function enhanceReply(replyNode,voiceId,reply){
  if(!reply?.id||replyNode.querySelector('[data-voice-admin-reply-delete]'))return;
  const button=document.createElement('button');button.type='button';button.className='voice-inline-admin-delete';button.dataset.voiceAdminReplyDelete=String(reply.id);button.textContent='답글 삭제';
  button.addEventListener('click',async()=>{
    if(!confirm('이 답글을 삭제할까요?'))return;
    button.disabled=true;
    try{
      await adminRequest('/board/api/admin/posts/'+voiceId+'/replies/'+reply.id,{method:'DELETE'});
      await refreshAdminRows();await reloadPublic();
    }catch(error){alert(error.message||'답글을 삭제하지 못했습니다.')}
    finally{button.disabled=false}
  });
  replyNode.append(button);
}
function createManager(item){
  const details=document.createElement('details');details.className='voice-inline-admin';details.setAttribute(ADMIN_MARK,'1');
  const summary=document.createElement('summary');summary.textContent='관리';
  const form=document.createElement('form');form.className='voice-inline-admin-form';
  const category=selectField('category',categoryLabels,item.category||'other');
  const displayName=field('input','displayName',item.displayName||'');
  displayName.maxLength=80;
  const contact=field('input','contact',item.contact||'');
  contact.maxLength=160;
  const status=selectField('status',statusLabels,item.status||'received',item.publicConsent?'':'published');
  const message=field('textarea','message',item.message||'');message.maxLength=3000;message.required=true;
  const grid=document.createElement('div');grid.className='voice-inline-admin-grid';
  grid.append(label('유형',category),label('표시명',displayName),label('연락처',contact),label('상태',status));
  const consent=document.createElement('p');consent.className='muted';consent.textContent=item.publicConsent?'공개 동의 있음':'공개 동의 없음 · 공개 상태 전환 불가';
  const actions=document.createElement('div');actions.className='voice-inline-admin-actions';
  const save=document.createElement('button');save.type='submit';save.textContent='수정 저장';
  const remove=document.createElement('button');remove.type='button';remove.className='voice-inline-admin-delete';remove.textContent='의견 삭제';
  const state=statusNode('');
  actions.append(save,remove,state);
  form.append(grid,label('내용',message),consent,actions);
  form.addEventListener('submit',async event=>{
    event.preventDefault();save.disabled=true;state.textContent='저장 중…';state.classList.remove('error');
    try{
      const body={category:category.value,displayName:displayName.value,contact:contact.value,status:status.value,message:message.value};
      await adminRequest('/board/api/admin/posts/'+item.id,{method:'PUT',body:JSON.stringify(body)});
      state.textContent='저장했습니다.';await refreshAdminRows();await reloadPublic();
    }catch(error){state.textContent=error.data?.message||error.message||'저장하지 못했습니다.';state.classList.add('error')}
    finally{save.disabled=false}
  });
  remove.addEventListener('click',async()=>{
    if(!confirm('이 시민의견과 답글을 삭제할까요?'))return;
    remove.disabled=true;state.textContent='삭제 중…';
    try{
      await adminRequest('/board/api/admin/posts/'+item.id,{method:'DELETE'});
      await refreshAdminRows();await reloadPublic();
    }catch(error){state.textContent=error.message||'삭제하지 못했습니다.';state.classList.add('error');remove.disabled=false}
  });
  details.append(summary,form);return details;
}
function decorate(){
  if(!authorized||decorating)return;
  const root=document.getElementById(ROOT_ID);if(!root)return;
  decorating=true;
  try{
    for(const card of root.querySelectorAll('[data-voice-id]')){
      const id=Number(card.dataset.voiceId||0),item=rows.get(id);if(!item)continue;
      card.querySelectorAll('.public-voice-reply').forEach((node,index)=>enhanceReply(node,id,(item.replies||[])[index]));
      if(!card.querySelector('['+ADMIN_MARK+']'))card.append(createManager(item));
    }
  }finally{decorating=false}
}
async function authorize(){
  const shared=window.EKODIPublicSurfaceAdmin;if(!shared?.create||!token())return false;
  controller=shared.create({serviceId:'seonammedi-voices-inline',adminPath:'/seonammedi/admin/',authEndpoint:'/api/seonammedi/admin/me',tokenProvider:token});
  const me=await controller.authorize().catch(()=>null);
  authorized=Boolean(me?.ok&&me?.permissions?.voices===true);
  if(!authorized)return false;
  await refreshAdminRows();decorate();return true;
}
async function start(){
  const root=document.getElementById(ROOT_ID);if(!root)return;
  if(!await authorize())return;
  observer=new MutationObserver(()=>requestAnimationFrame(decorate));
  observer.observe(root,{childList:true,subtree:true});
  decorate();
  window.addEventListener('ekodi:public-admin-ready',()=>{refreshAdminRows().then(decorate).catch(()=>{})});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();