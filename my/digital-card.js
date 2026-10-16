(()=>{
'use strict';

const shareButton=document.getElementById('shareCard');
const nfcButton=document.getElementById('writeNfc');
const shareStatus=document.getElementById('shareStatus');
const form=document.getElementById('exchangeForm');
const picker=document.getElementById('contactPicker');
const status=document.getElementById('exchangeStatus');
const submit=document.getElementById('exchangeSubmit');

function cardUrl(){return location.href.split('#')[0]}
function setShareStatus(message,kind=''){
  if(!shareStatus)return;
  shareStatus.className=kind;
  shareStatus.textContent=message;
}
async function copyCardUrl(){
  try{
    await navigator.clipboard?.writeText(cardUrl());
    setShareStatus('명함 주소를 복사했습니다.','success');
    return true;
  }catch{
    setShareStatus('이 환경에서는 자동 복사를 지원하지 않습니다.','error');
    return false;
  }
}
if(shareButton){
  shareButton.addEventListener('click',async()=>{
    const data={title:document.title,text:document.querySelector('.headline')?.textContent||document.querySelector('.name')?.textContent||'',url:cardUrl()};
    try{
      if(navigator.share){
        await navigator.share(data);
        setShareStatus('휴대폰 공유창으로 명함을 보냈습니다.','success');
      }else{
        await copyCardUrl();
      }
    }catch(error){
      if(error?.name!=='AbortError')setShareStatus('공유를 시작하지 못했습니다. QR 또는 링크 복사를 이용해 주세요.','error');
    }
  });
}
if(nfcButton){
  if(typeof window.NDEFReader!=='function')nfcButton.hidden=true;
  else{
    nfcButton.hidden=false;
    nfcButton.addEventListener('click',async()=>{
      const original=nfcButton.textContent;
      nfcButton.disabled=true;nfcButton.textContent='NFC 태그를 가까이 대세요';
      setShareStatus('휴대폰 뒷면에 NFC 태그를 가까이 대세요.');
      try{
        const writer=new NDEFReader();
        await writer.write({records:[{recordType:'url',data:cardUrl()}]});
        setShareStatus('NFC 태그에 이 명함 주소를 기록했습니다.','success');
      }catch(error){
        const denied=error?.name==='NotAllowedError'||error?.name==='SecurityError';
        setShareStatus(denied?'NFC 사용 권한이 허용되지 않았습니다.':'NFC 기록을 완료하지 못했습니다. QR 또는 시스템 공유를 이용해 주세요.','error');
      }finally{
        nfcButton.disabled=false;nfcButton.textContent=original;
      }
    });
  }
}
function value(name,next){
  const input=form?.elements?.[name];if(input&&next)input.value=String(next).trim();
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
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const fd=new FormData(form);
    const payload={
      name:String(fd.get('name')||'').trim(),
      phone:String(fd.get('phone')||'').trim(),
      email:String(fd.get('email')||'').trim(),
      affiliation:String(fd.get('affiliation')||'').trim(),
      title:String(fd.get('title')||'').trim(),
      website:String(fd.get('website')||'').trim(),
      contextKey:String(fd.get('contextKey')||new URLSearchParams(location.search).get('context')||'').trim(),
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