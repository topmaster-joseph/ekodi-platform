import {PROPOSAL_DOMAINS,PROPOSAL_GOALS,createProposalDraft,selectedStages,reviewProposalDraft,draftToMarkdown,validImportedDraft,normalizeReferenceUrl} from './core.js';
import {analyzeProposalSources,makeGuidedProposalDraft,calculateProposalBudget,reviewProposalBudget,parseKrwAmount,proposalToPrintHtml,proposalToPresentationMd,proposalBudgetToCsv,proposalToMarkdownWithBudget} from './analysis.js';
const byId=id=>document.getElementById(id);
let project=null;
let sources=[];
const LABEL={text:'텍스트 미리보기',url:'웹주소 · 미검증',unsupported:'내용 분석 미지원',tooLarge:'허용 용량 초과'};
function status(message){byId('status').textContent=message;}
function make(tag,content,className){
  const element=document.createElement(tag);
  if(content!==undefined)element.textContent=String(content);
  if(className)element.className=className;
  return element;
}
function addOption(select,entry){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.append(option);}
for(const row of PROPOSAL_DOMAINS)addOption(byId('domainInput'),row);
for(const row of PROPOSAL_GOALS)addOption(byId('goalInput'),row);
function renderSourceList(){
  const list=byId('sourceList');list.replaceChildren();
  for(const source of sources){
    const li=make('li');
    const name=make('strong',source.name+' ');
    const label=make('span',LABEL[source.kind]||source.kind,'filetag');
    li.append(name,label);
    if(source.kind==='text'){
      const details=make('details');
      details.append(make('summary','원문 일부 보기 (미검증)'));
      const pre=make('pre',source.excerpt);
      pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';
      details.append(pre);li.append(details);
    }
    list.append(li);
  }
}
async function addSources(files){
  const accepted=Array.from(files).slice(0,12);
  if(files.length>12)status('파일은 한 번에 최대 12개까지 확인합니다.');
  for(const file of accepted){
    if(sources.length>=20){status('프로젝트당 자료는 최대 20개로 제한됩니다.');break;}
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    const isText=['txt','md','csv','json'].includes(ext);
    const kind=file.size>750000?'tooLarge':isText?'text':'unsupported';
    let excerpt='';
    if(kind==='text'){try{excerpt=(await file.text()).slice(0,6000);}catch{excerpt='';}}
    sources.push({name:file.name.slice(0,240),kind,excerpt});
  }
  renderSourceList();status('자료 '+sources.length+'건을 브라우저에서 분류했습니다. 실제 근거 확인과 문서 변환은 수행하지 않았습니다.');
}
byId('sourceInput').addEventListener('change',event=>{addSources(event.target.files).catch(()=>status('첨부 자료를 읽지 못했습니다.'));event.target.value='';});
function addReferenceUrl(){
  const element=byId('sourceUrlInput');
  const raw=element.value.trim();
  if(!raw)return status('등록할 참고자료 웹주소를 입력하세요.');
  if(raw.length>1200)return status('참고자료 주소는 1,200자 이하만 등록할 수 있습니다.');
  let safe;
  try{safe=normalizeReferenceUrl(raw);}catch(error){return status(error.message);}
  if(sources.length>=20)return status('프로젝트당 자료는 최대 20개까지만 등록할 수 있습니다.');
  if(sources.some(item=>item.name===safe))return status('이미 등록한 웹주소입니다.');
  sources.push({name:safe,kind:'url',excerpt:''});
  element.value='';
  renderSourceList();
  status('웹주소를 참고 목록에 추가했습니다. 링크에 접근하거나 검증하지 않았습니다.');
}
byId('addUrlBtn').addEventListener('click',addReferenceUrl);
byId('sourceUrlInput').addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();addReferenceUrl();}
});

