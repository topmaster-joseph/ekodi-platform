import {SUPPORT_STAGES,OPPORTUNITY_SERVICES,getOpportunityService,resolveOpportunityService,analyzeGuidanceChange,fillOfficialForm,buildNextActions} from './core.js';

const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const stageLabels={discovery:'발굴','fit-review':'적합도 검토','application-prep':'신청 준비',submitted:'신청 완료','document-review':'서류평가',presentation:'발표평가',selected:'선정',agreement:'협약',execution:'수행','mid-review':'중간점검','change-control':'변경관리','final-report':'결과보고',settlement:'정산',completed:'완료','follow-up':'후속사업'};
const statusLabels={live:'공식 연결 운영',expanding:'공식 원천 확장 중',planned:'전문 원천 준비 중'};
const savedWorkspace=JSON.parse(localStorage.getItem('ekodi.support.workspace')||'{}');
const savedProfile=JSON.parse(localStorage.getItem('ekodi.support.profile')||'null')||savedWorkspace.profile||{};
const profile={profileType:savedProfile.profileType||'개인',region:savedProfile.region||'',need:savedProfile.need||'',interests:Array.isArray(savedProfile.interests)?savedProfile.interests:[],industry:savedProfile.industry||'',businessType:savedProfile.businessType||'',businessName:savedProfile.businessName||'',registrationNumber:savedProfile.registrationNumber||'',summary:savedProfile.summary||'',recentRevenue:savedProfile.recentRevenue||'',proactiveBenefits:Boolean(savedProfile.proactiveBenefits)};
const project={id:savedWorkspace.id||'primary',name:savedWorkspace.name||'새 지원기회',stage:savedWorkspace.stage||'discovery'};
const pathService=resolveOpportunityService(location.pathname,'all');
const queryService=new URLSearchParams(location.search).get('service');
const activeServiceId=OPPORTUNITY_SERVICES.some(s=>s.id===queryService)?queryService:pathService;
const activeService=activeServiceId==='all'?null:getOpportunityService(activeServiceId);

function serviceCard(service){
  const active=service.id===activeServiceId?' active':'';
  return `<a class="service-card${active}" href="${service.path}" aria-label="${escapeHtml(service.label)} ${escapeHtml(service.title)}"><span class="label">${escapeHtml(service.label)}</span><h3>${escapeHtml(service.title)}</h3><p>${escapeHtml(service.description)}</p><footer><span>${escapeHtml(service.audiences.slice(0,2).join(' · '))}</span><span class="status-dot ${service.sourceStatus}">${escapeHtml(statusLabels[service.sourceStatus])}</span></footer></a>`;
}

function renderServices(){
  $('serviceGrid').innerHTML=OPPORTUNITY_SERVICES.map(serviceCard).join('');
  if(activeService){
    $('activeServicePill').textContent=activeService.label;
    $('heroTitle').innerHTML=`${escapeHtml(activeService.title)}을<br>내 조건에 맞게 연결합니다.`;
    $('heroDescription').textContent=activeService.description+' 다른 전문서비스의 관련 기회도 함께 연결합니다.';
    $('needInput').placeholder=`${activeService.label}에 필요한 상황을 적어주세요`;
    $('briefIntro').textContent=`${activeService.label} 관점으로 공식 공고의 적합도와 마감 임박도를 우선 정리합니다.`;
  }
}

function renderProfile(){
  $('profileType').value=profile.profileType;
  $('region').value=profile.region;
  $('interests').value=(profile.interests||[]).join(', ');
  $('needInput').value=profile.need||'';
  if($('proactiveBenefits'))$('proactiveBenefits').checked=profile.proactiveBenefits;
}

function readProfile(){
  profile.profileType=$('profileType').value;
  profile.region=$('region').value.trim();
  profile.need=$('needInput').value.trim();
  profile.interests=$('interests').value.split(',').map(v=>v.trim()).filter(Boolean);
  profile.proactiveBenefits=Boolean($('proactiveBenefits')?.checked);
  profile.keywords=[profile.need,...profile.interests].filter(Boolean);
  if(profile.profileType==='사업자'&&!profile.businessType)profile.businessType='소상공인';
  return profile;
}

