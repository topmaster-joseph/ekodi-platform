(()=>{
'use strict';

const cfg=window.EKODI_MY_CONFIG||{};
const $=selector=>document.querySelector(selector);
const form=$('#digitalCardForm');
if(!form)return;

const fields={
  phone:$('#digitalCardPhone'),
  email:$('#digitalCardEmail'),
  exchangeEnabled:$('#digitalCardExchangeEnabled'),
  roles:$('#digitalCardRoles'),
  messengers:$('#digitalCardMessengers'),
  contexts:$('#digitalCardContexts'),
  addRole:$('#digitalCardAddRole'),
  addMessenger:$('#digitalCardAddMessenger'),
  addContext:$('#digitalCardAddContext'),
  save:$('#digitalCardSave'),
  status:$('#digitalCardStatus'),
  link:$('#digitalCardLink'),
  qrLink:$('#digitalCardQrLink'),
  inbox:$('#contactExchangeInbox'),
  inboxStatus:$('#contactExchangeInboxStatus'),
};
let rowSequence=0;
const MESSENGER_SERVICES=Object.freeze([
  ['wechat','WeChat'],
  ['whatsapp','WhatsApp'],
  ['telegram','Telegram'],
  ['line','LINE'],
  ['kakaotalk','KakaoTalk'],
  ['custom','기타 메신저'],
]);
const messengerServiceLabel=value=>MESSENGER_SERVICES.find(([key])=>key===value)?.[1]||'기타 메신저';

function auth(){return window.EKODI_MY_AUTH||null}
function token(){return String(auth()?.getAccessToken?.()||'')}
function signedIn(){return Boolean(auth()?.isSignedIn?.()&&token())}
function nextKey(prefix){rowSequence+=1;return `${prefix}-${rowSequence}`}
function normalizeKey(value,fallback='item'){
  const key=String(value||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
  return /^[a-z0-9]/.test(key)?key:nextKey(fallback);
}
function setStatus(text,kind=''){
  fields.status.className=`profile-status${kind?` ${kind}`:''}`;
  fields.status.textContent=text;
}
async function rpc(name,args={}){
  const accessToken=token();
  if(!accessToken||!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('로그인이 필요합니다.');
  const response=await fetch(`${String(cfg.supabaseUrl).replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{Authorization:`Bearer ${accessToken}`,apikey:cfg.supabasePublishableKey,'content-type':'application/json','cache-control':'no-store'},
    body:JSON.stringify(args),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(String(data?.message||data?.error||'개인 공유 설정을 처리하지 못했습니다.'));
  return data||{};
}
function smallButton(label){
  const button=document.createElement('button');
  button.type='button';button.className='text-button';button.textContent=label;
  return button;
}
function roleRow(item={}){
  const row=document.createElement('div');row.className='digital-card-affiliation digital-card-role';
  const top=document.createElement('div');top.className='digital-card-affiliation-top';
  const name=document.createElement('input');name.name='roleName';name.maxLength=120;name.placeholder='소속/역할명';name.value=String(item.name||'');
  const title=document.createElement('input');title.name='roleTitle';title.maxLength=120;title.placeholder='직함';title.value=String(item.title||'');
  const remove=smallButton('삭제');remove.addEventListener('click',()=>{row.remove();refreshRoleOptions()});
  top.append(name,title,remove);
  const key=document.createElement('input');key.name='roleKey';key.maxLength=40;key.autocapitalize='none';key.autocomplete='off';key.placeholder='공유용 ID (예: ekodi)';key.value=String(item.key||nextKey('role'));
  const description=document.createElement('textarea');description.name='roleDescription';description.maxLength=800;description.rows=2;description.placeholder='이 역할에서 하는 일·소개';description.value=String(item.description||'');
  const url=document.createElement('input');url.name='roleUrl';url.type='url';url.inputMode='url';url.maxLength=1000;url.placeholder='https://관련 링크';url.value=String(item.url||'');
  const activeWrap=document.createElement('label');activeWrap.className='digital-card-check';
  const active=document.createElement('input');active.type='checkbox';active.name='roleActive';active.checked=item.active!==false;
  activeWrap.append(active,document.createTextNode(' 역할 사용'));
  row.append(top,key,description,url,activeWrap);
  key.addEventListener('change',()=>{key.value=normalizeKey(key.value,'role');refreshRoleOptions()});
  name.addEventListener('input',refreshRoleOptions);
  title.addEventListener('input',refreshRoleOptions);
  return row;
}
function currentRoleOptions(){
  return [...fields.roles.querySelectorAll('.digital-card-role')].map(row=>({
    key:String(row.querySelector('[name="roleKey"]')?.value||'').trim().toLowerCase(),
    label:[String(row.querySelector('[name="roleName"]')?.value||'').trim(),String(row.querySelector('[name="roleTitle"]')?.value||'').trim()].filter(Boolean).join(' · '),
  })).filter(item=>item.key);
}
function refreshRoleOptions(){
  const options=currentRoleOptions();
  for(const select of fields.contexts.querySelectorAll('[name="contextRole"]')){
    const selected=select.value;
    select.replaceChildren(new Option('역할 연결 없음',''));
    for(const item of options)select.append(new Option(item.label||item.key,item.key));
    if([...select.options].some(option=>option.value===selected))select.value=selected;
  }
}

function moveMessengerRow(row,direction){
  const sibling=direction<0?row.previousElementSibling:row.nextElementSibling;
  if(!sibling)return;
  if(direction<0)fields.messengers.insertBefore(row,sibling);
  else sibling.after(row);
  refreshMessengerOptions();
}
function messengerRow(item={}){
  const row=document.createElement('div');row.className='digital-card-messenger';
  const key=document.createElement('input');key.type='hidden';key.name='messengerKey';key.value=String(item.key||nextKey('messenger'));
  const top=document.createElement('div');top.className='digital-card-messenger-top';
  const service=document.createElement('select');service.name='messengerService';
  for(const [value,label] of MESSENGER_SERVICES)service.append(new Option(label,value));
  service.value=String(item.service||'wechat');
  const label=document.createElement('input');label.name='messengerLabel';label.maxLength=80;label.placeholder='표시명 (선택)';label.value=String(item.label||'');
  const controls=document.createElement('div');controls.className='digital-card-row-controls';
  const up=smallButton('↑');up.title='위로';up.addEventListener('click',()=>moveMessengerRow(row,-1));
  const down=smallButton('↓');down.title='아래로';down.addEventListener('click',()=>moveMessengerRow(row,1));
  const remove=smallButton('삭제');remove.addEventListener('click',()=>{row.remove();refreshMessengerOptions()});
  controls.append(up,down,remove);top.append(service,label,controls);
  const value=document.createElement('input');value.name='messengerValue';value.maxLength=200;value.placeholder='아이디 · 사용자명 · 전화번호';value.value=String(item.value||'');
  const url=document.createElement('input');url.name='messengerUrl';url.type='url';url.inputMode='url';url.maxLength=1000;url.placeholder='https://공유 링크 (선택)';url.value=String(item.url||'');
  const enabledWrap=document.createElement('label');enabledWrap.className='digital-card-check';
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.name='messengerEnabled';enabled.checked=item.enabled!==false;
  enabledWrap.append(enabled,document.createTextNode(' 이 연락수단 사용'));
  row.append(key,top,value,url,enabledWrap);
  for(const el of [service,label,value,enabled])el.addEventListener('change',refreshMessengerOptions);
  label.addEventListener('input',refreshMessengerOptions);value.addEventListener('input',refreshMessengerOptions);
  return row;
}
function currentMessengerOptions(){
  return [...fields.messengers.querySelectorAll('.digital-card-messenger')].map(row=>{
    const key=String(row.querySelector('[name="messengerKey"]')?.value||'').trim().toLowerCase();
    const service=String(row.querySelector('[name="messengerService"]')?.value||'custom');
    const label=String(row.querySelector('[name="messengerLabel"]')?.value||'').trim();
    const value=String(row.querySelector('[name="messengerValue"]')?.value||'').trim();
    return {key,label:label||messengerServiceLabel(service),detail:value};
  }).filter(item=>item.key);
}
function renderMessengerChoices(host,selectedKeys=[]){
  const selected=new Set(Array.isArray(selectedKeys)?selectedKeys.map(String):[]);
  host.replaceChildren();
  const title=document.createElement('strong');title.textContent='공개할 메신저';host.append(title);
  const options=currentMessengerOptions();
  if(!options.length){
    const empty=document.createElement('span');empty.className='digital-card-context-messenger-empty';empty.textContent='등록된 메신저 없음';host.append(empty);return;
  }
  for(const item of options){
    const wrap=document.createElement('label');wrap.className='digital-card-check digital-card-context-check';
    const input=document.createElement('input');input.type='checkbox';input.value=item.key;input.checked=selected.has(item.key);
    wrap.append(input,document.createTextNode(` ${item.label}${item.detail?` · ${item.detail}`:''}`));host.append(wrap);
  }
}
function refreshMessengerOptions(){
  for(const host of fields.contexts.querySelectorAll('.digital-card-context-messengers')){
    const selected=[...host.querySelectorAll('input:checked')].map(input=>input.value);
    renderMessengerChoices(host,selected);
  }
}
function contextCheck(name,label,checked){
  const wrap=document.createElement('label');wrap.className='digital-card-check digital-card-context-check';
  const input=document.createElement('input');input.type='checkbox';input.name=name;input.checked=Boolean(checked);
  wrap.append(input,document.createTextNode(` ${label}`));return wrap;
}
function contextRow(item={}){
  const row=document.createElement('div');row.className='digital-card-context';
  const top=document.createElement('div');top.className='digital-card-affiliation-top';
  const label=document.createElement('input');label.name='contextLabel';label.maxLength=80;label.placeholder='공유모드 이름 (예: EKODI)';label.value=String(item.label||'');
  const key=document.createElement('input');key.name='contextKey';key.maxLength=40;key.autocapitalize='none';key.autocomplete='off';key.placeholder='공유 ID (예: ekodi)';key.value=String(item.key||nextKey('context'));
  const remove=smallButton('삭제');remove.addEventListener('click',()=>row.remove());
  top.append(label,key,remove);
  const role=document.createElement('select');role.name='contextRole';role.append(new Option('역할 연결 없음',''));
  const options=currentRoleOptions();
  for(const opt of options)role.append(new Option(opt.label||opt.key,opt.key));
  role.value=String(item.role_key||'');
  const checks=document.createElement('div');checks.className='digital-card-context-options';
  const phone=contextCheck('contextPhone','휴대전화 공개',item.show_phone);
  const email=contextCheck('contextEmail','이메일 공개',item.show_email);
  const intro=contextCheck('contextIntro','공개 소개 표시',item.show_profile_intro!==false);
  const links=contextCheck('contextLinks','대표 링크 표시',item.show_profile_links!==false);
  const exchange=contextCheck('contextExchange','연락처 교환 허용',item.exchange_enabled!==false);
  const visible=contextCheck('contextPublic','외부 공개',item.visibility==='public');
  const isDefault=contextCheck('contextDefault','대표 공유모드',item.is_default);
  isDefault.querySelector('input').addEventListener('change',event=>{
    if(!event.currentTarget.checked)return;
    for(const other of fields.contexts.querySelectorAll('[name="contextDefault"]'))if(other!==event.currentTarget)other.checked=false;
  });
  checks.append(phone,email,intro,links,exchange,visible,isDefault);
  const messengerChoices=document.createElement('div');messengerChoices.className='digital-card-context-messengers';
  renderMessengerChoices(messengerChoices,item.messenger_keys);
  row.append(top,role,checks,messengerChoices);
  key.addEventListener('change',()=>{key.value=normalizeKey(key.value,'context')});
  return row;
}
function renderRoles(items=[]){
  fields.roles.replaceChildren();
  for(const item of Array.isArray(items)?items:[])fields.roles.append(roleRow(item));
}
function renderMessengers(items=[]){
  fields.messengers.replaceChildren();
  for(const item of Array.isArray(items)?items:[])fields.messengers.append(messengerRow(item));
}
function renderContexts(items=[]){
  fields.contexts.replaceChildren();
  for(const item of Array.isArray(items)?items:[])fields.contexts.append(contextRow(item));
}
function collectRoles(){
  return [...fields.roles.querySelectorAll('.digital-card-role')].map(row=>({
    key:normalizeKey(row.querySelector('[name="roleKey"]')?.value,'role'),
    name:String(row.querySelector('[name="roleName"]')?.value||'').trim(),
    title:String(row.querySelector('[name="roleTitle"]')?.value||'').trim(),
    description:String(row.querySelector('[name="roleDescription"]')?.value||'').trim(),
    url:String(row.querySelector('[name="roleUrl"]')?.value||'').trim(),
    active:Boolean(row.querySelector('[name="roleActive"]')?.checked),
  })).filter(item=>item.name||item.title||item.description||item.url);
}
function collectMessengers(){
  return [...fields.messengers.querySelectorAll('.digital-card-messenger')].map((row,index)=>({
    key:normalizeKey(row.querySelector('[name="messengerKey"]')?.value,'messenger'),
    service:String(row.querySelector('[name="messengerService"]')?.value||'custom'),
    label:String(row.querySelector('[name="messengerLabel"]')?.value||'').trim(),
    value:String(row.querySelector('[name="messengerValue"]')?.value||'').trim(),
    url:String(row.querySelector('[name="messengerUrl"]')?.value||'').trim(),
    enabled:Boolean(row.querySelector('[name="messengerEnabled"]')?.checked),
    sort_order:index,
  })).filter(item=>item.value||item.url);
}
function collectContexts(){
  return [...fields.contexts.querySelectorAll('.digital-card-context')].map(row=>({
    key:normalizeKey(row.querySelector('[name="contextKey"]')?.value,'context'),
    label:String(row.querySelector('[name="contextLabel"]')?.value||'').trim(),
    role_key:String(row.querySelector('[name="contextRole"]')?.value||'').trim(),
    show_phone:Boolean(row.querySelector('[name="contextPhone"]')?.checked),
    show_email:Boolean(row.querySelector('[name="contextEmail"]')?.checked),
    show_profile_intro:Boolean(row.querySelector('[name="contextIntro"]')?.checked),
    show_profile_links:Boolean(row.querySelector('[name="contextLinks"]')?.checked),
    exchange_enabled:Boolean(row.querySelector('[name="contextExchange"]')?.checked),
    visibility:row.querySelector('[name="contextPublic"]')?.checked?'public':'private',
    is_default:Boolean(row.querySelector('[name="contextDefault"]')?.checked),
    messenger_keys:[...row.querySelectorAll('.digital-card-context-messengers input:checked')].map(input=>input.value),
  })).filter(item=>item.label);
}
function setDisabled(value){
  for(const el of form.querySelectorAll('input,textarea,select,button'))el.disabled=value;
}
async function loadPublicProfile(){try{return await rpc('get_my_public_profile')}catch{return{}}}
function showCardLinks(profile={}){
  const handle=String(profile.handle||''),visible=profile.visibility==='public'&&handle;
  for(const el of [fields.link,fields.qrLink])if(el)el.hidden=!visible;
  if(visible){
    fields.link.href=`https://ekodi.kr/${handle}/card`;
    fields.link.textContent=`공유 페이지 · ekodi.kr/${handle}/card →`;
    fields.qrLink.href=`https://ekodi.kr/${handle}/qr`;
    fields.qrLink.textContent=`QR 공유센터 · ekodi.kr/${handle}/qr →`;
  }
}
function renderInbox(items=[]){
  fields.inbox.replaceChildren();
  if(!items.length){
    const empty=document.createElement('p');empty.className='digital-card-inbox-empty';empty.textContent='아직 받은 연락처가 없습니다.';
    fields.inbox.append(empty);return;
  }
  for(const item of items){
    const article=document.createElement('article');article.className='digital-card-contact-row';
    const head=document.createElement('div');head.className='digital-card-contact-head';
    const name=document.createElement('strong');name.textContent=String(item.name||'이름 없음');
    const time=document.createElement('time');time.textContent=item.last_shared_at?new Date(item.last_shared_at).toLocaleString('ko-KR'):'';
    head.append(name,time);
    if(item.context_label){const badge=document.createElement('span');badge.className='digital-card-context-badge';badge.textContent=String(item.context_label);article.append(badge)}
    const meta=document.createElement('p');meta.textContent=[item.affiliation,item.title].filter(Boolean).join(' · ')||'소속·직함 미입력';
    const contact=document.createElement('p');contact.textContent=[item.phone,item.email].filter(Boolean).join(' · ')||'연락처 없음';
    article.append(head,meta,contact);
    if(item.website){const link=document.createElement('a');link.href=item.website;link.target='_blank';link.rel='noreferrer';link.className='text-link';link.textContent='관련 링크 →';article.append(link)}
    fields.inbox.append(article);
  }
}
async function refresh(){
  if(!signedIn()){
    setDisabled(true);renderRoles([]);renderMessengers([]);renderContexts([]);renderInbox([]);showCardLinks({});
    setStatus('로그인하면 개인 공유 설정을 관리할 수 있습니다.');
    fields.inboxStatus.textContent='로그인 후 받은 연락처를 확인할 수 있습니다.';return;
  }
  setDisabled(true);setStatus('개인 공유 설정을 확인하고 있습니다.');
  try{
    const [card,profile,inbox]=await Promise.all([
      rpc('get_my_identity_share_config'),loadPublicProfile(),rpc('get_my_contact_exchanges',{p_limit:50}),
    ]);
    fields.phone.value=String(card.phone||'');fields.email.value=String(card.email||'');
    fields.exchangeEnabled.checked=Boolean(card.exchange_enabled);
    renderRoles(card.roles);renderMessengers(card.messengers);renderContexts(card.contexts);refreshRoleOptions();refreshMessengerOptions();
    showCardLinks(profile);renderInbox(Array.isArray(inbox.items)?inbox.items:[]);
    fields.inboxStatus.textContent='공유모드가 자동 태그되어 어떤 관계로 연결됐는지 함께 표시됩니다.';
    setStatus(profile?.visibility==='public'&&profile?.handle?'기본정보·역할·공유모드를 관리할 수 있습니다.':'먼저 공개 개인페이지의 아이디와 공개 상태를 설정해 주세요.');
  }catch(error){renderRoles([]);renderMessengers([]);renderContexts([]);renderInbox([]);setStatus(error.message||'개인 공유 설정을 불러오지 못했습니다.','error')}
  finally{setDisabled(false)}
}
async function save(event){
  event.preventDefault();if(!signedIn())return;
  const roles=collectRoles(),messengers=collectMessengers(),contexts=collectContexts();
  if(roles.length>20||messengers.length>20||contexts.length>20){setStatus('역할·메신저·공유모드는 각각 최대 20개까지 등록할 수 있습니다.','error');return}
  if(new Set(messengers.map(item=>item.key)).size!==messengers.length){setStatus('메신저 내부 ID가 중복되었습니다. 항목을 삭제 후 다시 추가해 주세요.','error');return}
  const roleKeys=roles.map(item=>item.key),contextKeys=contexts.map(item=>item.key);
  if(new Set(roleKeys).size!==roleKeys.length||new Set(contextKeys).size!==contextKeys.length){setStatus('역할 ID와 공유 ID는 서로 중복될 수 없습니다.','error');return}
  if(contexts.filter(item=>item.is_default).length>1){setStatus('대표 공유모드는 하나만 선택할 수 있습니다.','error');return}
  const label=fields.save.textContent;setDisabled(true);fields.save.textContent='저장 중…';
  try{
    await rpc('set_my_identity_share_config_v2',{
      p_phone:String(fields.phone.value||'').trim(),p_email:String(fields.email.value||'').trim(),
      p_exchange_enabled:Boolean(fields.exchangeEnabled.checked),p_roles:roles,p_messengers:messengers,p_contexts:contexts,
    });
    setStatus('개인정보 원장과 상황별 공유모드가 저장되었습니다.','success');showCardLinks(await loadPublicProfile());
  }catch(error){setStatus(error.message||'공유 설정을 저장하지 못했습니다.','error')}
  finally{setDisabled(false);fields.save.textContent=label}
}
fields.addRole.addEventListener('click',()=>{if(fields.roles.children.length>=20)return setStatus('역할은 최대 20개까지 등록할 수 있습니다.','error');fields.roles.append(roleRow({active:true}));refreshRoleOptions()});
fields.addMessenger.addEventListener('click',()=>{if(fields.messengers.children.length>=20)return setStatus('메신저는 최대 20개까지 등록할 수 있습니다.','error');fields.messengers.append(messengerRow({service:'wechat',enabled:true}));refreshMessengerOptions()});
fields.addContext.addEventListener('click',()=>{if(fields.contexts.children.length>=20)return setStatus('공유모드는 최대 20개까지 등록할 수 있습니다.','error');fields.contexts.append(contextRow({show_profile_intro:true,show_profile_links:true,exchange_enabled:true,visibility:'private'}))});
form.addEventListener('submit',save);
window.addEventListener('ekodi:my-session',()=>void refresh());
window.addEventListener('ekodi:public-profile-updated',event=>showCardLinks(event.detail||{}));
void refresh();
})();