function snapshot(){
  if(!project)return null;
  project.title=byId('titleInput').value.trim().slice(0,160)||project.title;
  project.idea=byId('ideaInput').value.trim().slice(0,20000);
  for(const element of document.querySelectorAll('[data-decision]'))project.decisions[element.dataset.decision]=element.value.slice(0,600);
  for(const element of document.querySelectorAll('[data-section]')){
    const section=project.sections.find(item=>item.id===element.dataset.section);
    if(section)section.body=element.value.slice(0,50000);
  }
  project.budgetRows=collectBudgetRows();
  return project;
}
function draw(){
  byId('editor').hidden=false;
  byId('projectMeta').textContent='분야: '+(PROPOSAL_DOMAINS.find(e=>e.id===project.domain)?.name||project.domain)+' · 목적: '+(PROPOSAL_GOALS.find(e=>e.id===project.goal)?.name||project.goal)+' · 브라우저 작업 초안';
  for(const element of document.querySelectorAll('[data-decision]'))element.value=String(project.decisions?.[element.dataset.decision]||'');
  const zone=byId('sectionEditor');zone.replaceChildren();
  for(const section of project.sections){
    const item=make('div',undefined,'edititem');
    const label=make('label',section.name);
    const hint=make('p',section.guide);
    const edit=make('textarea');
    edit.rows=4;edit.value=section.body||'';
    edit.dataset.section=section.id;edit.maxLength=50000;
    label.append(edit);item.append(label,hint);zone.append(item);
  }
  const dataSource=project.sources||[];
  const workflow=selectedStages({
    sources:dataSource.length,
    form:dataSource.some(item=>/\.hwpx$|\.docx$|\.pdf$/i.test(item.name)),
    data:dataSource.some(item=>/\.xlsx$|\.csv$/i.test(item.name)),
    research:true,
    presentation:project.goal==='pitch'
  });
  const list=byId('stageList');list.replaceChildren();
  for(const step of workflow){
    const li=make('li');
    li.append(make('b',String(step.id).padStart(2,'0')),make('span',step.name));
    list.append(li);
  }
  renderBudgetRows();
  byId('analysisResult').replaceChildren();
  byId('budgetResult').replaceChildren();
  byId('reviewResult').replaceChildren();
  status('제안서 목차가 구성됐습니다. 모든 항목은 비어 있는 초안이며 수치·사실을 자동 생성하지 않았습니다.');
}
byId('generateBtn').addEventListener('click',()=>{
  try{
    const inputTitle=byId('titleInput').value.trim();
    const inputIdea=byId('ideaInput').value.trim();
    // A source-only project is allowed, but source contents are never treated as verified facts.
    const firstSource=sources[0]?.name||'';
    const sourceTitle=firstSource.replace(/^https:\/\//,'').split('/').filter(Boolean).pop()?.replace(/\.(?:txt|md|csv|json|pdf|hwpx|docx|xlsx|pptx)$/i,'')||'참고자료 기반 제안서';
    const title=inputTitle||(!inputIdea&&firstSource?sourceTitle:'');
    project=createProposalDraft({title,idea:inputIdea,domain:byId('domainInput').value,goal:byId('goalInput').value,sourceNames:sources.map(s=>s.name)});
    if(!inputTitle&&title)byId('titleInput').value=project.title;
    project.sources.forEach((row,index)=>{row.excerpt=sources[index]?.excerpt||'';row.readStatus=sources[index]?.kind||'unsupported';});
    draw();byId('editor').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){status(error.message);}
});

function makeBudgetInput(className,type,value='',placeholder=''){
  const input=make('input');input.className=className;input.type=type;
  input.placeholder=placeholder;input.value=String(value??'');
  input.setAttribute('aria-label',placeholder||className);
  if(type==='number'){input.min='0';input.step=className==='budget-quantity'?'0.0001':'1';}
  return input;
}
function appendBudgetRow(values={}){
  const host=byId('budgetRows');
  if(host.children.length>=50)return status('예산 항목은 최대 50건입니다.');
  const row=make('tr');row.className='budget-row';
  const data=[
    makeBudgetInput('budget-name','text',values.name||'','예산 항목명'),
    makeBudgetInput('budget-quantity','number',values.quantity??'','수량'),
    makeBudgetInput('budget-unit','text',values.unit||'식','단위'),
    makeBudgetInput('budget-unitcost','number',values.unitCost??'','단가 원')
  ];
  for(const input of data){
    const td=make('td');td.append(input);row.append(td);
  }
  const td=make('td');const remove=make('button','삭제','remove-budget');remove.type='button';
  remove.addEventListener('click',()=>{row.remove();if(!host.children.length)appendBudgetRow();});
  td.append(remove);row.append(td);host.append(row);
}
function renderBudgetRows(){
  byId('budgetRows').replaceChildren();
  const rows=Array.isArray(project?.budgetRows)?project.budgetRows:[];
  for(const item of rows.slice(0,50))appendBudgetRow(item);
  if(!rows.length)appendBudgetRow();
}
function collectBudgetRows(){
  return Array.from(byId('budgetRows').querySelectorAll('tr')).map(tr=>({
    name:tr.querySelector('.budget-name')?.value.trim().slice(0,120)||'',
    unit:tr.querySelector('.budget-unit')?.value.trim().slice(0,20)||'식',
    quantity:tr.querySelector('.budget-quantity')?.value||'',
    unitCost:tr.querySelector('.budget-unitcost')?.value||''
  })).filter(r=>r.name||r.quantity||r.unitCost);
}
byId('addBudgetRow').addEventListener('click',()=>appendBudgetRow());
function showBudgetSummary(){
  if(!snapshot())return status('먼저 제안서를 생성하세요.');
  const host=byId('budgetResult');host.replaceChildren();
  try{
    const rows=project.budgetRows;
    if(rows.some(row=>row.quantity===''||row.unitCost===''))throw new Error('각 예산 항목의 수량과 단가(0원 포함)를 입력하세요.');
    const calculation=calculateProposalBudget(rows);
    host.append(make('p','사용자 입력 산출 합계: '+calculation.total.toLocaleString('ko-KR')+'원','budget-amount'));
    const detail=make('ul',undefined,'analysis-list');
    for(const item of calculation.items){
      detail.append(make('li',item.name+' · '+item.quantity+item.unit+' × '+item.unitCost.toLocaleString('ko-KR')+'원 = '+item.amount.toLocaleString('ko-KR')+'원'));
    }
    host.append(detail);
    const review=reviewProposalBudget(project);
    for(const warning of review.warnings)host.append(make('p',warning,'muted'));
    if(review.matched)host.append(make('p','입력된 총사업비와 예산 합계가 일치합니다. 실제 견적 여부는 별도 확인이 필요합니다.'));
    status('입력한 예산의 산술 합계를 검증했습니다. 실제 비용은 검증하지 않았습니다.');
    return calculation;
  }catch(error){
    host.append(make('p',error.message));
    status('예산 입력을 확인하세요: '+error.message);
    return null;
  }
}
byId('calculateBudget').addEventListener('click',showBudgetSummary);
byId('applyBudget').addEventListener('click',()=>{
  const result=showBudgetSummary();if(!result)return;
  const field=document.querySelector('[data-decision="totalBudget"]');
  const existing=field.value.trim();
  const existingNumber=parseKrwAmount(existing);
  if(existing&&existingNumber!==result.total)return status('기존 총사업비와 합계가 다릅니다. 수동으로 확인한 뒤 기존 입력값을 변경해 주세요.');
  field.value=result.total.toLocaleString('ko-KR')+'원';
  project.decisions.totalBudget=field.value;
  status('사용자가 계산한 합계를 총사업비 필드에 반영했습니다. 실제 견적·재원 검증은 남아 있습니다.');
});
function showSourceAnalysis(data){
  const host=byId('analysisResult');host.replaceChildren();
  host.append(make('strong','참고자료 '+data.sourceCount+'건 · 출처 확인된 자료 '+data.verifiedCount+'건'));
  const notes=make('ul',undefined,'analysis-list');
  for(const item of data.flags.slice(0,22))notes.append(make('li',item));
  if(data.excerpts.length){
    notes.append(make('li','입력 텍스트에서 발췌된 문장 '+data.excerpts.length+'건(문맥·진위 미검증)'));
    for(const entry of data.excerpts.slice(0,8)){
      notes.append(make('li','['+entry.source+'] '+entry.text));
    }
  }
  host.append(notes);
}
byId('analyzeBtn').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서를 생성하세요.');
  showSourceAnalysis(analyzeProposalSources(project));
  status('브라우저 내 텍스트와 참고자료 등록 상태를 분석했습니다. 인터넷 원문 확인은 수행하지 않았습니다.');
});
byId('scaffoldBtn').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서를 생성하세요.');
  try{
    const prepared=makeGuidedProposalDraft(project);
    project=prepared.draft;draw();showSourceAnalysis(prepared.sourceAnalysis);
    status(prepared.changed+'개 빈 항목에 검토용 작성 가이드를 넣었습니다. 기존 작성 내용은 유지했습니다.');
  }catch(error){status('초안 구성 실패: '+error.message);}
});

