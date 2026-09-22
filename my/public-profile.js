(()=>{
'use strict';

const cfg=window.EKODI_MY_CONFIG||{};
const $=selector=>document.querySelector(selector);
const form=$('#publicProfileForm');
if(!form)return;

const fields={
  handle:$('#publicHandle'),
  headline:$('#publicHeadline'),
  bio:$('#publicBio'),
  website:$('#publicWebsite'),
  visibility:$('#publicProfileVisibility'),
  save:$('#savePublicProfile'),
  status:$('#publicProfileStatus'),
  link:$('#publicProfileLink'),
};

function auth(){return window.EKODI_MY_AUTH||null}
function token(){return String(auth()?.getAccessToken?.()||'')}
function signedIn(){return Boolean(auth()?.isSignedIn?.()&&token())}
function setDisabled(value){
  for(const field of [fields.handle,fields.headline,fields.bio,fields.website,fields.visibility,fields.save])if(field)field.disabled=value;
}
function status(text,kind=''){
  if(!fields.status)return;
  fields.status.className=`profile-status${kind?` ${kind}`:''}`;
  fields.status.textContent=text;
}
function publicUrl(handle){return handle?`https://ekodi.kr/@${handle}`:''}
function showPublicLink(profile){
  if(!fields.link)return;
  const handle=String(profile?.handle||'');
  const visible=profile?.visibility==='public'&&handle;
  fields.link.hidden=!visible;
  if(visible){fields.link.href=publicUrl(handle);fields.link.textContent=`공개 페이지 보기 · @${handle} →`}
}
function profileFromForm(){
  const handle=String(fields.handle?.value||'').trim().toLowerCase().replace(/^@/,'');
  if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(handle))throw new Error('아이디는 영문 소문자·숫자로 시작하고 3~40자로 입력해 주세요.');
  const headline=String(fields.headline?.value||'').trim();
  const bio=String(fields.bio?.value||'').trim();
  if(headline.length>160)throw new Error('한 줄 소개는 160자 이하로 입력해 주세요.');
  if(bio.length>2000)throw new Error('소개는 2,000자 이하로 입력해 주세요.');
  const raw=String(fields.website?.value||'').trim();
  const links=[];
  if(raw){
    let url;try{url=new URL(raw)}catch{throw new Error('대표 링크 주소를 확인해 주세요.')}
    if(!['https:','http:'].includes(url.protocol))throw new Error('대표 링크는 http 또는 https 주소만 사용할 수 있습니다.');
    links.push({label:url.hostname,url:url.href});
  }
  return {p_handle:handle,p_headline:headline,p_bio:bio,p_links:links,p_visibility:String(fields.visibility?.value||'private')};
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
  if(!response.ok){
    const raw=String(data?.message||data?.error||'');
    if(raw.includes('public_handle_taken'))throw new Error('이미 사용 중인 아이디입니다.');
    if(raw.includes('public_handle_invalid'))throw new Error('아이디 형식을 확인해 주세요.');
    throw new Error('공개 개인페이지 정보를 불러오거나 저장하지 못했습니다.');
  }
  return data||{};
}
function apply(profile={}){
  if(fields.handle)fields.handle.value=String(profile.handle||'');
  if(fields.headline)fields.headline.value=String(profile.headline||'');
  if(fields.bio)fields.bio.value=String(profile.bio||'');
  const firstLink=Array.isArray(profile.links)?profile.links.find(item=>item?.url):null;
  if(fields.website)fields.website.value=String(firstLink?.url||'');
  if(fields.visibility)fields.visibility.value=profile.visibility==='public'?'public':'private';
  showPublicLink(profile);
}
async function refresh(){
  if(!signedIn()){
    apply({});
    setDisabled(true);
    status('로그인하면 공개 개인페이지를 만들고 관리할 수 있습니다.');
    return;
  }
  setDisabled(true);
  status('공개 개인페이지 정보를 확인하고 있습니다.');
  try{
    const profile=await rpc('get_my_public_profile');
    apply(profile);
    status(profile?.handle?'My EKODI에서 수정한 내용만 공개됩니다.':'아이디를 정하고 공개 여부를 선택해 시작할 수 있습니다.');
  }catch(error){
    apply({});
    status(error?.message||'공개 개인페이지 정보를 불러오지 못했습니다.','error');
  }finally{setDisabled(false)}
}
async function save(event){
  event.preventDefault();
  if(!signedIn())return;
  let payload;
  try{payload=profileFromForm()}catch(error){status(error.message,'error');return}
  const label=fields.save?.textContent||'저장';
  setDisabled(true);
  if(fields.save)fields.save.textContent='저장 중…';
  status('공개 개인페이지 설정을 저장하고 있습니다.');
  try{
    const profile=await rpc('set_my_public_profile',payload);
    apply(profile);
    status(profile?.visibility==='public'?'저장되었습니다. 공개 페이지에 반영됩니다.':'저장되었습니다. 현재는 비공개입니다.','success');
  }catch(error){status(error?.message||'저장하지 못했습니다.','error')}
  finally{setDisabled(false);if(fields.save)fields.save.textContent=label}
}

form.addEventListener('submit',save);
window.addEventListener('ekodi:my-session',()=>void refresh());
void refresh();
})();