function persistProfile(showMessage=true){
  readProfile();
  localStorage.setItem('ekodi.support.profile',JSON.stringify(profile));
  if(showMessage){$('profileStatus').textContent=profile.proactiveBenefits?'기본조건을 이 브라우저에 저장했습니다. 이 최소정보를 바탕으로 받을 수 있는 혜택을 먼저 제안합니다.':'기본조건을 이 브라우저에 저장했습니다. 선제 제안은 꺼져 있으며 직접 요청할 때만 기회를 찾습니다.'}
}

for(const stage of SUPPORT_STAGES){const option=document.createElement('option');option.value=stage;option.textContent=stageLabels[stage]||stage;$('stageSelect').append(option)}
$('stageSelect').value=project.stage;
$('projectName').value=project.name;

function renderWorkspace(){
  project.name=$('projectName').value;
  project.stage=$('stageSelect').value;
  $('stage').textContent=stageLabels[project.stage]||project.stage;
  $('actions').innerHTML='<strong>다음 행동</strong><br>'+buildNextActions(project).map(v=>'• '+escapeHtml(v)).join('<br>');
}

function sourceLabel(mode){if(mode==='ready_api')return'공식 API 연결';if(mode==='ready_public')return'공식 공개목록 연결';if(mode==='ready')return'연결됨';return'연결 준비'}
async function refreshSources(){
  const box=$('sourceStatus');box.textContent='확인 중...';
  try{
    const response=await fetch('/api/sources/status',{cache:'no-store'});const data=await response.json();
    const upstream=(data.sources||[]).map(source=>`<div class="source-row"><strong>${escapeHtml(source.name)}</strong> · ${escapeHtml(sourceLabel(source.mode))}<br><small>${source.official?'공식 원천':'외부 원천'} · ${escapeHtml((source.capabilities||[]).join(' · '))}</small></div>`).join('');
    const specialist=activeService?`<div class="source-row"><strong>${escapeHtml(activeService.label)}</strong> · ${escapeHtml(statusLabels[activeService.sourceStatus])}<br><small>${activeService.sourceStatus==='live'?'현재 공식 피드에서 관련 공고를 분류·매칭합니다.':'전문 원천 어댑터가 추가될 때 같은 모듈에 연결되도록 분리되어 있습니다.'}</small></div>`:'';
    box.innerHTML=upstream+specialist;
  }catch{box.textContent='연결상태를 확인하지 못했습니다.'}
}

function renderOpportunity(opportunity){
  const title=escapeHtml(opportunity.title||'제목 없음');
  const titleNode=opportunity.url?`<a href="${escapeHtml(opportunity.url)}" target="_blank" rel="noopener noreferrer">${title}</a>`:`<strong>${title}</strong>`;
  const days=opportunity.urgency?.daysLeft==null?'기한 확인 필요':opportunity.urgency.daysLeft<0?'마감':`${opportunity.urgency.daysLeft}일 남음`;
  const specialist=opportunity.specialist?.label||'지원기회';
  return `<div class="opportunity">${titleNode}<div class="opportunity-meta"><span class="tag">${escapeHtml(specialist)}</span><span>적합도 ${Number(opportunity.score)||0}%</span><span>${escapeHtml(days)}</span><span>${escapeHtml(opportunity.agency||opportunity.operator||opportunity.sourceName||'공식 출처')}</span></div></div>`;
}

function renderNeedAssessment(assessment={}){
  const mode=assessment.proactiveEligible?'선제 제안 가능':'직접 요청 중심';
  const confidence=assessment.confidenceLabel||'추가 확인 필요';
  const categories=(assessment.categories||[]).slice(0,3).map(item=>escapeHtml(item.label)).join(' · ');
  const reasons=(assessment.reasons||[]).slice(0,3).map(reason=>`• ${escapeHtml(reason)}`).join('<br>');
  const questions=(assessment.questions||[]).slice(0,2).map(item=>`<div class="radar-question"><strong>확인하면 더 정확해져요</strong><br>${escapeHtml(item.question)}</div>`).join('');
  return `<div class="radar-assessment"><strong>Benefit Radar · ${escapeHtml(mode)}</strong><div class="opportunity-meta"><span>판단 신뢰도 ${escapeHtml(confidence)}</span>${categories?`<span>${categories}</span>`:''}</div>${reasons?`<div class="radar-reasons">${reasons}</div>`:''}${questions}</div>`;
}