byId('reviewBtn').addEventListener('click',()=>{
  if(!snapshot())return;
  const summary=reviewProposalDraft(project);
  const panel=byId('reviewResult');panel.replaceChildren(make('strong',summary.checked));
  const ul=make('ul');for(const item of summary.issues)ul.append(make('li',item));
  panel.append(ul);
  try{
    const budget=reviewProposalBudget(project);
    for(const note of budget.warnings)ul.append(make('li','예산: '+note));
    if(budget.applicable&&budget.matched)panel.append(make('p','예산 합계는 일치합니다. 견적·재원·출처의 사실성은 별도 확인해야 합니다.'));
  }catch(error){ul.append(make('li','예산 계산 오류: '+error.message));}
  if(summary.submissionReady)panel.append(make('p','항목 입력 여부만 확인됨. 원자료와 수치 및 실제 양식은 별도 검증해야 합니다.'));
  status('제출 전 필수항목 및 예산 산술 검토 결과를 표시했습니다.');
});
function download(name,body,mime){
  const blob=new Blob([body],{type:mime});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function basename(){const raw=(project?.title||'proposal').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,45).trim();return raw||'proposal';}
byId('exportMd').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서 구조를 만들어 주세요.');
  download(basename()+'_초안.md',proposalToMarkdownWithBudget(project),'text/markdown;charset=utf-8');
  status('제안서 Markdown 초안을 다운로드했습니다. 최종 제출 문서는 아닙니다.');
});

