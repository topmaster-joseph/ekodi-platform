import {ITEMS,STATUSES,blankRecord,sanitizeRecord,evaluate,csvForRecord} from './model.js';
const $=id=>document.getElementById(id);
const STORAGE_PREFIX='ekodi-management-daily-self-check:20261112:';
let savedComplete=false;
let savedAt=null;
function koreanDate(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const field=type=>parts.find(part=>part.type===type)?.value||'';
 return [field('year'),field('month'),field('day')].join('-');
}
function key(){return STORAGE_PREFIX+encodeURIComponent($('business').value.trim())+':'+$('day').value;}
function show(message,error=false){$('feedback').textContent=message;$('feedback').style.color=error?'#a03030':'#245a3d';}
function renderChecklist(){
 const groups=[...new Set(ITEMS.map(item=>item.section))];
 const target=$('checkSections');target.replaceChildren();
 for(const group of groups){
   const section=document.createElement('section');section.className='panel';
   const title=document.createElement('h2');title.textContent=group;section.append(title);
   const list=document.createElement('div');list.className='check-list';
   for(const item of ITEMS.filter(item=>item.section===group)){
     const fieldset=document.createElement('fieldset');fieldset.className='check';fieldset.id='row-'+item.id;fieldset.dataset.result='';
     const legend=document.createElement('legend');legend.textContent=item.label;fieldset.append(legend);
     if(item.help){const help=document.createElement('p');help.className='help';help.textContent=item.help;fieldset.append(help);}
     const choices=document.createElement('div');choices.className='choices';choices.setAttribute('role','group');choices.setAttribute('aria-label',item.label+' 결과');
     for(const status of STATUSES){
       const label=document.createElement('label'),radio=document.createElement('input');
       radio.type='radio';radio.name='result-'+item.id;radio.value=status.value;radio.setAttribute('aria-label',status.label);
       label.append(radio,document.createTextNode(status.label));choices.append(label);
       radio.addEventListener('change',()=>{fieldset.dataset.result=radio.value;touch();});
     }
     fieldset.append(choices);
     const note=document.createElement('textarea');note.id='note-'+item.id;note.maxLength=500;note.rows=2;note.setAttribute('aria-label',item.label+' 조치·비고');note.placeholder='조치·비고 (조치필요인 경우 반드시 입력)';
     note.addEventListener('input',touch);fieldset.append(note);
     list.append(fieldset);
   }
   section.append(list);target.append(section);
 }
}
function snapshot(){
 const business=$('business').value.trim(),date=$('day').value;
 const record=blankRecord(business,date);record.checker=$('checker').value.trim().slice(0,60);
 for(const item of ITEMS){
   const selected=document.querySelector('input[name="result-'+item.id+'"]:checked');
   record.rows[item.id]={status:selected?.value||'',note:$('note-'+item.id).value.trim().slice(0,500)};
 }
 record.complete=savedComplete;record.savedAt=savedAt;
 return record;
}
function updateStatus(dirty=false){
 const check=evaluate(snapshot());
 $('progress').textContent=check.checked+' / '+check.total+'개 점검 · 조치필요 '+check.issues.length+'건';
 $('status').textContent=dirty?'미저장 변경사항 있음':savedComplete?'이 날짜의 완료 기록':savedAt?'임시저장 기록':'점검 후 저장하세요';
 const note=$('changeNotice');note.classList.toggle('change-alert',check.changeIssues.length>0);
 if(check.changeIssues.length)note.querySelector('h2').textContent='변경 관련 이상 '+check.changeIssues.length+'건 · 별도 신고 확인';
 else note.querySelector('h2').textContent='면적·시설 등 변경 발생 시';
}
function touch(){savedComplete=false;updateStatus(true);}
function fill(record){
 $('checker').value=record.checker||'';
 for(const item of ITEMS){
   const row=record.rows[item.id];const fieldset=$('row-'+item.id);
   for(const input of fieldset.querySelectorAll('input[type=radio]'))input.checked=input.value===row.status;
   fieldset.dataset.result=row.status;
   $('note-'+item.id).value=row.note;
 }
 savedComplete=Boolean(record.complete);savedAt=record.savedAt;updateStatus(false);
}
function load(){
 const business=$('business').value.trim(),date=$('day').value;
 if(!business||!date){show('사업장과 날짜를 입력해 주세요.',true);return;}
 let raw=null;
 try{const stored=localStorage.getItem(key());raw=stored?JSON.parse(stored):null;}
 catch{show('브라우저 저장공간을 읽을 수 없습니다. 입력 후 CSV로 별도 보관하세요.',true);}
 fill(sanitizeRecord(raw,business,date));
 if(raw)show('선택한 날짜의 브라우저 저장 기록을 불러왔습니다.');
 else show('새 점검표입니다. 입력 후 저장하세요.');
}
function save(completed){
 const record=snapshot();
 if(!record.business||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(record.date)){show('사업장과 점검일을 확인해 주세요.',true);return;}
 const state=evaluate(record);
 if(completed&&!state.canComplete){
   show('미점검 '+state.missing.length+'건, 조치내용 미기록 '+state.undocumented.length+'건을 먼저 확인해 주세요.',true);return;
 }
 record.complete=Boolean(completed);record.savedAt=new Date().toISOString();
 try{localStorage.setItem(key(),JSON.stringify(record));}
 catch{show('저장에 실패했습니다. CSV를 내려받아 보관하세요.',true);return;}
 savedComplete=record.complete;savedAt=record.savedAt;updateStatus(false);
 if(state.changeIssues.length)show((completed?'점검을 완료했습니다. ':'임시저장했습니다. ')+'변경 관련 조치필요 '+state.changeIssues.length+'건: 행정신고 여부를 반드시 별도로 확인하세요.');
 else show(completed?'일일 자율점검 기록을 이 브라우저에 저장했습니다.':'임시저장했습니다. 저장 기록은 이 브라우저에만 남습니다.');
}
function exportCsv(){
 const record=snapshot();if(!record.business||!record.date){show('사업장과 날짜를 입력해 주세요.',true);return;}
 const blob=new Blob([csvForRecord(record)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='사업장자율점검_'+record.date+'.csv';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 show('현재 입력 내용을 CSV로 내려받았습니다. 이 파일 자체는 행정기관 접수증이 아닙니다.');
}
$('day').value=koreanDate();
renderChecklist();
$('business').addEventListener('change',load);$('day').addEventListener('change',load);
$('checker').addEventListener('input',touch);
$('save').addEventListener('click',()=>save(false));
$('complete').addEventListener('click',()=>save(true));
$('export').addEventListener('click',exportCsv);
$('print').addEventListener('click',()=>window.print());
load();