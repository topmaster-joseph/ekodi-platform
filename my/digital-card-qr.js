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
  // QRCode.js may render a hidden canvas and a visible image. Export only one
  // source, with a true white quiet zone, regardless of its on-screen CSS.
  const canvas=root.querySelector('canvas');
  const image=root.querySelector('img');
  const source=canvas?.width&&canvas?.height?canvas:(image?.complete&&image?.naturalWidth?image:null);
  if(!source){setStatus('QR 이미지가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');return}
  let href='';
  try{
    const exported=document.createElement('canvas');
    exported.width=768;exported.height=768;
    const context=exported.getContext('2d');
    if(!context)throw new Error('canvas_unavailable');
    context.fillStyle='#ffffff';
    context.fillRect(0,0,768,768);
    context.imageSmoothingEnabled=false;
    context.drawImage(source,64,64,640,640);
    href=exported.toDataURL('image/png');
  }catch{}
  if(!href){setStatus('이 환경에서는 QR 이미지 저장을 지원하지 않습니다.');return}
  const a=document.createElement('a');
  a.href=href;a.download='ekodi-contact-qr.png';a.rel='noopener';a.click();
  setStatus('스캔 여백을 포함한 QR 이미지 저장을 시작했습니다.');
});
render();
})();