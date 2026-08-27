import {SUPPORT_STAGES,OPPORTUNITY_SERVICES,getOpportunityService,resolveOpportunityService,buildNextActions} from './core.js';
import {getSpecialistWorkspace,buildSpecialistProfile,profileCompleteness,explainOpportunity} from './specialists.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const safeUrl=value=>{try{const url=new URL(String(value||''),location.origin);return url.protocol==='https:'?url.href:''}catch{return''}};
const stageLabels={discovery:'발굴', 'fit-review':'적합도 검토','application-prep':'신청 준비',submitted:'신청 완료','document-review':'서류평가',presentation:'발표평가',selected:'선정',agreement:'협약',execution:'수행','mid-review':'중간점검','change-control':'변경관리','final-report':'결과보고',settlement:'정산',completed:'완료','follow-up':'후속사업'};
const statusLabels={live:'공식 원천 운영',expanding:'공식 원천 확장 중',planned:'검증 원천 준비 중'};
const serviceId=resolveOpportunityService(location.pathname,'grant');
const service=getOpportunityService(serviceId);
const workspace=getSpecialistWorkspace(serviceId);
const COMMON_KEY='ekodi.support.profile';
const SERVICE_KEY=`ekodi.support.specialist.${serviceId}`;
const PROJECT_KEY=`ekodi.support.project.${serviceId}`;
let common=readJson(COMMON_KEY,{});
let specific=readJson(SERVICE_KEY,{});
let project=readJson(PROJECT_KEY,{name:`${service.label} 신청 준비`,stage:'discovery'});

