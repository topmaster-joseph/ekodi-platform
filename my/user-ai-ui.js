import './personal-ai-style-loader.js';
import { buildUserSuggestions, EKODI_USER_AI } from './user-ai.js';
import { initSiteActivityRoleUi } from './site-activity-role-ui.js';
import { initPersonalAiHub } from './user-ai-provider-ui.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

const ACTIONS={attention:'#home',continue:'#creator',workspace:'#workspaces',discover:'#platforms',calm:'#workspaces'};

function collectContext(){
  const workspaces=$$('#workspaceList .workspace-card');
  const recentItems=$$('#creatorList .portfolio-card').slice(0,3).map(card=>({title:card.querySelector('h3')?.textContent?.trim()||''}));
  const services=$$('#platformList .platform-card').filter(card=>{
    const text=card.textContent||'';
    return text.includes('현재 공간')||text.includes('연결 가능');
  });
  return {workspaces,recentItems,notifications:[],services};
}

function personalizationSuggestion(){
  const card=$('#platformList [data-personalization-recommended="true"]');
  if(!card)return '';
  const serviceId=card.dataset.serviceCard||'';
  const title=card.querySelector('h3')?.textContent?.trim()||'새로운 EKODI 서비스';
  return `<article class="recommendation-card" data-user-ai-suggestion="personalization" data-service-id="${esc(serviceId)}"><small>관심 신호 · ${esc(EKODI_USER_AI.name)}</small><h3>${esc(title)}을 살펴볼까요?</h3><p>최근 관심과 현재 맥락에서 도움이 될 가능성이 있어 조용히 제안합니다. 추가하거나 숨길지는 직접 선택할 수 있습니다.</p><a class="text-link" href="#platforms">추천 확인 →</a></article>`;
}

function renderSuggestions(){
  const host=$('#recommendationList');
  if(!host)return;
  const signedIn=$('#identityName')?.textContent?.trim() && $('#identityName')?.textContent?.trim()!=='로그인 전';
  if(!signedIn){
    host.innerHTML='<div class="empty" data-user-ai-suggestion="guest"><strong>로그인하면 개인 AI 비서가 시작됩니다.</strong><p>내 공간과 최근 활동을 바탕으로 필요한 다음 행동만 제안합니다.</p></div>';
    return;
  }
  const regular=buildUserSuggestions(collectContext()).map((item,index)=>{
    const href=ACTIONS[item.type]||'#workspaces';
    const label=index===0?'지금':'제안';
    return `<article class="recommendation-card" data-user-ai-suggestion="${esc(item.type)}"><small>${label} · ${esc(EKODI_USER_AI.name)}</small><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><a class="text-link" href="${esc(href)}">${esc(item.action)} →</a></article>`;
  }).join('');
  host.innerHTML=personalizationSuggestion()+regular;
}

function updateGreeting(){
  const lead=$('#welcomeLead'),name=$('#identityName')?.textContent?.trim();
  if(!lead)return;
  lead.innerHTML=name&&name!=='로그인 전'?`${esc(name)}님,<br>오늘 필요한 것부터.`:'오늘도 편안하게,<br>필요한 것부터.';
}

let queued=false;
function scheduleRender(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{
    queued=false;
    updateGreeting();
    renderSuggestions();
  });
}

const observer=new MutationObserver(scheduleRender);
['#identityName','#workspaceList','#platformList','#creatorList'].forEach(selector=>{
  const node=$(selector);
  if(node)observer.observe(node,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
});

document.documentElement.dataset.ekodiUserAi=EKODI_USER_AI.boundary;
initSiteActivityRoleUi();
initPersonalAiHub();
scheduleRender();
