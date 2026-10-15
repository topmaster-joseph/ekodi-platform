import {DEFAULT_PORTRAIT} from './portrait.js';

// Client-side authoring only. Never POST document contents, photographs or contact details.
export const DEFAULT_RESUME=Object.freeze({
  name:'정찬균',
  headline:'AI 실무활용 · 디지털전환 · 경영정보시스템(MIS) · 기술수용 · 디지털콘텐츠',
  summary:'경영정보시스템의 기술수용 연구와 현장 디지털전환 프로젝트를 연결하는 연구자이자 실무 기획자. 에코디 플랫폼을 통한 생성형 AI 활용, 업무 오케스트레이션, 디지털콘텐츠 및 지역상권 컨설팅 사례를 대학 교직원의 실용적인 AI 활용 교육으로 전환합니다.',
  education:'국립목포대학교 일반대학원 경영학박사 — 2026.08.20 경영학박사 학위 취득 (국립목포대학교 학위기 확인)\n국립목포대학교 대학원 경영학석사 — 2013.08\n호남신학대학교 교역학석사(M.Div.) — 2020.08\n목포대학교 경영학과 학사 — 2003.02',
  experience:'에코디비즈 대표 · EKODI 플랫폼 및 AI 서비스 구축 기획\n생성형 AI 업무 자동화와 디지털 콘텐츠 개발 실무\n소상공인·지역상권 현장 디지털전환 연구 및 컨설팅',
  research:'Yoon, C., Jeong, C., & Rolland, E. (2015). Understanding individual adoption of mobile instant messaging: A multiple perspectives approach. Information Technology and Management, 16(2), 139–151. DOI: 10.1007/s10799-014-0202-4\n석사학위논문(2013): 모바일 인스턴트 메세징 서비스 수용에 관한 연구\n박사연구: 소상공인의 지능형 서비스로봇 사용의도에 관한 연구 (최종 논문 제목·수여 확인)',
  skills:'정보처리기사 (2005, 증빙 확인 필요)\n사무자동화산업기사 (2004, 증빙 확인 필요)\n전자상거래관리사 2급 (2002, 증빙 확인 필요)\n교직원 대상 프롬프트 설계·행정문서·데이터·연구지원·AI 윤리 교육 설계',
  contact:''
});
export const DEFAULT_SYLLABUS=Object.freeze({
  title:'AI로 바꾸는 대학의 일: 생성형 AI부터 실무 자동화까지',
  audience:'국립목포대학교 교수·직원 등 교직원',
  schedule:'120분 × 4회 × 6세트 = 총 24회 · 48시간. 공통 4회 과정을 여섯 집단에 반복 운영하는 제안안.',
  goals:'AI의 기본 원리와 오류 가능성, 사용자의 책임 이해\n대학 공문·보고서·회의록 및 비식별 데이터 실무 활용\n교수학습·연구·학생지원 AI 활용 시나리오 설계\n자신의 반복업무 1건을 AI 활용 프로세스로 재설계',
  session1:'AI 리터러시와 프롬프트 설계 (120분) — 업무 프롬프트 2종과 검증 체크리스트 완성',
  session2:'대학 행정 문서와 데이터 생산성 (120분) — 비식별 보고서·회의록과 지표 분석표 완성',
  session3:'교수학습·연구·학생지원의 AI (120분) — 직무별 선택 실습 결과물 1건 완성',
  session4:'AI 에이전트와 업무혁신 실행계획 (120분) — 업무 프로세스 카드와 30일 실천계획 완성',
  method:'강의 30% · 시연 20% · 직접 실습 40% · 공유/피드백 10%\n매 회차 도입 10분, 핵심 이론 26분, 시연 24분, 실습 48분, 공유 및 정리 12분.',
  security:'개인정보 및 비공개 시험문항·연구자료·계약자료는 공개형 AI에 입력하지 않음\n대학 승인 계정·서비스와 보안정책을 우선함\nAI 결과의 출처·수치·저작권·공정성은 사람이 검증함\n실제 교육일자·장소·강의료·수료기준은 사업단과 별도 협의'
});
const KEY_LIST={resume:Object.keys(DEFAULT_RESUME),syllabus:Object.keys(DEFAULT_SYLLABUS)};
const LIMITS={resume:3500,syllabus:2400};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const validEmail=value=>/^[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(String(value||''))&&!/[\r\n]/.test(value);
function utf8Base64(value){
  const bytes=new TextEncoder().encode(String(value));let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function listSection(title,body){
  const lines=String(body||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return '<section><h4>'+escapeHtml(title)+'</h4><ul>'+lines.map(x=>'<li>'+escapeHtml(x)+'</li>').join('')+'</ul></section>';
}
export function documentBody(kind,model,portrait){
  if(kind==='resume'){
    return '<div class="paper-top"><div><p class="eyebrow">INSTRUCTOR CURRICULUM VITAE</p><h3>'+escapeHtml(model.name)+'</h3><p class="meta">'+escapeHtml(model.headline)+'</p></div><img src="'+portrait+'" alt="강사 증명사진"></div>'+
      '<h4>전문 소개</h4><p>'+escapeHtml(model.summary)+'</p>'+listSection('학력',model.education)+listSection('주요 경력 및 프로젝트',model.experience)+listSection('연구 및 논문',model.research)+listSection('자격 및 교육 역량',model.skills)+
      (model.contact?'<h4>제출용 연락처</h4><p>'+escapeHtml(model.contact)+'</p>':'')+'<p class="small">자격증·경력 실적은 제출 전에 최종 증빙을 확인해야 합니다.</p>';
  }
  return '<p class="eyebrow">AI BOOTCAMP · TEACHING PROPOSAL</p><h3>'+escapeHtml(model.title)+'</h3><p class="meta">'+escapeHtml(model.audience)+'</p><p class="banner">'+escapeHtml(model.schedule)+'</p>'+
    listSection('교육 목표',model.goals)+listSection('1회차',model.session1)+listSection('2회차',model.session2)+listSection('3회차',model.session3)+listSection('4회차',model.session4)+listSection('교수학습 방법',model.method)+listSection('윤리 · 보안 · 운영',model.security)+
    '<p class="small">본 문서는 AI부트캠프사업단에 제출하는 교육 제안안입니다. 사업단의 확정 교육일정이 아닙니다.</p>';
}
export function documentHtml(kind,model,portrait){
  const title=kind==='resume'?'강사 이력서':'AI 교육 강의계획서';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'+
    '<style>body{font-family:"Malgun Gothic",sans-serif;color:#23384b;max-width:760px;margin:35px auto;padding:20px;line-height:1.7}h3{font-size:26px}h4{font-size:14px;color:#9b7b47;border-bottom:1px solid #ddd}p,li{font-size:13px;white-space:pre-wrap}ul{padding-left:22px}.paper-top{display:flex;justify-content:space-between;gap:22px;border-bottom:2px solid #244159}.paper-top img{width:110px;height:135px;object-fit:cover;object-position:top}.meta{color:#60707a}.eyebrow{font-size:10px;letter-spacing:2px;color:#98764a}.banner{padding:12px;background:#f2f3ef}.small{font-size:10px;color:#70695c}@page{size:A4;margin:15mm}</style></head><body>'+
    documentBody(kind,model,portrait)+'</body></html>';
}
const MIME_BOUNDARY='EKODI_DOCUMENT_'+Date.now().toString(36);
export function makeEmailDraft({kind,model,portrait,to,subject,message}){
  if(!validEmail(to))throw new Error('올바른 수신자 이메일 한 개를 입력하세요.');
  if(!subject||/[\r\n]/.test(subject))throw new Error('유효한 이메일 제목을 입력하세요.');
  const hasPhoto=kind==='resume'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(portrait);
  let html=documentHtml(kind,model,hasPhoto?portrait:'');
  if(hasPhoto)html=html.replace('src="'+portrait+'"','src="cid:ekodi-instructor-photo"');
  const name=kind==='resume'?'EKODI_Instructor_Resume.html':'EKODI_AI_Bootcamp_Syllabus.html';
  const boundary=MIME_BOUNDARY;
  const alternative=boundary+'_ALT';
  const headers=['To: '+to,'Subject: =?UTF-8?B?'+utf8Base64(subject)+'?=','MIME-Version: 1.0','Date: '+new Date().toUTCString(),'Content-Type: multipart/mixed; boundary="'+boundary+'"','','This is a multipart MIME message.'];
  const part=(marker,contentType,encoding,data,extra=[])=>['--'+marker,'Content-Type: '+contentType,'Content-Transfer-Encoding: '+encoding,...extra,'',data].join('\r\n');
  const wrap=b64=>b64.match(/.{1,76}/g)?.join('\r\n')||'';
  const body=[
    '--'+boundary,
    'Content-Type: multipart/alternative; boundary="'+alternative+'"',
    '',
    part(alternative,'text/plain; charset=UTF-8','base64',wrap(utf8Base64(message||'AI 부트캠프 교육 제안자료를 첨부합니다.'))),
    part(alternative,'text/html; charset=UTF-8','base64',wrap(utf8Base64(html))),
    '--'+alternative+'--',
    part(boundary,'text/html; name="'+name+'"','base64',wrap(utf8Base64(documentHtml(kind,model,portrait))),['Content-Disposition: attachment; filename="'+name+'"'])
  ];
  if(hasPhoto)body.push(part(boundary,'image/jpeg; name="instructor-photo.jpg"','base64',wrap(portrait.split(',')[1]),['Content-ID: <ekodi-instructor-photo>','Content-Disposition: inline; filename="instructor-photo.jpg"']));
  return [...headers,...body,'--'+boundary+'--',''].join('\r\n');
}
function saveFile(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function boot(){
  const $=id=>document.getElementById(id);
  const state={resume:{...DEFAULT_RESUME},syllabus:{...DEFAULT_SYLLABUS},portrait:DEFAULT_PORTRAIT,doc:new URLSearchParams(location.search).get('doc')==='syllabus'?'syllabus':'resume'};
  const status=(id,value)=>{$(id).textContent=value;};
  function render(){
    const d=state.doc;
    $('resumeEditor').hidden=d!=='resume';$('syllabusEditor').hidden=d!=='syllabus';
    for(const b of document.querySelectorAll('[data-doc]')){const selected=b.dataset.doc===d;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));}
    $('editTitle').textContent=d==='resume'?'강사 이력서 편집':'강의계획서 편집';
    $('previewHeading').textContent=d==='resume'?'이력서 미리보기':'강의계획서 미리보기';
    $('documentPreview').innerHTML=documentBody(d,state[d],state.portrait);
    $('portraitEditor').src=state.portrait;
    for(const input of document.querySelectorAll('[data-'+d+']'))input.value=state[d][input.getAttribute('data-'+d)]||'';
    $('mailSubject').value=d==='resume'?'AI 부트캠프 강사 이력서 제출 — '+state.resume.name:'AI 부트캠프 강의계획서 제출';
    $('makeEml').textContent=d==='resume'?'증명사진 포함 이메일 초안 (.eml)':'강의계획서 이메일 초안 (.eml)';
    $('mailReview').checked=false;enableMail();
  }
  function enableMail(){
    const enabled=validEmail($('recipient').value)&&Boolean($('mailReview').checked)&&Boolean($('mailSubject').value.trim());
    $('makeEml').disabled=!enabled;$('openMail').disabled=!enabled;
  }
  for(const el of document.querySelectorAll('[data-resume],[data-syllabus]'))el.addEventListener('input',()=>{
    const type=el.hasAttribute('data-resume')?'resume':'syllabus';const key=el.getAttribute('data-'+type);
    state[type][key]=el.value.slice(0,Math.min(LIMITS[type],Number(el.maxLength)>0?Number(el.maxLength):LIMITS[type]));
    if(type===state.doc){$('documentPreview').innerHTML=documentBody(type,state[type],state.portrait);}
    $('mailReview').checked=false;enableMail();
    status('editorStatus','편집 중 · 현재 브라우저에만 반영되었습니다. 백업 JSON으로 보관하세요.');
  });
  for(const b of document.querySelectorAll('[data-doc]'))b.addEventListener('click',()=>{
    state.doc=b.dataset.doc;history.replaceState(null,'','?doc='+state.doc);render();status('editorStatus','');
  });
  $('photoInput').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024){status('editorStatus','사진은 JPG·PNG·WebP 3MB 이하만 사용할 수 있습니다.');return;}
    try{
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let encoded=canvas.toDataURL('image/jpeg',.80);
      if(encoded.length>800000){canvas.width=Math.max(1,Math.round(canvas.width*.65));canvas.height=Math.max(1,Math.round(canvas.height*.65));ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);encoded=canvas.toDataURL('image/jpeg',.68);}
      bitmap.close();
      if(encoded.length>800000)throw Error('사진 파일이 너무 큽니다.');
      state.portrait=encoded;render();
      status('editorStatus','사진 교체 완료 · 서버로 전송하지 않았습니다. JSON을 백업해 두세요.');
    }catch{status('editorStatus','선택한 이미지를 처리하지 못했습니다.');}
  });
  $('restorePhoto').addEventListener('click',()=>{state.portrait=DEFAULT_PORTRAIT;render();status('editorStatus','구글드라이브 원본 증명사진을 복원했습니다.');});
  $('exportJson').addEventListener('click',()=>{
    saveFile('EKODI_AI_Bootcamp_documents_draft.json',JSON.stringify({schema:'ekodi-bootcamp-documents-v1',resume:state.resume,syllabus:state.syllabus,portrait:state.portrait},null,2),'application/json');
    status('editorStatus','이력서·강의계획서·사진이 포함된 JSON 초안을 내려받았습니다. 외부 공유에 유의하세요.');
  });
  $('importJson').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>900000||!file.name.toLowerCase().endsWith('.json')){status('editorStatus','900KB 이하의 JSON 백업만 불러올 수 있습니다.');return;}
    try{
      const data=JSON.parse(await file.text());if(data.schema!=='ekodi-bootcamp-documents-v1')throw Error('지원하지 않는 백업 버전');
      const checked={};
      for(const type of ['resume','syllabus']){
        if(!data[type]||typeof data[type]!=='object')throw Error('문서 필드가 없습니다');
        const next={};
        for(const key of KEY_LIST[type]){
          if(typeof data[type][key]!=='string'||data[type][key].length>LIMITS[type])throw Error(key+' 필드 형식 오류');
          next[key]=data[type][key];
        }
        checked[type]=next;
      }
      if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]{100,800000}$/.test(data.portrait))throw Error('사진 형식 오류');
      state.resume=checked.resume;state.syllabus=checked.syllabus;state.portrait=data.portrait;render();status('editorStatus','JSON 백업을 불러왔습니다. 개인정보와 사실관계를 검토하세요.');
    }catch(err){status('editorStatus','불러오기 실패: '+err.message);}
  });
  $('resetDoc').addEventListener('click',()=>{
    if(!confirm('현재 문서의 수정사항을 초기화할까요?'))return;
    const d=state.doc;state[d]={...(d==='resume'?DEFAULT_RESUME:DEFAULT_SYLLABUS)};
    if(d==='resume')state.portrait=DEFAULT_PORTRAIT;
    render();status('editorStatus','현재 문서의 기본 내용을 복원했습니다.');
  });
  $('printDoc').addEventListener('click',()=>window.print());
  $('downloadHtml').addEventListener('click',()=>{
    saveFile(state.doc==='resume'?'EKODI_Instructor_Resume.html':'EKODI_AI_Bootcamp_Syllabus.html',
      documentHtml(state.doc,state[state.doc],state.portrait),'text/html;charset=utf-8');
    status('editorStatus','현재 문서를 HTML로 내려받았습니다. PDF가 필요하면 인쇄 → PDF 저장을 사용하세요.');
  });
  for(const id of ['recipient','mailSubject','mailMessage'])$(id).addEventListener('input',()=>{$('mailReview').checked=false;enableMail();});
  $('mailReview').addEventListener('change',enableMail);
  $('makeEml').addEventListener('click',()=>{
    if($('makeEml').disabled)return;
    try{
      const mail=makeEmailDraft({kind:state.doc,model:state[state.doc],portrait:state.portrait,to:$('recipient').value.trim(),subject:$('mailSubject').value.trim(),message:$('mailMessage').value});
      saveFile(state.doc==='resume'?'EKODI_Instructor_Resume_Email_Draft.eml':'EKODI_AI_Bootcamp_Syllabus_Email_Draft.eml',mail,'message/rfc822');
      status('mailStatus','이메일 초안을 저장했습니다. 메일 앱에서 열어 첨부 내용을 확인한 후 직접 보내세요. 아직 발송되지 않았습니다.');
      $('mailReview').checked=false;enableMail();
    }catch(err){status('mailStatus',err.message);}
  });
  $('openMail').addEventListener('click',()=>{
    if($('openMail').disabled)return;
    const to=$('recipient').value.trim();
    if(!validEmail(to))return;
    const content=$('mailMessage').value+'\n\n첨부 문서는 문서 저장 버튼으로 내려받아 직접 첨부해 주세요.';
    const url='mailto:'+encodeURIComponent(to)+'?subject='+encodeURIComponent($('mailSubject').value)+'&body='+encodeURIComponent(content);
    location.href=url;
    status('mailStatus','기본 메일 앱 열기를 요청했습니다. 첨부파일은 직접 추가하고 발송을 확인하세요.');
    $('mailReview').checked=false;enableMail();
  });
  $('mailMessage').value='안녕하세요.\n국립목포대학교 AI 부트캠프 교직원 교육 관련 제출자료를 보내드립니다.\n확인 부탁드립니다.';
  render();
}
if(typeof document!=='undefined')boot();
