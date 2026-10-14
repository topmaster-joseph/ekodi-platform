import {COURSE} from '../catalog.js';
import {
  MATERIAL_SCHEMA,LESSON_FIELDS,LESSON_LIST_FIELDS,
  buildLessonDraft,validateLessonDraft,updateDraftField,
  sourceToDraft,readMaterialFile,assessDraft,serializeDraft,detectContentWarnings,
} from '../material-source.js';

const $=selector=>document.querySelector(selector);
const all=selector=>Array.from(document.querySelectorAll(selector));
const drafts=new Map();
const key=(lesson,batch)=>String(lesson)+':'+String(batch);
let lessonId=1,batchId='A',draft=null,previewTab='lecture',editorTab='lecture',incoming=null;
const safeText=value=>String(value??'');
const status=(message)=>{$('#sourceState').textContent=message;};
function currentDraft(){
  const id=key(lessonId,batchId);
  if(!drafts.has(id))drafts.set(id,buildLessonDraft(COURSE,lessonId,batchId));
  return drafts.get(id);
}
function saveDraft(next){
  draft=next;drafts.set(key(lessonId,batchId),next);
  $('#reviewConfirm').checked=false;
  drawReview();
  renderPreview();
}
function valueOf(field){
  const value=draft.fields[field];
  return Array.isArray(value)?value.join('\n'):safeText(value);
}
function fillEditors(){
  all('[data-field]').forEach(field=>{
    if(!LESSON_FIELDS.includes(field.dataset.field))return;
    field.value=valueOf(field.dataset.field);
  });
}
function updateSelection(){
  lessonId=Number($('#studioLesson').value);
  batchId=$('#studioBatch').value;
  draft=currentDraft();
  $('#reviewConfirm').checked=false;
  fillEditors();drawReview();renderPreview();
  status('회차·세트별 기기 내 초안으로 전환했습니다. 저장하지 않은 작업은 브라우저를 닫으면 사라집니다.');
}
function drawReview(){
  const result=assessDraft(draft,COURSE);
  const review=$('#reviewIssues');review.replaceChildren();
  if(result.issues.length){
    const title=document.createElement('strong');title.textContent='검토 필요 · '+result.issues.length+'개 항목';review.append(title);
    const ul=document.createElement('ul');
    for(const item of result.issues){const li=document.createElement('li');li.textContent=item;ul.append(li);}
    review.append(ul);
  }else review.textContent='기본 내용 형식과 필수 항목을 확인했습니다. 사실·출처·저작권·개인정보 검토는 사람이 수행해야 합니다.';
  const permitted=result.readyForReview&&$('#reviewConfirm').checked;
  $('#exportDraft').disabled=!permitted;
  $('#studioState').textContent=permitted?'검토 확인 · 내보내기 가능':result.issues.length?'검토 항목 확인 필요':'기기 내 초안 · 미공개';
}
const append=(parent,tag,text,className='')=>{
  const el=document.createElement(tag);el.textContent=safeText(text);
  if(className)el.className=className;
  parent.append(el);return el;
};
function list(parent,items,ordered=false){
  const el=document.createElement(ordered?'ol':'ul');
  for(const item of items)append(el,'li',item);
  parent.append(el);
}
function section(parent,title,value,{ordered=false,box=false}={}){
  append(parent,'h4',title);
  if(Array.isArray(value))list(parent,value,ordered);
  else append(parent,'p',value,box?'previewbox':'');
}
function previewSlides(){
  const f=draft.fields;
  return [
    ['OPENING',f.title,[f.sub,f.question]],
    ['LEARNING OBJECTIVES','이번 회차의 목표',f.objectives],
    ['KEY IDEAS','핵심 개념',f.concepts],
    ['DEMONSTRATION','강사 시연',f.demo],
    ['CASE STUDY · FICTIONAL','가상 실습 자료',[f.sample]],
    ['PROMPT','함께 작성하는 지시문',[f.prompt]],
    ['HANDS ON','실습 진행',f.steps],
    ['VALIDATION','AI 결과 검증',f.verify],
    ['WRAP UP','결과물과 현업 적용',[f.outcome,f.reflection]],
  ];
}
function renderPreview(){
  const pane=$('#localPreview');pane.replaceChildren();
  all('[data-preview-tab]').forEach(b=>{
    const selected=b.dataset.previewTab===previewTab;
    b.classList.toggle('selected',selected);
    b.setAttribute('aria-selected',String(selected));
  });
  append(pane,'span','LECTURE '+String(lessonId).padStart(2,'0')+' · COHORT '+batchId,'kicker');
  const f=draft.fields;
  if(previewTab==='lecture'){
    append(pane,'h3',f.title);
    append(pane,'p',f.sub);
    section(pane,'핵심 질문',f.question);
    section(pane,'학습목표',f.objectives);
    section(pane,'강의 핵심 내용',f.concepts);
    section(pane,'강사 시연',f.demo,{ordered:true});
    section(pane,'회차 산출물',f.outcome,{box:true});
  }else if(previewTab==='practice'){
    append(pane,'h3',f.practice);
    section(pane,'실습 자료 · 확인 필요',f.sample,{box:true});
    section(pane,'실습 프롬프트',f.prompt,{box:true});
    section(pane,'직접 해보기',f.steps,{ordered:true});
    section(pane,'결과 검증',f.verify);
    section(pane,'대체 실습',f.offline);
  }else{
    append(pane,'h3','9장 발표 화면 구성');
    previewSlides().forEach(([k,title,body],index)=>{
      const slide=append(pane,'section','','slidecard');
      append(slide,'small',String(index+1).padStart(2,'0')+' / 09　'+k);
      append(slide,'strong',title);
      list(slide,body);
    });
  }
}
function renderSourceList(){
  const el=$('#sourceList');el.replaceChildren();
  for(const item of draft.sources)append(el,'span',item.name+' · '+item.format.toUpperCase()+' · '+Math.round(item.size/1024)+' KB');
}
async function selectMaterial(file){
  incoming=null;
  $('#sourceExtracted').value='';
  if(!file)return;
  status('브라우저 안에서 자료를 읽고 있습니다. 서버에 저장하지 않습니다.');
  try{
    const material=await readMaterialFile(file);
    incoming={name:material.filename,format:material.extension,size:material.size};
    $('#sourceExtracted').value=material.text;
    const truncated=material.text.length>=12000?' · 길이가 제한되어 앞부분만 표시했습니다.':'';
    if(material.warnings.length)status('개인정보·민감정보 의심 표현: '+material.warnings.join(', ')+' · 반드시 제거 후 반영하세요.'+truncated);
    else status('텍스트 추출 완료: '+material.filename+' · 대상 필드와 문장을 검토한 뒤 반영하세요.'+truncated);
  }catch(error){status('자료를 읽지 못했습니다: '+error.message);}
}
function applySource(){
  const content=$('#sourceExtracted').value.trim();
  if(!content){status('먼저 자료를 선택하거나 추출 내용을 입력하세요.');return;}
  const warnings=detectContentWarnings(content);
  if(warnings.length){
    status('자동 반영 차단: '+warnings.join(', ')+' 표현이 포함되어 있습니다. 해당 부분을 제거한 후 다시 반영하세요.');
    return;
  }
  try{
    const next=sourceToDraft(draft,content,$('#sourceTarget').value,$('#sourceMode').value);
    if(incoming&&!next.sources.some(x=>x.name===incoming.name&&x.size===incoming.size))
      next.sources=[...next.sources,incoming].slice(0,12);
    saveDraft(next);fillEditors();renderSourceList();
    status('기기 내 초안의 '+$('#sourceTarget').selectedOptions[0].textContent+' 필드에 반영했습니다. 실제 강의 사이트에는 게시되지 않았습니다.');
  }catch(error){status(error.message);}
}
async function loadDraftFile(file){
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.json')||file.size>300000){status('유효한 JSON 교안 초안 파일(300KB 이내)을 선택하세요.');return;}
  try{
    const parsed=JSON.parse(await file.text());
    if(parsed.schema!==MATERIAL_SCHEMA)throw new Error('교안 전용 JSON 초안이 아닙니다.');
    const imported=validateLessonDraft(parsed,COURSE);
    lessonId=imported.lessonId;batchId=imported.batchId;
    $('#studioLesson').value=String(lessonId);$('#studioBatch').value=batchId;
    saveDraft(imported);fillEditors();renderSourceList();
    status('JSON 초안을 기기 내 편집 화면으로 다시 불러왔습니다. 승인·공개 상태는 포함되지 않습니다.');
  }catch(error){status('JSON 파일을 열지 못했습니다: '+error.message);}
}
function exportDraft(){
  const report=assessDraft(draft,COURSE);
  if(!report.readyForReview||!$('#reviewConfirm').checked){drawReview();return;}
  const serialized=serializeDraft(draft,COURSE);
  const url=URL.createObjectURL(new Blob([serialized],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download='EKODI_AI_Bootcamp_L'+lessonId+'_Set'+batchId+'_draft.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('검토용 JSON 초안을 내려받았습니다. 실제 강의실 콘텐츠는 변경되지 않았습니다.');
}
all('[data-field]').forEach(field=>{
  field.addEventListener('input',()=>{
    try{saveDraft(updateDraftField(draft,field.dataset.field,field.value));}
    catch(error){status(error.message);}
  });
});
$('#studioLesson').addEventListener('change',updateSelection);
$('#studioBatch').addEventListener('change',updateSelection);
$('#materialFile').addEventListener('change',event=>{
  void selectMaterial(event.target.files?.[0]);
  event.target.value='';
});
$('#applySource').addEventListener('click',applySource);
$('#clearSource').addEventListener('click',()=>{$('#sourceExtracted').value='';incoming=null;status('임시 추출 내용을 비웠습니다.');});
$('#draftFile').addEventListener('change',event=>{
  void loadDraftFile(event.target.files?.[0]);
  event.target.value='';
});
$('#reviewConfirm').addEventListener('change',drawReview);
$('#exportDraft').addEventListener('click',exportDraft);
$('#resetDraft').addEventListener('click',()=>{
  if(!window.confirm('현재 회차·세트의 기기 내 수정사항을 버리고 원본 강의안을 복원할까요?'))return;
  saveDraft(buildLessonDraft(COURSE,lessonId,batchId));fillEditors();renderSourceList();
  status('해당 회차의 원본 강의안을 복원했습니다. 서버 작업은 수행하지 않았습니다.');
});
all('[data-editor-tab]').forEach(button=>button.addEventListener('click',()=>{
  editorTab=button.dataset.editorTab;
  $('#lectureFields').hidden=editorTab!=='lecture';$('#practiceFields').hidden=editorTab!=='practice';
  all('[data-editor-tab]').forEach(item=>{
    const selected=item===button;item.classList.toggle('selected',selected);
    item.setAttribute('aria-selected',String(selected));
  });
}));
all('[data-preview-tab]').forEach(button=>button.addEventListener('click',()=>{
  previewTab=button.dataset.previewTab;renderPreview();
}));
let presentingIndex=0;
let presentingSlides=[];
function drawPresentingSlide(){
  const slide=presentingSlides[presentingIndex];
  if(!slide)return;
  const [k,title,bulletTexts]=slide;
  $('#studioSlideCounter').textContent=String(presentingIndex+1).padStart(2,'0')+' / 09';
  $('#studioSlideEyebrow').textContent=k;
  $('#studioSlideTitle').textContent=title;
  $('#studioSlideBody').textContent='';
  const bullets=$('#studioSlideBullets');bullets.replaceChildren();
  for(const item of bulletTexts||[])if(item)append(bullets,'li',item);
  $('#studioSlidePrev').disabled=presentingIndex===0;
  $('#studioSlideNext').disabled=presentingIndex===presentingSlides.length-1;
}
$('#presentDraft').addEventListener('click',()=>{
  presentingSlides=previewSlides().map(row=>[row[0],row[1],[...row[2]]]);
  presentingIndex=0;
  $('#studioPresentation').showModal();
  drawPresentingSlide();
});
$('#studioSlideClose').addEventListener('click',()=>$('#studioPresentation').close());
$('#studioSlidePrev').addEventListener('click',()=>{
  if(presentingIndex>0){presentingIndex--;drawPresentingSlide();}
});
$('#studioSlideNext').addEventListener('click',()=>{
  if(presentingIndex<presentingSlides.length-1){presentingIndex++;drawPresentingSlide();}
});
document.addEventListener('keydown',event=>{
  if(!$('#studioPresentation').open)return;
  if(event.key==='ArrowRight'||event.key==='PageDown'){
    event.preventDefault();
    if(presentingIndex<presentingSlides.length-1){presentingIndex++;drawPresentingSlide();}
  }else if(event.key==='ArrowLeft'||event.key==='PageUp'){
    event.preventDefault();
    if(presentingIndex>0){presentingIndex--;drawPresentingSlide();}
  }
});
draft=currentDraft();
fillEditors();drawReview();renderPreview();renderSourceList();
