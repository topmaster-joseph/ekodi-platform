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
  contexts:$('#digitalCardContexts'),
  addRole:$('#digitalCardAddRole'),
  addContext:$('#digitalCardAddContext'),
  save:$('#digitalCardSave'),
  status:$('#digitalCardStatus'),
  link:$('#digitalCardLink'),
  qrLink:$('#digitalCardQrLink'),
  inbox:$('#contactExchangeInbox'),
  inboxStatus:$('#contactExchangeInboxStatus'),
};
let rowSequence=0;

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
  row.append(top,role,checks);
  key.addEventListener('change',()=>{key.value=normalizeKey(key.value,'context')});
  return row;
}
function renderRoles(items=[]){
  fields.roles.replaceChildren();
  for(const item of Array.isArray(items)?items:[])fields.roles.append(roleRow(item));
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
    is_default:Boolean(row.qu