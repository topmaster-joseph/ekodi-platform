(()=>{
'use strict';

const cfg=window.EKODI_MY_CONFIG||{};
const $=selector=>document.querySelector(selector);
const form=$('#digitalCardForm');
if(!form)return;

const fields={
  phone:$('#digitalCardPhone'),
  email:$('#digitalCardEmail'),
  phonePublic:$('#digitalCardPhonePublic'),
  emailPublic:$('#digitalCardEmailPublic'),
  exchangeEnabled:$('#digitalCardExchangeEnabled'),
  affiliations:$('#digitalCardAffiliations'),
  addAffiliation:$('#digitalCardAddAffiliation'),
  save:$('#digitalCardSave'),
  status:$('#digitalCardStatus'),
  link:$('#digitalCardLink'),
  inbox:$('#contactExchangeInbox'),
  inboxStatus:$('#contactExchangeInboxStatus'),
};

function auth(){return window.EKODI_MY_AUTH||null}
function token(){return String(auth()?.getAccessToken?.()||'')}
function signedIn(){return Boolean(auth()?.isSignedIn?.()&&token())}
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
  if(!response.ok)throw new Error(String(data?.message||data?.error||'명함 정보를 처리하지 못했습니다.'));
  return data||{};
}
function affiliationRow(item={}){
  const row=document.createElement('div');row.className='digital-card-affiliation';
  const top=document.createElement('div');top.className='digital-card-affiliation-top';
  const name=document.createElement('input');name.name='affiliationName';name.maxLength=120;name.placeholder='소속명';name.value=String(item.name||'');
  const title=document.createElement('input');title.name='affiliationTitle';title.maxLength=120;title.placeholder='직함';title.value=String(item.title||'');
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='삭제';remove.addEventListener('click',()=>row.remove());
  top.append(name,title,remove);
  const description=document.createElement('textarea');description.name='affiliationDescription';description.maxLength=800;description.rows=2;description.placeholder='이 소속에서 하는 일·역할 설명';description.value=String(item.description||'');
  const url=document.createElement('input');url.name='affiliationUrl';url.type='url';url.inputMode='url';url.maxLength=1000;url.placeholder='https://관련 링크';url.value=String(item.url||'');
  const visibleWrap=document.createElement('label');visibleWrap.className='digital-card-check';
  const visible=document.createElement('input');visible.type='checkbox';visible.name='affiliationVisible';visible.checked=item.visible!==false;
  visibleWrap.append(visible,document.createTextNode(' 이 소속을 명함에 표시'));
  row.append(top,description,url,visibleWrap);
  return row;
}
function renderAffiliations(items=[]){
  fields.affiliations.replaceChildren();
  const safe=Array.isArray(items)?items:[];
  for(const item of safe)fields.affiliations.append(affiliationRow(item));
  if(!safe.length)fields.affiliations.append(affiliationRow({visible:true}));
}
function collectAffiliations(){
  return [...fields.affiliations.querySelectorAll('.digital-card-affiliation')].map(row=>({
    name:String(row.querySelector('[name="affiliationName"]')?.value||'').trim(),
    title:String(row.querySelector('[name="affiliationTitle"]')?.value||'').trim(),
    description:String(row.querySelector('[name="affiliationDescription"]')?.value||'').trim(),
    url:String(row.querySelector('[name="affiliationUrl"]')?.value||'').trim(),
    visible:Boolean(row.querySelector('[name="affiliationVisible"]')?.checked),
  })).filter(item=>item.name||item.title||item.description||item.url);
}
function setDisabled(value){
  for(const el of form.querySelectorAll('input,textarea,button'))el.disabled=value;
}
async function loadPublicProfile(){
  try{return await rpc('get_my_public_profile')}catch{return{}}
}
function showCardLink(profile={}){
  const handle=String(profile.handle||'');
  const visible=profile.visibility==='public'&&handle;
  fields.link.hidden=!visible;
  if(visible){
    fields.link.href=`https://ekodi.kr/${handle}/card`;
    fields.link.textContent=`디지털 명함 보기 · ekodi.kr/${handle}/card →`;
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
    const meta=document.createElement('p');meta.textContent=[item.affiliation,item.title].filter(Boolean).join(' · ')||'소속·직함 미입력';
    const contact=document.createElement('p');contact.textContent=[item.phone,item.email].filter(Boolean).join(' · ')||'연락처 없음';
    article.append(head,meta,contact);
    if(item.website){
      const link=document.createElement('a');link.href=item.website;link.target='_blank';link.rel='noreferrer';link.className='text-link';link.textContent='관련 링크 →';article.append(link);
    }
    fields.inbox.append(article);
  }
}
async function refresh(){
  if(!signedIn()){
    setDisabled(true);renderAffiliations([]);renderInbox([]);showCardLink({});
    setStatus('로그인하면 디지털 명함과 연락처 교환 기능을 관리할 수 있습니다.');
    fields.inboxStatus.textContent='로그인 후 받은 연락처를 확인할 수 있습니다.';
    return;
  }
  setDisabled(true);setStatus('디지털 명함 정보를 확인하고 있습니다.');
  try{
    const [card,profile,inbox]=await Promise.all([
      rpc('get_my_digital_card'),
      loadPublicProfile(),
      rpc('get_my_contact_exchanges',{p_limit:50}),
    ]);
    fields.phone.value=String(card.phone||'');
    fields.email.value=String(card.email||'');
    fields.phonePublic.checked=Boolean(card.phone_public);
    fields.emailPublic.checked=Boolean(card.email_public);
    fields.exchangeEnabled.checked=Boolean(card.exchange_enabled);
    renderAffiliations(card.affiliations);
    showCardLink(profile);
    renderInbox(Array.isArray(inbox.items)?inbox.items:[]);
    fields.inboxStatus.textContent='상대방이 동의 후 보낸 연락처만 표시됩니다.';
    setStatus(profile?.visibility==='public'&&profile?.handle?'명함 주소가 준비되어 있습니다. 공개할 연락처와 소속을 확인해 주세요.':'먼저 공개 개인페이지의 아이디와 공개 상태를 설정해 주세요.');
  }catch(error){
    renderAffiliations([]);renderInbox([]);setStatus(error.message||'디지털 명함 정보를 불러오지 못했습니다.','error');
  }finally{setDisabled(false)}
}
async function save(event){
  event.preventDefault();
  if(!signedIn())return;
  const affiliations=collectAffiliations();
  if(affiliations.length>20){setStatus('소속은 최대 20개까지 등록할 수 있습니다.','error');return}
  const label=fields.save.textContent;setDisabled(true);fields.save.textContent='저장 중…';
  try{
    await rpc('set_my_digital_card',{
      p_phone:String(fields.phone.value||'').trim(),
      p_email:String(fields.email.value||'').trim(),
      p_phone_public:Boolean(fields.phonePublic.checked),
      p_email_public:Boolean(fields.emailPublic.checked),
      p_exchange_enabled:Boolean(fields.exchangeEnabled.checked),
      p_affiliations:affiliations,
    });
    setStatus('디지털 명함 설정이 저장되었습니다.','success');
    showCardLink(await loadPublicProfile());
  }catch(error){setStatus(error.message||'명함 설정을 저장하지 못했습니다.','error')}
  finally{setDisabled(false);fields.save.textContent=label}
}

fields.addAffiliation.addEventListener('click',()=>{
  if(fields.affiliations.children.length>=20){setStatus('소속은 최대 20개까지 등록할 수 있습니다.','error');return}
  fields.affiliations.append(affiliationRow({visible:true}));
});
form.addEventListener('submit',save);
window.addEventListener('ekodi:my-session',()=>void refresh());
window.addEventListener('ekodi:public-profile-updated',event=>showCardLink(event.detail||{}));
void refresh();
})();