function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function renderIdentity(){
  document.title=`${service.label} | 에코디 지원기회`;
  $('serviceLabel').textContent=service.label;
  $('serviceTitle').textContent=service.title;
  $('serviceDescription').textContent=`${workspace.purpose} ${service.description}`;
  $('sourceNote').textContent=workspace.sourceNote;
  $('sourceState').textContent=statusLabels[service.sourceStatus]||'원천 확인';
  $('exampleChips').innerHTML=workspace.examples.map(example=>`<button type="button" data-example="${esc(example)}">${esc(example)}</button>`).join('');
  document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{$('need').value=button.dataset.example||'';updateCompleteness();$('need').focus()}));
}
function fieldHtml(field){
  const value=String(specific[field.key]??'');
  const hint=field.hint?`<span class="field-hint">${esc(field.hint)}</span>`:'';
  if(field.type==='select')return `<label>${esc(field.label)}<select data-specialist-field="${esc(field.key)}"><option value="">선택하지 않음</option>${(field.options||[]).map(option=>`<option value="${esc(option)}"${option===value?' selected':''}>${esc(option)}</option>`).join('')}</select>${hint}</label>`;
  return `<label>${esc(field.label)}<input data-specialist-field="${esc(field.key)}" value="${esc(value)}" placeholder="${esc(field.placeholder||'')}">${hint}</label>`;
}
function renderForm(){
  $('profileType').value=common.profileType||'개인';$('region').value=common.region||'';$('need').value=common.need||'';$('interests').value=Array.isArray(common.interests)?common.interests.join(', '):'';
  $('specialistFields').innerHTML=workspace.fields.map(fieldHtml).join('');
  document.querySelectorAll('[data-specialist-field]').forEach(el=>el.addEventListener('input',updateCompleteness));
  ['profileType','region','need','interests'].forEach(id=>$(id).addEventListener('input',updateCompleteness));
  updateCompleteness();
}
function readForm(){
  common={...common,profileType:$('profileType').value,region:$('region').value.trim(),need:$('need').value.trim(),interests:$('interests').value.split(',').map(v=>v.trim()).filter(Boolean)};
  specific={};document.querySelectorAll('[data-specialist-field]').forEach(el=>{specific[el.dataset.specialistField]=el.value.trim()});
  return buildSpecialistProfile(common,specific,serviceId);
}
function persistProfile(message=true){
  const profile=readForm();writeJson(COMMON_KEY,common);writeJson(SERVICE_KEY,specific);
  if(message)$('profileStatus').textContent='이 서비스에 필요한 최소 조건을 이 브라우저에 저장했습니다.';
  updateCompleteness();return profile;
}
function updateCompleteness(){
  const draft={profileType:$('profileType')?.value||common.profileType,region:$('region')?.value||common.region,need:$('need')?.value||common.need};
  const current={};document.querySelectorAll('[data-specialist-field]').forEach(el=>{current[el.dataset.specialistField]=el.value});
  $('completeness').textContent=`${profileCompleteness(draft,current,serviceId)}%`;
}
function renderStages(){
  $('stageSelect').innerHTML=SUPPORT_STAGES.map(stage=>`<option value="${stage}">${esc(stageLabels[stage]||stage)}</option>`).join('');
  $('stageSelect').value=SUPPORT_STAGES.includes(project.stage)?project.stage:'discovery';$('projectName').value=project.name||`${service.label} 신청 준비`;renderActions();
}
function renderActions(){const next=buildNextActions({stage:$('stageSelect').value});$('nextActions').innerHTML=next.map(action=>`• ${esc(action)}`).join('<br>')}
function sourceModeLabel(mode){return mode==='ready_api'?'공식 API':mode==='ready_public'?'공식 공개목록':mode==='ready'?'연결됨':'준비 중'}
async function loadSources(){
  const host=$('sourceStatus');host.textContent='확인 중...';
  try{const response=await fetch('/api/sources/status',{cache:'no-store'});const data=await response.json();host.innerHTML=(data.sources||[]).map(source=>`<div class="source-item"><strong>${esc(source.name)} · ${esc(sourceModeLabel(source.mode))}</strong><small>${source.official?'공식 원천':'외부 원천'} · ${esc((source.capabilities||[]).join(' · '))}</small></div>`).join('')+`<div class="source-item"><strong>${esc(service.label)} · ${esc(statusLabels[service.sourceStatus]||'원천 준비')}</strong><small>${esc(workspace.sourceNote)}</small></div>`}catch{host.textContent='공식 원천 연결상태를 확인하지 못했습니다.'}
}
function renderRelated(){
  const related=OPPORTUNITY_SERVICES.filter(item=>item.id!==serviceId).slice(0,6);
  $('relatedServices').innerHTML=related.map(item=>`<a class="related-service" href="${esc(item.path)}"><strong>${esc(item.label)}</strong><span>${esc(item.title)} →</span></a>`).join('');
}
function opportunityHtml(item,profile){
  const href=safeUrl(item.url);const days=item.urgency?.daysLeft;const deadline=days==null?'마감 확인 필요':days<0?'마감':`${days}일 남음`;
  const reasons=explainOpportunity(profile,item);
  const title=href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(item.title||'제목 없음')}</a>`:esc(item.title||'제목 없음');
  return `<article class="specialist-opportunity"><header><div><h3>${title}</h3><div class="meta-row"><span>${esc(deadline)}</span><span>${esc(item.agency||item.operator||item.sourceName||'공식기관')}</span><span>${item.official?'공식':'출처 확인'}</span></div></div><div class="score" title="선정확률이 아닌 내부 검토 우선순위">${Number(item.score)||0}</div></header><div class="reason-row">${reasons.map(reason=>`<span>${esc(reason)}</span>`).join('')}</div>${href?`<a class="official-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">공식 공고 확인 ↗</a>`:''}</article>`;
}
async function loadMatches(){
  const host=$('matchResult');host.innerHTML='<p>공식 공고를 확인하고 있습니다.</p>';const profile=persistProfile(false);
  try{
    const response=await fetch('/api/proactive-brief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile,projects:[project],serviceId,limit:100,minScore:50})});
    const data=await response.json();const opportunities=data.opportunities||data.brief?.opportunities||[];
    const soon=opportunities.filter(item=>item.urgency?.daysLeft!=null&&item.urgency.daysLeft>=0&&item.urgency.daysLeft<=7).length;
    const verified=opportunities.filter(item=>item.official).length;$('matchCount').textContent=opportunities.length;$('soonCount').textContent=soon;$('verifiedCount').textContent=verified;
    if(opportunities.length)host.innerHTML=opportunities.map(item=>opportunityHtml(item,profile)).join('');
    else host.innerHTML=`<div class="empty-state"><strong>현재 조건에서 바로 추천할 공식 공고가 없습니다.</strong><br>${service.sourceStatus==='live'?'지역이나 필요 키워드를 조금 넓혀 다시 확인해 보세요.':'이 전문서비스의 공식 원천을 확장 중이며, 확인되지 않은 공고를 임의로 만들지 않습니다.'}</div>`;
  }catch{$('matchCount').textContent='-';$('soonCount').textContent='-';$('verifiedCount').textContent='-';host.innerHTML='<div class="empty-state">공식 공고 연결을 확인하지 못했습니다. 잠시 후 다시 갱신할 수 있습니다.</div>'}
}

$('profileForm').addEventListener('submit',event=>{event.preventDefault();persistProfile(true);loadMatches();$('matches').scrollIntoView({behavior:'smooth',block:'start'})});
$('refreshMatches').addEventListener('click',loadMatches);
$('resetProfile').addEventListener('click',()=>{specific={};localStorage.removeItem(SERVICE_KEY);renderForm();$('profileStatus').textContent='이 전문서비스의 추가 조건만 지웠습니다. 공통 프로필은 유지됩니다.'});
$('stageSelect').addEventListener('change',renderActions);
$('saveWorkspace').addEventListener('click',()=>{project={name:$('projectName').value.trim()||`${service.label} 신청 준비`,stage:$('stageSelect').value};writeJson(PROJECT_KEY,project);renderActions();$('profileStatus').textContent='현재 신청 진행단계를 저장했습니다.'});

renderIdentity();renderForm();renderStages();renderRelated();loadSources();loadMatches();