byId('exportBudget').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서를 생성하세요.');
  try{
    if(project.budgetRows.some(row=>row.quantity===''||row.unitCost===''))throw new Error('모든 예산 항목의 수량·단가 입력이 필요합니다.');
    download(basename()+'_예산.csv',proposalBudgetToCsv(project.budgetRows),'text/csv;charset=utf-8');
    status('입력한 예산 내역을 Excel에서 열 수 있는 CSV로 저장했습니다. 실제 XLSX 파일은 아닙니다.');
  }catch(error){status('예산 CSV 생성 실패: '+error.message);}
});

byId('exportHtml').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서를 생성하세요.');
  try{
    download(basename()+'_검토용인쇄.html',proposalToPrintHtml(project),'text/html;charset=utf-8');
    status('A4 인쇄용 HTML을 저장했습니다. 파일을 브라우저에서 열어 인쇄하면 PDF로 저장할 수 있습니다.');
  }catch(error){status('인쇄본 생성 실패: '+error.message);}
});
byId('exportSlides').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서를 생성하세요.');
  try{
    download(basename()+'_발표구성.md',proposalToPresentationMd(project),'text/markdown;charset=utf-8');
    status('발표 구성 Markdown을 저장했습니다. 실제 PPTX 생성은 아직 지원하지 않습니다.');
  }catch(error){status('발표구성 생성 실패: '+error.message);}
});

byId('exportJson').addEventListener('click',()=>{
  if(!snapshot())return status('먼저 제안서 구조를 만들어 주세요.');
  download(basename()+'_프로젝트.json',JSON.stringify(project,null,2),'application/json;charset=utf-8');
  status('브라우저 작업을 JSON으로 백업했습니다. 서버 저장은 하지 않았습니다.');
});
byId('importInput').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(file.size>1100000)return status('1MB 이하의 프로젝트 백업 파일만 가져올 수 있습니다.');
  try{
    const data=JSON.parse(await file.text());
    if(!validImportedDraft(data))throw new Error('제안서 프로젝트 형식이 아닙니다.');
    project=data;
    byId('titleInput').value=project.title||'';
    byId('ideaInput').value=project.idea||'';
    byId('domainInput').value=PROPOSAL_DOMAINS.some(item=>item.id===project.domain)?project.domain:'auto';
    byId('goalInput').value=PROPOSAL_GOALS.some(item=>item.id===project.goal)?project.goal:'proposal';
    sources=(project.sources||[]).slice(0,20).map(item=>({name:String(item.name||'자료').slice(0,1200),kind:/^https:\/\//.test(String(item.name||''))?'url':'unsupported',excerpt:''}));
    renderSourceList();draw();status('백업 프로젝트를 복구했습니다. 원본 파일 내용은 다시 첨부해야 합니다.');
  }catch(error){status('프로젝트 가져오기 실패: '+error.message);}
});
