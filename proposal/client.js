import {PROPOSAL_DOMAINS,PROPOSAL_GOALS,createProposalDraft,selectedStages,reviewProposalDraft,draftToMarkdown,validImportedDraft} from './core.js';
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
  let parsed;
  try{parsed=new URL(raw);}catch{return status('올바른 웹주소를 입력하세요.');}
  if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password){
    return status('개인정보 보호를 위해 사용자정보 없는 HTTPS 주소만 등록할 수 있습니다.');
  }
  if(sources.length>=20)return status('프로젝트당 자료는 최대 20개까지만 등록할 수 있습니다.');
  const safe=parsed.toString();
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
byId('reviewBtn').addEventListener('click',()=>{
  if(!snapshot())return;
  const summary=reviewProposalDraft(project);
  const panel=byId('reviewResult');panel.replaceChildren(make('strong',summary.checked));
  const ul=make('ul');for(const item of summary.issues)ul.append(make('li',item));
  panel.append(ul);
  if(summary.submissionReady)panel.append(make('p','항목 입력 여부만 확인됨. 원자료와 수치 및 실제 양식은 별도 검증해야 합니다.'));
  status(summary.issues.length+'개 항목의 검토 사항을 확인했습니다.');
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
  download(basename()+'_초안.md',draftToMarkdown(project),'text/markdown;charset=utf-8');
  status('제안서 Markdown 초안을 다운로드했습니다. 최종 제출 문서는 아닙니다.');
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
