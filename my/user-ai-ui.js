import { buildUserSuggestions, EKODI_USER_AI } from './user-ai.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

const ACTIONS={
  attention:'#home',
  continue:'#creator',
  workspace:'#workspaces',
  discover:'#platforms',
  calm:'#workspaces'
};

function collectContext(){
  const workspaceCards=$$('#workspaceList .workspace-card');
  const workspaces=workspaceCards.map(card=>({
    name:card.querySelector('h3')?.textContent?.trim()||'',
    active:card.classList.contains('selected')
  }));

  const recentItems=$$('#creatorList .portfolio-card').slice(0,3).map(card=>({
    title:card.querySelector('h3')?.textContent?.trim()||''
  }));

  const services=$$('#platformList .platform-card').filter(card=>{
    const text=card.textContent||'';
    return text.includes('현재 공간')||text.includes('연결 가능');
  }).map(card=>({name:card.querySelector('h3')?.textContent?.trim()||''}));

  return {workspaces,recentItems,notifications:[],services};
}

function renderSuggestions(){
  const host=$('#recommendationList');
  if(!host)return;

  const signedIn=$('#identityName')?.textContent?.trim() && $('#identityName')?.textContent?.trim()!=='로그인 전';
  if(!signedIn){
    host.innerHTML='<div class="empty" data-user-ai-suggestion="guest"><strong>로그인하면 개인 AI 비서가 시작됩니다.</strong><p>내 공간과 최근 활동을 바탕으로 필요한 다음 행동만 제안합니다.</p></div>';
    return;
  }

  const suggestions=buildUserSuggestions(collectContext());
  host.innerHTML=suggestions.map((item,index)=>{
    const href=ACTIONS[item.type]||'#workspaces';
    const label=index===0?'지금':'제안';
    return `<article class="recommendation-card" data-user-ai-suggestion="${esc(item.type)}"><small>${label} · ${esc(EKODI_USER_AI.name)}</small><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><a class="text-link" href="${esc(href)}">${esc(item.action)} →</a></article>`;
  }).join('');
}

function updateGreeting(){
  const lead=$('#welcomeLead'),name=$('#identityName')?.textContent?.trim();
  if(!lead)return;
  if(name&&name!=='로그인 전')lead.innerHTML=`${esc(name)}님,<br>오늘 필요한 것부터.`;
  else lead.innerHTML='오늘도 편안하게,<br>필요한 것부터.';
}

function normalizeUserLabels(){
  const topAuth=$('#authButton'),accountAuth=$('#accountAuthButton');
  for(const button of [topAuth,accountAuth]){
    if(button?.textContent?.trim()==='My에서 나가기')button.textContent='로그아웃';
  }
}

let queued=false;
function scheduleRender(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{
    queued=false;
    updateGreeting();
    normalizeUserLabels();
    renderSuggestions();
  });
}

const observer=new MutationObserver(scheduleRender);
['#identityName','#workspaceList','#platformList','#creatorList','#authButton','#accountAuthButton'].forEach(selector=>{
  const node=$(selector);
  if(node)observer.observe(node,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
});

document.documentElement.dataset.ekodiUserAi=EKODI_USER_AI.boundary;
scheduleRender();
