(()=>{
'use strict';
const root=document.documentElement;
if(!root||root.dataset.ekodiHomeFocusRequest!=='v1')return;
const selector='section,article,aside,.section,.panel,.content-section,[data-section]';
function homeCandidates(main){
  const direct=[...main.children].filter(node=>node.matches?.(selector));
  if(direct.length>=3)return direct;
  return [...main.querySelectorAll(':scope > div > section,:scope > div > article,:scope > div > aside,:scope > div > .section,:scope > div > .panel,:scope > div > .content-section,:scope > div > [data-section]')].slice(0,16);
}
function run(){
  if(root.dataset.ekodiProgressiveHomeApplied==='v1'||document.querySelector('[data-ekodi-progressive-reveal="v1"]'))return;
  const main=document.querySelector('[data-ekodi-user-canvas],main,[role="main"]');
  if(!main)return;
  const candidates=homeCandidates(main);
  const mobile=matchMedia('(max-width:640px)').matches;
  const visibleCount=mobile?1:2;
  root.dataset.ekodiProgressiveHomeApplied='v1';
  if(candidates.length<=visibleCount)return;
  root.dataset.ekodiHomeFocus='v1';
  root.dataset.ekodiHomeFocusDensity=visibleCount===1?'focused':'balanced';
  const hidden=candidates.slice(visibleCount);
  hidden.forEach((node,index)=>{
    node.dataset.ekodiProgressiveHidden='1';
    node.hidden=true;
    if(!node.id)node.id=`ekodi-home-secondary-${index+1}`;
  });
  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.dataset.ekodiProgressiveReveal='v1';
  toggle.setAttribute('aria-expanded','false');
  toggle.setAttribute('aria-controls',hidden.map(node=>node.id).join(' '));
  const labels=()=>/^ko/i.test(root.lang||document.documentElement.lang||'ko')?['더보기','간단히']:['More','Less'];
  const sync=expanded=>{
    hidden.forEach(node=>{node.hidden=!expanded;});
    toggle.setAttribute('aria-expanded',expanded?'true':'false');
    toggle.textContent=labels()[expanded?1:0];
  };
  const revealHashTarget=()=>{
    if(!location.hash)return;
    let target=null;
    try{target=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{}
    if(target&&hidden.some(node=>node===target||node.contains(target)))sync(true);
  };
  toggle.addEventListener('click',()=>sync(toggle.getAttribute('aria-expanded')!=='true'));
  window.addEventListener('hashchange',revealHashTarget);
  sync(false);
  revealHashTarget();
  candidates[visibleCount-1].after(toggle);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else queueMicrotask(run);
})();