async function buildBrief(){
  const box=$('briefResult');box.textContent='정리 중...';persistProfile(false);
  try{
    const needContext={consent:{proactiveBenefits:profile.proactiveBenefits,activityContext:false,externalData:false,sensitiveBenefits:false},signals:[]};
    const payload={profile,needContext,projects:[project],hashtags:[profile.region,profile.need,...(profile.interests||[])].filter(Boolean),limit:80,minScore:(profile.need||profile.region)?54:50};
    if(activeService)payload.serviceId=activeService.id;
    const response=await fetch('/api/proactive-brief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json();const brief=data.brief||data;const opportunities=brief.opportunities||[];const actions=brief.projectActions||[];
    const soon=opportunities.filter(o=>o.urgency?.daysLeft!=null&&o.urgency.daysLeft>=0&&o.urgency.daysLeft<=7).length;
    $('matchCount').textContent=opportunities.length;
    $('soonCount').textContent=soon;
    const noResults=activeService&&activeService.sourceStatus!=='live'?`<p class="empty-note">현재 ${escapeHtml(activeService.label)}의 전용 공식 데이터 원천은 확장 중입니다. 확인되지 않은 공고를 임의 생성하지 않습니다.</p>`:'<p class="empty-note">현재 조건에서 우선 검토할 공식 공고가 없습니다. 지역·관심 키워드를 조금 넓혀 다시 확인해 보세요.</p>';
    const assessment=renderNeedAssessment(brief.needAssessment||{});
    box.innerHTML=`${assessment}<strong>${escapeHtml(brief.summary||data.reason||'브리프 준비 중')}</strong>${opportunities.length?opportunities.map(renderOpportunity).join(''):noResults}${actions.length?'<br><strong>진행 중 기회의 다음 행동</strong><br>'+actions.map(a=>`• ${escapeHtml(a.projectName)}: ${escapeHtml(a.action)}`).join('<br>'):''}`;
  }catch{box.textContent='기회 브리프를 만들지 못했습니다.';$('matchCount').textContent='-';$('soonCount').textContent='-'}
}

$('saveProfile').addEventListener('click',()=>{persistProfile(true);buildBrief()});
$('discover').addEventListener('click',()=>{persistProfile(false);buildBrief();document.getElementById('briefResult').scrollIntoView({behavior:'smooth',block:'center'})});
$('needInput').addEventListener('keydown',event=>{if(event.key==='Enter')$('discover').click()});
$('saveProject').addEventListener('click',()=>{project.name=$('projectName').value;project.stage=$('stageSelect').value;localStorage.setItem('ekodi.support.workspace',JSON.stringify({...project,profile}));renderWorkspace()});
$('stageSelect').addEventListener('change',renderWorkspace);
$('analyze').addEventListener('click',()=>{const result=analyzeGuidanceChange($('previousGuidance').value,$('currentGuidance').value);$('changeResult').textContent=JSON.stringify(result,null,2)});
$('previewForm').addEventListener('click',()=>{readProfile();const schema=[{key:'profileType',label:'대상 유형'},{key:'region',label:'지역'},{key:'need',label:'지원 필요'},{key:'businessName',label:'사업자·기관명',highImpact:true}];$('formResult').innerHTML=fillOfficialForm(schema,profile,project).map(row=>`<div><strong>${escapeHtml(row.label)}</strong> · ${escapeHtml(row.value||'입력 필요')} · ${row.needsHumanReview?'사람 검수':'자동 채움'}</div>`).join('')});
$('refreshSources').addEventListener('click',refreshSources);
$('buildBrief').addEventListener('click',buildBrief);

renderServices();renderProfile();renderWorkspace();refreshSources();buildBrief();
