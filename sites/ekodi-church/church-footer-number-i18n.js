(()=>{
'use strict';
if(window.__EKODI_CHURCH_FOOTER_NUMBER_I18N__)return;
window.__EKODI_CHURCH_FOOTER_NUMBER_I18N__=true;
const LABEL={
  'ko-KR':'고유번호',
  en:'Organization No.',
  'zh-CN':'团体编号',
  ja:'団体番号',
  my:'အဖွဲ့အစည်း နံပါတ်',
  kac:'Organization No.',
  vi:'Mã tổ chức',
  mn:'Байгууллагын дугаар',
  id:'No. Organisasi'
};
function normalize(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='ko'||raw.startsWith('ko-'))return'ko-KR';
  if(raw==='zh'||raw.startsWith('zh-'))return'zh-CN';
  if(raw==='ja'||raw.startsWith('ja-'))return'ja';
  if(raw==='my'||raw.startsWith('my-'))return'my';
  if(raw==='kac'||raw.startsWith('kac-')||raw==='jinghpaw'||raw==='kachin')return'kac';
  if(raw==='vi'||raw.startsWith('vi-'))return'vi';
  if(raw==='mn'||raw.startsWith('mn-'))return'mn';
  if(raw==='id'||raw.startsWith('id-'))return'id';
  return'en';
}
function locale(){return normalize(window.EKODIUserLanguage?.getLocale?.()||document.documentElement.dataset.ekodiLocale||document.documentElement.lang||'ko-KR');}
function apply(){
  const nodes=[...document.querySelectorAll('.church-footer-info span')];
  const node=nodes.find(item=>/\d{3}[\s-]?\d{2}[\s-]?\d{5}/.test(item.textContent||''));
  if(!node)return;
  const match=(node.textContent||'').match(/\d{3}[\s-]?\d{2}[\s-]?\d{5}/);
  if(!match)return;
  node.textContent=`${LABEL[locale()]||LABEL.en} ${match[0].replace(/\s+/g,'-')}`;
}
window.addEventListener('ekodi:locale-change',()=>requestAnimationFrame(apply));
window.addEventListener('ekodi:church-i18n-applied',()=>requestAnimationFrame(apply));
window.addEventListener('ekodi:church-extended-i18n-applied',()=>requestAnimationFrame(apply));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(apply),{once:true});else requestAnimationFrame(apply);
new MutationObserver(()=>requestAnimationFrame(apply)).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();