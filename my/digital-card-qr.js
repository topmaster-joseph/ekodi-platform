(()=>{
'use strict';
const root=document.getElementById('qrCode');
if(!root)return;
const target=String(root.dataset.target||'').trim();
const status=document.getElementById('qrStatus');
const copy=document.getElementById('copyQrLink');
const download=document.getElementById('downloadQr');
function setStatus(text){if(status)status.textContent=text}
function render(){
  if(!target||typeof QRCode!=='function'){setStatus('QR코드를 만들지 못했습니다.');return}
  try{
    root.replaceChildren();
    new QRCode(root,{text:target,width:640,height:640,colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  }catch{setStatus('QR코드를 만들지 못했습니다.')}
}
copy?.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(target);setStatus('링크를 복사했습니다.')}catch{setStatus('링크 복사를 지원하지 않는 환경입니다.')}
});
download?.addEventListener('click',()=>{
  const canvas=root.querySelector('canvas');
  const image=root.querySelector('img');
  let href='';
  try{href=canvas?.toDataURL('image/png')||image?.src||''}catch{}
  if(!href){setStatus('이 환경에서는 QR 이미지 저장을 지원하지 않습니다.');return}
  const a=document.createElement('a');
  a.href=href;a.download='ekodi-contact-qr.png';a.rel='noopener';a.click();
  setStatus('QR 이미지 저장을 시작했습니다.');
});
render();
})();