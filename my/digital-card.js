(()=>{
'use strict';

const shareButton=document.getElementById('shareCard');
const form=document.getElementById('exchangeForm');
const picker=document.getElementById('contactPicker');
const status=document.getElementById('exchangeStatus');
const submit=document.getElementById('exchangeSubmit');

if(shareButton){
  shareButton.addEventListener('click',async()=>{
    const data={title:document.title,text:document.querySelector('.headline')?.textContent||document.querySelector('.name')?.textContent||'',url:location.href.split('#')[0]};
    try{
      if(navigator.share)await navigator.share(data);
      else{
        await navigator.clipboard?.writeText(data.url);
        const original=shareButton.textContent;shareButton.textContent='주소 복사됨';setTimeout(()=>{shareButton.textContent=original},1600);
      }
    }catch{}
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