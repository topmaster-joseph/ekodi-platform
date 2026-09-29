import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

(()=>{
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const PLATFORM_TOKEN_KEY='ekodi-auth-token';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
const state={me:null,notices:[],channels:[]};
const $=id=>document.getElementById(id);
const qs=(sel,root=document)=>root.querySelector(sel);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const text=(node,value)=>{if(node)node.textContent=String(value??'')};
const dateText=value=>{if(!value)return'';try{return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return String(value)}};

function authUrl(){const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','portal');u.searchParams.set('direct','1');u.searchParams.set('return_to',location.origin+'/seonam-medi/admin/');return u.href}
async function token(){
  const platform=sessionStorage.getItem(PLATFORM_TOKEN_KEY)||'';if(platform)return platform;
  const {data}=await sb.auth.getSession();return data?.session?.access_token||'';
}
async function api(path,options={}){
  const bearer=await token();if(!bearer){location.replace(authUrl());throw new Error('로그인이 필요합니다.')}
  const headers=new Headers(options.headers||{});headers.set('authorization','Bearer '+bearer);if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(path,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));
  if(response.status===401){sessionStorage.removeItem(PLATFORM_TOKEN_KEY);await sb.auth.signOut().catch(()=>{});location.replace(authUrl());throw new Error('로그인이 만료되었습니다.')}
  if(!response.ok)throw Object.assign(new Error(data.error||'요청을 처리하지 못했습니다.'),{status:response.status,data});return data;
}
function showPanel(name){
  qsa('[data-panel]').forEach(node=>{const active=node.dataset.panel===name;node.hidden=!active;node.classList.toggle('active',active)});
  qsa('[data-panel-target]').forEach(node=>node.classList.toggle('active',node.dataset.panelTarget===name));
}
qsa('[data-panel-target]').forEach(button=>button.addEventListener('click',()=>showPanel(button.dataset.panelTarget)));
qsa('[data-go]').forEach(button=>button.addEventListener('click',()=>showPanel(button.dataset.go)));

function tag(label,cls=''){const span=document.createElement('span');span.className='tag '+cls;span.textContent=label;return span}
function button(label,handler,cls=''){const b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;b.addEventListener('click',handler);return b}
function empty(label){const p=document.createElement('p');p.className='empty';p.textContent=label;return p}

function updateDashboard(){
  text($('noticeCount'),state.notices.length);text($('channelCount'),state.channels.length);
  const me=state.me;if(!me)return;
  const statusLabel=me.publicStatus==='public'?'공개':me.publicStatus==='private'?'비공개':'점검중';text($('publicStatus'),statusLabel);
  const perms=[];if(me.permissions?.notices)perms.push('공지');if(me.permissions?.channels)perms.push('채널');
  text($('scopeSummary'),me.platform?'최고관리자 권한으로 이 사이트를 관리하고 있습니다.':(perms.length?perms.join('·')+' 관리 권한만 부여된 사이트 범위 관리자입니다.':'조회 권한만 있습니다.'));
  text($('adminIdentity'),me.email||'');text($('accessEmail'),me.email||'-');text($('accessRole'),me.platform?'최고관리자':'게시판 관리자');
  text($('accessNotice'),me.permissions?.notices?'작성·수정·삭제 가능':'권한 없음');text($('accessChannel'),me.permissions?.channels?'추가·수정·숨김·삭제 가능':'권한 없음');
  qs('[data-panel-target="notices"]').hidden=!me.permissions?.notices;qs('[data-panel-target="channels"]').hidden=!me.permissions?.channels;
}

function resetNotice(){
  const form=$('noticeForm');form.reset();form.elements.id.value='';form.elements.status.value='published';text($('noticeFormTitle'),'공지 작성');text($('noticeMessage'),'');
}
function editNotice(item){
  const form=$('noticeForm');form.elements.id.value=item.id;form.elements.title.value=item.title||'';form.elements.body.value=item.body||'';form.elements.status.value=item.status||'draft';form.elements.pinned.checked=Boolean(item.pinned);text($('noticeFormTitle'),'공지 수정');showPanel('notices');form.elements.title.focus();
}
async function deleteNotice(item){
  if(!confirm('이 공지를 삭제할까요?'))return;
  try{await api('/api/seonam-medi/admin/notices/'+item.id,{method:'DELETE'});await loadNotices();text($('noticeMessage'),'삭제했습니다.')}catch(error){text($('noticeMessage'),error.message);$('noticeMessage').classList.add('error')}
}
function renderNotices(){
  const host=$('noticeList');host.replaceChildren();if(!state.notices.length){host.append(empty('등록된 공지가 없습니다.'));return}
  for(const item of state.notices){
    const article=document.createElement('article');article.className='item';
    const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const titleNode=document.createElement('div');titleNode.className='item-title';titleNode.textContent=item.title;
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=dateText(item.publishedAt||item.updatedAt);left.append(titleNode,meta);
    const flags=document.createElement('div');flags.append(tag(item.status==='published'?'공개':'초안',item.status==='published'?'live':''));if(item.pinned)flags.append(tag('상단고정'));
    head.append(left,flags);article.append(head);
    if(item.body){const body=document.createElement('p');body.className='item-body';body.textContent=item.body.length>500?item.body.slice(0,500)+'…':item.body;article.append(body)}
    const actions=document.createElement('div');actions.className='item-actions';actions.append(button('수정',()=>editNotice(item)),button('삭제',()=>deleteNotice(item),'danger'));article.append(actions);host.append(article);
  }
}
async function loadNotices(){if(!state.me?.permissions?.notices)return;const data=await api('/api/seonam-medi/admin/notices');state.notices=data.items||[];renderNotices();updateDashboard()}

function resetChannel(){
  const form=$('channelForm');form.reset();form.elements.id.value='';form.elements.platform.value='youtube';form.elements.category.value='official';form.elements.sortOrder.value='0';form.elements.visible.checked=true;text($('channelFormTitle'),'채널 추가');text($('channelMessage'),'');
}
function editChannel(item){
  const form=$('channelForm');form.elements.id.value=item.id;form.elements.platform.value=item.platform||'other';form.elements.name.value=item.name||'';form.elements.url.value=item.url||'';form.elements.category.value=item.category||'other';form.elements.sortOrder.value=String(item.sortOrder||0);form.elements.official.checked=Boolean(item.official);form.elements.visible.checked=Boolean(item.visible);form.elements.note.value=item.note||'';text($('channelFormTitle'),'채널 수정');showPanel('channels');form.elements.name.focus();
}
async function deleteChannel(item){
  if(!confirm('이 채널 연결을 삭제할까요?'))return;
  try{await api('/api/seonam-medi/admin/channels/'+item.id,{method:'DELETE'});await loadChannels();text($('channelMessage'),'삭제했습니다.')}catch(error){text($('channelMessage'),error.message);$('channelMessage').classList.add('error')}
}
function platformLabel(value){return({youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',blog:'블로그',website:'웹사이트',other:'기타'})[value]||value}
function categoryLabel(value){return({official:'공식채널','related-org':'관련기관',media:'언론·자료',civic:'시민·단체',other:'기타'})[value]||value}
function renderChannels(){
  const host=$('channelList');host.replaceChildren();if(!state.channels.length){host.append(empty('등록된 채널이 없습니다.'));return}
  for(const item of state.channels){
    const article=document.createElement('article');article.className='item';const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const a=document.createElement('a');a.className='item-title';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.name;
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=platformLabel(item.platform)+' · '+categoryLabel(item.category);left.append(a,meta);
    const flags=document.createElement('div');if(item.official)flags.append(tag('공식','official'));flags.append(tag(item.visible?'표시':'숨김',item.visible?'live':''));head.append(left,flags);article.append(head);
    if(item.note){const p=document.createElement('p');p.className='item-body';p.textContent=item.note;article.append(p)}
    const actions=document.createElement('div');actions.className='item-actions';actions.append(button('수정',()=>editChannel(item)),button('삭제',()=>deleteChannel(item),'danger'));article.append(actions);host.append(article);
  }
}
async function loadChannels(){if(!state.me?.permissions?.channels)return;const data=await api('/api/seonam-medi/admin/channels');state.channels=data.items||[];renderChannels();updateDashboard()}

$('noticeForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={title:form.elements.title.value,body:form.elements.body.value,status:form.elements.status.value,pinned:form.elements.pinned.checked};
  const msg=$('noticeMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonam-medi/admin/notices/'+id:'/api/seonam-medi/admin/notices',{method:id?'PUT':'POST',body:JSON.stringify(payload)});text(msg,'저장했습니다.');resetNotice();await loadNotices()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('channelForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={platform:form.elements.platform.value,name:form.elements.name.value,url:form.elements.url.value,category:form.elements.category.value,sortOrder:Number(form.elements.sortOrder.value||0),official:form.elements.official.checked,visible:form.elements.visible.checked,note:form.elements.note.value};
  const msg=$('channelMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonam-medi/admin/channels/'+id:'/api/seonam-medi/admin/channels',{method:id?'PUT':'POST',body:JSON.stringify(payload)});text(msg,'저장했습니다.');resetChannel();await loadChannels()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('noticeReset').addEventListener('click',resetNotice);$('channelReset').addEventListener('click',resetChannel);$('reloadNotices').addEventListener('click',()=>loadNotices().catch(()=>{}));$('reloadChannels').addEventListener('click',()=>loadChannels().catch(()=>{}));
$('refreshAll').addEventListener('click',()=>init(true));$('changeAccount').addEventListener('click',async()=>{sessionStorage.removeItem(PLATFORM_TOKEN_KEY);await sb.auth.signOut().catch(()=>{});location.assign(authUrl())});

async function init(refresh=false){
  try{
    state.me=await api('/api/seonam-medi/admin/me');updateDashboard();
    await Promise.all([state.me.permissions?.notices?loadNotices():Promise.resolve(),state.me.permissions?.channels?loadChannels():Promise.resolve()]);
    if(refresh)text($('scopeSummary'),state.me.platform?'최고관리자 권한으로 최신 상태를 확인했습니다.':'게시판 관리자 권한으로 최신 상태를 확인했습니다.');
  }catch(error){
    if(error.status===403){const main=$('main');main.replaceChildren();const box=document.createElement('section');box.className='card placeholder';const h=document.createElement('strong');h.textContent='관리 권한이 없습니다';const p=document.createElement('p');p.textContent='이 Google 계정에는 서남권 국립의대 시민소통센터 관리 권한이 등록되어 있지 않습니다.';const a=document.createElement('a');a.href=authUrl();a.textContent='다른 Google 계정으로 로그인';box.append(h,p,a);main.append(box);return}
    console.error(error);
  }
}
init();
})();