(()=>{
'use strict';

const shareButton=document.getElementById('shareCard');
const form=document.getElementById('exchangeForm');
const picker=document.getElementById('contactPicker');
const status=document.getElementById('exchangeStatus');
const submit=document.getElementById('exchangeSubmit');

function shareData(){
  return {title:document.title,text:document.querySelector('.headline')?.textContent||document.querySelector('.name')?.textContent||'',url:location.href.split('#')[0]};
}
function shareNotice(text){
  const original=shareButton?.textContent;if(!shareButton)return;
  shareButton.textContent=text;setTimeout(()=>{shareButton.textContent=original},1800);
}
async function copyShareUrl(url){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);return true}}catch{}
  try{
    const input=document.createElement('textarea');input.value=url;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
    document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();return ok;
  }catch{return false}
}
function openDesktopShare(data){
  document.getElementById('desktopSharePanel')?.remove();
  const panel=document.createElement('div');panel.id='desktopSharePanel';panel.className='desktop-share-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','명함 공유');
  const title=document.createElement('strong');title.textContent='명함 공유';
  const url=document.createElement('input');url.value=data.url;url.readOnly=true;url.setAttribute('aria-label','명함 주소');
  const actions=document.createElement('div');actions.className='desktop-share-actions';
  const copy=document.createElement('button');copy.type='button';copy.textContent='링크 복사';
  const email=document.createElement('a');email.textContent='이메일';email.href='mailto:?subject='+encodeURIComponent(data.title)+'&body='+encodeURIComponent((data.text?data.text+'\\n\\n':'')+data.url);
  const qr=document.createElement('a');qr.textContent='QR로 열기';qr.href=location.pathname.replace(/\/card\/?$/,'/qr');qr.target='_blank';qr.rel='noreferrer';
  const close=document.createElement('button');close.type='button';close.textContent='닫기';
  for(const el of [copy,email,qr,close])el.className='desktop-share-action';
  copy.addEventListener('click',async()=>{if(await copyShareUrl(data.url)){copy.textContent='복사됨';shareNotice('주소 복사됨')}else{url.focus();url.select();copy.textContent='주소를 선택했습니다'}});
  close.addEventListener('click',()=>panel.remove());
  panel.addEventListener('click',event=>{if(event.target===panel)panel.remove()});
  actions.append(copy,email,qr,close);panel.append(title,url,actions);document.body.append(panel);url.focus();url.select();
}
if(shareButton){
  shareButton.addEventListener('click',async()=>{
    const data=shareData();
    if(navigator.share){
      try{await navigator.share(data);return}catch(error){if(error?.name==='AbortError')return}
    }
    openDesktopShare(data);
  });
}
function value(name,next){
  const input=form?.elements?.[name];if(input&&next)input.value=String(next).trim();
}
function normalizeWebsite(raw){
  const value=String(raw||'').trim();if(!value)return'';
  const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(value)?value:`https://${value.replace(/^\/+/, '')}`;
  try{const url=new URL(candidate);return ['http:','https:'].includes(url.protocol)?url.toString():''}catch{return''}
}
function normalizeWebsiteField(){
  const input=form?.elements?.website;if(!input)return true;
  const raw=String(input.value||'').trim();if(!raw){input.setCustomValidity('');return true}
  const normalized=normalizeWebsite(raw);
  if(!normalized){input.setCustomValidity('웹사이트 주소를 확인해 주세요.');return false}
  input.value=normalized;input.setCustomValidity('');return true;
}
async function pickContact(){
  if(!navigator.contacts?.select){picker.hidden=true;return}
  try{
    const available=typeof navigator.contacts.getProperties==='function'?await navigator.contacts.getProperties():['name','tel','email'];
    const props=['name','tel','email'].filter(item=>available.includes(item));
    const contacts=await navigator.contacts.select(props,{multiple:false});
    const contact=contacts?.[0];if(!contact)return;
    value('name',contact.name?.[0]);value('phone',contact.tel?.[0]);value('email',contact.email?.[0]);
    if(status){status.className='';status.textContent='불러온 정보를 확인하고 필요하면 수정해 주세요.'}
  }catch(error){
    if(status){status.className='error';status.textContent=error?.name==='AbortError'?'연락처 선택을 취소했습니다.':'휴대폰 연락처를 불러오지 못했습니다.'}
  }
}
if(picker){
  if(!navigator.contacts?.select)picker.hidden=true;
  else picker.addEventListener('click',pickContact);
}
if(form){
  const website=form.elements?.website;
  website?.addEventListener('blur',normalizeWebsiteField);
  website?.addEventListener('input',()=>website.setCustomValidity(''));
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    normalizeWebsiteField();
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const payload={
      name:String(fd.get('name')||'').trim(),
      phone:String(fd.get('phone')||'').trim(),
      email:String(fd.get('email')||'').trim(),
      affiliation:String(fd.get('affiliation')||'').trim(),
      title:String(fd.get('title')||'').trim(),
      website:String(fd.get('website')||'').trim(),
      bot_field:String(fd.get('bot_field')||''),
      privacyConsent:Boolean(fd.get('privacyConsent')),
      source:new URLSearchParams(location.search).get('utm_source')==='qr'?'qr':'card',
    };
    if(!payload.phone&&!payload.email){status.className='error';status.textContent='휴대전화 또는 이메일 중 하나를 입력해 주세요.';return}
    submit.disabled=true;status.className='';status.textContent='연락처를 안전하게 전달하고 있습니다.';
    try{
      const endpoint=location.pathname.replace(/\/card\/?$/,'/card/exchange');
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'연락처를 전달하지 못했습니다.');
      status.className='success';status.textContent=data.message||'연락처가 전달되었습니다.';
      form.reset();
    }catch(error){status.className='error';status.textContent=error.message||'연락처를 전달하지 못했습니다.'}
    finally{submit.disabled=false}
  });
}
})();