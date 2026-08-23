import { SUPPORT_STAGES, analyzeGuidanceChange, scoreOpportunity, fillOfficialForm, buildNextActions } from './core.js';

const $=id=>document.getElementById(id);
const stageLabels={discovery:'발굴','fit-review':'적합도 검토','application-prep':'신청 준비',submitted:'신청 완료','document-review':'서류평가',presentation:'발표평가',selected:'선정',agreement:'협약',execution:'수행','mid-review':'중간점검','change-control':'변경관리','final-report':'결과보고',settlement:'정산',completed:'완료','follow-up':'후속사업'};
const saved=JSON.parse(localStorage.getItem('ekodi.support.workspace')||'{}');
const profile=saved.profile||{businessName:'에코디비즈',registrationNumber:'sample',summary:'AI 기반 소상공인 지원',recentRevenue:'available',region:'전남',industry:'서비스',businessType:'소상공인'};
const project={name:saved.name||$('projectName').value,stage:saved.stage||'discovery'};

for(const stage of SUPPORT_STAGES){const o=document.createElement('option');o.value=stage;o.textContent=stageLabels[stage]||stage;$('stageSelect').append(o)}
$('stageSelect').value=project.stage;$('projectName').value=project.name;
function render(){project.name=$('projectName').value;project.stage=$('stageSelect').value;$('stage').textContent=stageLabels[project.stage]||project.stage;const actions=buildNextActions(project);$('actions').innerHTML='<strong>다음 행동</strong><br>'+actions.map(v=>'• '+v).join('<br>');const score=scoreOpportunity(profile,{region:'전남',businessType:'소상공인'});$('score').textContent=score+'%';}
$('saveProject').addEventListener('click',()=>{localStorage.setItem('ekodi.support.workspace',JSON.stringify({...project,name:$('projectName').value,stage:$('stageSelect').value,profile}));render()});
$('stageSelect').addEventListener('change',render);
$('analyze').addEventListener('click',()=>{const result=analyzeGuidanceChange($('previousGuidance').value,$('currentGuidance').value);$('changeResult').textContent=JSON.stringify(result,null,2);$('deadline').textContent=result.deadline||'없음'});
$('previewForm').addEventListener('click',()=>{const schema=[{key:'businessName',label:'기업명'},{key:'registrationNumber',label:'사업자등록번호',highImpact:true},{key:'summary',label:'사업개요'},{key:'budget',label:'사업비',highImpact:true}];const rows=fillOfficialForm(schema,profile,project);$('formResult').innerHTML=rows.map(r=>`<div><strong>${r.label}</strong> · ${r.value||'입력 필요'} · ${r.needsHumanReview?'사람 검수':'자동 채움'}</div>`).join('')});
render();
