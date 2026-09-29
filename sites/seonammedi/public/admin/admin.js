(()=>{
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const PLATFORM_TOKEN_KEY='ekodi-auth-token';
const SESSION_KEY='ekodi-seonam-admin-session';
const CENTRAL_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
const state={me:null,content:[],notices:[],channels:[]};
const $=id=>document.getElementById(id);
const qs=(sel,root=document)=>root.querySelector(sel);
const qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
const text=(node,value)=>{if(node)node.textContent=String(value??'')};
const dateText=value=>{if(!value)return'';try{return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return String(value)}};

function authUrl(){const u=new URL('https://ekodi.kr/auth/');u.searchParams.set('site','portal');u.searchParams.set('direct','1');u.searchParams.set('return_to',location.origin+'/seonammedi/admin/');return u.href}
function storedSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value?.accessToken?value:null}catch{return null}}
function saveSession(value){sessionStorage.setItem(SESSION_KEY,JSON.stringify(value))}
function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
async function supabaseAuth(pathname,body){
  const bridge=pathname.includes('refresh_token')?'/api/seonammedi/admin/auth/refresh':'/api/seonammedi/admin/auth/exchange';
  const response=await fetch(bridge,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.msg||data.error_description||data.error||('auth_'+response.status)),{status:response.status,data});
  return data;
}
function normalizeSession(data,current={}){return{accessToken:data.access_token||'',refreshToken:data.refresh_token||current.refreshToken||'',expiresAt:Number(data.expires_at||0)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:{id:data.user?.id||current.user?.id||'',email:data.user?.email||current.user?.email||''}}}
async function exchangeHandoff(){
  const params=new URLSearchParams(location.hash.slice(1));const tokenHash=params.get('ekodi_token');if(!tokenHash)return storedSession();
  const data=await supabaseAuth('/auth/v1/verify',{token_hash:tokenHash,type:params.get('ekodi_type')||'email'});
  const session=normalizeSession(data);if(!session.accessToken)throw new Error('login_handoff_failed');saveSession(session);history.replaceState(null,'',location.pathname+location.search);return session;
}
async function userToken(){
  let session=await exchangeHandoff();if(!session?.accessToken)return'';
  const now=Math.floor(Date.now()/1000);if(!session.expiresAt||session.expiresAt>now+60)return session.accessToken;
  if(!session.refreshToken){clearSession();return''}
  try{const data=await supabaseAuth('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refreshToken});session=normalizeSession(data,session);saveSession(session);return session.accessToken}catch{clearSession();return''}
}
function centralSessionToken(){
  try{
    const raw=localStorage.getItem(CENTRAL_SESSION_KEY)||'';
    if(!raw)return'';
    const parsed=JSON.parse(raw);
    const session=parsed?.currentSession||parsed?.session||parsed;
    const access=String(session?.access_token||'');
    const expires=Number(session?.expires_at||0);
    if(!access)return'';
    if(expires&&expires<=Math.floor(Date.now()/1000)+30)return'';
    return access;
  }catch{return''}
}
async function token(){
  const platform=sessionStorage.getItem(PLATFORM_TOKEN_KEY)||'';if(platform)return platform;
  const handoff=await userToken();if(handoff)return handoff;
  return centralSessionToken();
}
async function api(path,options={}){
  const bearer=await token();if(!bearer){location.replace(authUrl());throw new Error('로그인이 필요합니다.')}
  const headers=new Headers(options.headers||{});headers.set('authorization','Bearer '+bearer);if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(path,{...options,headers,cache:'no-store'});const data=await response.json().catch(()=>({}));
  if(response.status===401){sessionStorage.removeItem(PLATFORM_TOKEN_KEY);clearSession();try{localStorage.removeItem(CENTRAL_SESSION_KEY)}catch{}location.replace(authUrl());throw new Error('로그인이 만료되었습니다.')}
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
  text($('contentCount'),state.content.length);text($('noticeCount'),state.notices.length);text($('channelCount'),state.channels.length);
  const me=state.me;if(!me)return;
  const statusLabel=me.publicStatus==='public'?'공개':me.publicStatus==='private'?'비공개':'점검중';text($('publicStatus'),statusLabel);
  const perms=[];if(me.permissions?.content)perms.push('웹검색 게시검토');if(me.permissions?.notices)perms.push('공지');if(me.permissions?.channels)perms.push('채널');
  text($('scopeSummary'),me.platform?'최고관리자 권한으로 이 사이트를 관리하고 있습니다.':(perms.length?perms.join('·')+' 관리 권한만 부여된 사이트 범위 관리자입니다.':'조회 권한만 있습니다.'));
  text($('adminIdentity'),me.email||'');text($('accessEmail'),me.email||'-');text($('accessRole'),me.platform?'최고관리자':'게시판 관리자');
  text($('accessContent'),me.permissions?.content?'분류·게시여부 선택 가능':'권한 없음');text($('accessNotice'),me.permissions?.notices?'작성·수정·삭제 가능':'권한 없음');text($('accessChannel'),me.permissions?.channels?'추가·수정·숨김·삭제 가능':'권한 없음');
  qs('[data-panel-target="content"]').hidden=!me.permissions?.content;qs('[data-panel-target="notices"]').hidden=!me.permissions?.notices;qs('[data-panel-target="channels"]').hidden=!me.permissions?.channels;
}


function renderContent(){
  const host=$('contentList');host.replaceChildren();if(!state.content.length){host.append(empty('최근 웹검색 수집 후보가 없습니다.'));return}
  for(const item of state.content){
    const article=document.createElement('article');article.className='item';
    const head=document.createElement('div');head.className='item-head';
    const left=document.createElement('div');const a=document.createElement('a');a.className='item-title';a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title||'제목 없음';
    const meta=document.createElement('div');meta.className='item-meta';meta.textContent=[item.publisher,dateText(item.publishedAt),item.queryLabel].filter(Boolean).join(' · ');left.append(a,meta);
    const controls=document.createElement('div');controls.className='content-review-controls';
    const select=document.createElement('select');select.setAttribute('aria-label','분류');for(const [value,label] of [['official','공식기록'],['news','관련보도']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=item.category===value;select.append(option)}
    const checkLabel=document.createElement('label');checkLabel.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=item.reviewState==='published';checkLabel.append(check,document.createTextNode(' 게시'));
    const save=button('적용',async()=>{try{text($('contentMessage'),'저장 중…');await api('/api/seonammedi/admin/content/'+item.id,{method:'PUT',body:JSON.stringify({state:check.checked?'published':'rejected',category:select.value})});text($('contentMessage'),'게시 상태를 반영했습니다.');await loadContent()}catch(error){text($('contentMessage'),error.message)}},'primary');
    controls.append(select,checkLabel,save);head.append(left,controls);article.append(head);host.append(article);
  }
}
async function loadContent(){if(!state.me?.permissions?.content)return;const data=await api('/api/seonammedi/admin/content');state.content=data.items||[];renderContent();updateDashboard()}

function resetNotice(){
  const form=$('noticeForm');form.reset();form.elements.id.value='';form.elements.status.value='published';text($('noticeFormTitle'),'공지 작성');text($('noticeMessage'),'');
}
function editNotice(item){
  const form=$('noticeForm');form.elements.id.value=item.id;form.elements.title.value=item.title||'';form.elements.body.value=item.body||'';form.elements.status.value=item.status||'draft';form.elements.pinned.checked=Boolean(item.pinned);text($('noticeFormTitle'),'공지 수정');showPanel('notices');form.elements.title.focus();
}
async function deleteNotice(item){
  if(!confirm('이 공지를 삭제할까요?'))return;
  try{await api('/api/seonammedi/admin/notices/'+item.id,{method:'DELETE'});await loadNotices();text($('noticeMessage'),'삭제했습니다.')}catch(error){text($('noticeMessage'),error.message);$('noticeMessage').classList.add('error')}
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
async function loadNotices(){if(!state.me?.permissions?.notices)return;const data=await api('/api/seonammedi/admin/notices');state.notices=data.items||[];renderNotices();updateDashboard()}

function resetChannel(){
  const form=$('channelForm');form.reset();form.elements.id.value='';form.elements.platform.value='youtube';form.elements.category.value='official';form.elements.sortOrder.value='0';form.elements.visible.checked=true;text($('channelFormTitle'),'채널 추가');text($('channelMessage'),'');
}
function editChannel(item){
  const form=$('channelForm');form.elements.id.value=item.id;form.elements.platform.value=item.platform||'other';form.elements.name.value=item.name||'';form.elements.url.value=item.url||'';form.elements.category.value=item.category||'other';form.elements.sortOrder.value=String(item.sortOrder||0);form.elements.official.checked=Boolean(item.official);form.elements.visible.checked=Boolean(item.visible);form.elements.note.value=item.note||'';text($('channelFormTitle'),'채널 수정');showPanel('channels');form.elements.name.focus();
}
async function deleteChannel(item){
  if(!confirm('이 채널 연결을 삭제할까요?'))return;
  try{await api('/api/seonammedi/admin/channels/'+item.id,{method:'DELETE'});await loadChannels();text($('channelMessage'),'삭제했습니다.')}catch(error){text($('channelMessage'),error.message);$('channelMessage').classList.add('error')}
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
async function loadChannels(){if(!state.me?.permissions?.channels)return;const data=await api('/api/seonammedi/admin/channels');state.channels=data.items||[];renderChannels();updateDashboard()}

$('noticeForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={title:form.elements.title.value,body:form.elements.body.value,status:form.elements.status.value,pinned:form.elements.pinned.checked};
  const msg=$('noticeMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonammedi/admin/notices/'+id:'/api/seonammedi/admin/notices',{method:id?'PUT':'POST',body:JSON.stringify(payload)});text(msg,'저장했습니다.');resetNotice();await loadNotices()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('channelForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.id.value;const payload={platform:form.elements.platform.value,name:form.elements.name.value,url:form.elements.url.value,category:form.elements.category.value,sortOrder:Number(form.elements.sortOrder.value||0),official:form.elements.official.checked,visible:form.elements.visible.checked,note:form.elements.note.value};
  const msg=$('channelMessage');msg.classList.remove('error');text(msg,'저장 중…');
  try{await api(id?'/api/seonammedi/admin/channels/'+id:'/api/seonammedi/admin/channels',{method:id?'PUT':'POST',body:JSON.stringify(payload)});text(msg,'저장했습니다.');resetChannel();await loadChannels()}catch(error){msg.classList.add('error');text(msg,error.message)}
});
$('reloadContent').addEventListener('click',()=>loadContent().catch(()=>{}));$('noticeReset').addEventListener('click',resetNotice);$('channelReset').addEventListener('click',resetChannel);$('reloadNotices').addEventListener('click',()=>loadNotices().catch(()=>{}));$('reloadChannels').addEventListener('click',()=>loadChannels().catch(()=>{}));
$('refreshAll').addEventListener('click',()=>init(true));$('changeAccount').addEventListener('click',()=>{sessionStorage.removeItem(PLATFORM_TOKEN_KEY);clearSession();try{localStorage.removeItem(CENTRAL_SESSION_KEY)}catch{}location.assign(authUrl())});

async function init(refresh=false){
  try{
    state.me=await api('/api/seonammedi/admin/me');updateDashboard();
    await Promise.all([state.me.permissions?.content?loadContent():Promise.resolve(),state.me.permissions?.notices?loadNotices():Promise.resolve(),state.me.permissions?.channels?loadChannels():Promise.resolve()]);
    if(refresh)text($('scopeSummary'),state.me.platform?'최고관리자 권한으로 최신 상태를 확인했습니다.':'게시판 관리자 권한으로 최신 상태를 확인했습니다.');
  }catch(error){
    if(error.status===403){const main=$('main');main.replaceChildren();const box=document.createElement('section');box.className='card placeholder';const h=document.createElement('strong');h.textContent='관리 권한이 없습니다';const p=document.createElement('p');p.textContent='이 Google 계정에는 서남권 국립의대 소통센터 관리 권한이 등록되어 있지 않습니다.';const a=document.createElement('a');a.href=authUrl();a.textContent='다른 Google 계정으로 로그인';box.append(h,p,a);main.append(box);return}
    console.error(error);
  }
}
init();
})();