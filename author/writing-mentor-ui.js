// Personal writing guidance for all signed-in authors.
// No unapproved AI, checkout, cross-tenant reads or automatic publication.
import { MENTOR_FIELDS, MENTOR_STAGES, resolveMentorField, writingMentorStep, privateMentorNotebook } from './writing-mentor.js';

function element(tag,text,cls){
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  if(cls)node.className=cls;
  return node;
}
function button(title,fn){
  const b=element('button',title);b.type='button';b.addEventListener('click',fn);return b;
}
export function openWritingMentor({session,project}={}){
  if(!session?.user?.id||!project?.id||project?.owner_user_id!==session.user.id||project?.creator_mode!=='writer')return false;
  const title=project.working_title||project.title||'제목 미정';
  const values=Object.create(null);
  let index=0,field=resolveMentorField(project.field),exported=false;
  let lastFocused=document.activeElement;
  const backdrop=element('div',null,'dialog-backdrop');
  const dialog=element('section',null,'dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','나의 집필 멘토');
  const heading=element('h2','분야별 집필 멘토');
  const description=element('p','모든 회원 무료 · 저자의 생각에서 출발하는 단계별 질문 · 별도 AI 호출과 결제 없음','notice');
  const sub=element('p',title,'notice');
  const category=element('label','집필 분야');
  const selector=element('select');
  selector.setAttribute('aria-label','집필 분야 선택');
  for(const [key,label] of MENTOR_FIELDS){
    const option=element('option',label);option.value=key;selector.append(option);
  }
  selector.value=field;category.append(selector);
  const panel=element('div'),message=element('p','');
  message.setAttribute('role','status');
  function snapshot(){
    return privateMentorNotebook({title,field,answers:values});
  }
  function hasNotes(){return snapshot().answered>0;}
  function close(){
    if(hasNotes()&&!exported&&!window.confirm('작성한 메모는 서버에 자동 저장되지 않습니다. 파일로 보관하지 않고 닫으시겠습니까?'))return;
    backdrop.remove();lastFocused?.focus?.();
  }
  const x=button('닫기',close);x.className='ghost close';
  const notice=element('p','기존 Creator AI 프로젝트의 장별 원고는 그대로 유지됩니다. 이 화면의 메모는 브라우저 임시 메모이며 직접 다운로드한 파일만 개인소장용으로 남습니다. 판매등록·출판 승인 기능은 제공하지 않습니다.','notice');
  dialog.append(x,heading,description,sub,category,panel,message,notice);
  backdrop.append(dialog);document.body.append(backdrop);
  function render(){
    panel.replaceChildren();
    const [id]=MENTOR_STAGES[index];
    const view=writingMentorStep({field,stage:id});
    const count=element('p',`${index+1} / ${MENTOR_STAGES.length}단계 · ${view.stageLabel}`,'notice');
    const question=element('h3',view.question);
    const lens=element('p','분야별 전문가 관점: '+view.expertLens);
    const tip=element('p','집필 안내: '+view.practice);
    const answer=element('textarea');
    answer.value=values[id]||'';answer.rows=6;answer.maxLength=10000;
    answer.style.width='100%';answer.style.lineHeight='1.8';
    answer.setAttribute('aria-label',view.stageLabel+'에 대한 개인 집필 메모');
    answer.addEventListener('input',()=>{
      values[id]=answer.value;exported=false;
      message.textContent='작성 내용은 임시 메모입니다. 개인소장 파일로 내려받아 보관할 수 있습니다.';
    });
    const prev=button('이전 단계',()=>{index--;render();});prev.disabled=index===0;
    const next=button('다음 단계',()=>{index++;render();});next.disabled=index===MENTOR_STAGES.length-1;
    const download=button('개인 집필 노트 내려받기 (.md)',()=>{
      const doc=snapshot();
      if(!doc.answered){message.textContent='먼저 기록할 내용을 입력해 주세요.';return;}
      const url=URL.createObjectURL(new Blob([doc.markdown],{type:'text/markdown;charset=utf-8'}));
      const link=element('a');link.href=url;
      link.download='ekodi-my-writing-notes-'+new Date().toISOString().slice(0,10)+'.md';
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      exported=true;
      message.textContent='개인 집필 노트 다운로드를 시작했습니다. 파일 저장 여부는 브라우저 다운로드 목록에서 확인해 주세요.';
    });
    const small=element('p','작성 단계 '+snapshot().answered+' / '+MENTOR_STAGES.length+' · '+view.guidance,'notice');
    panel.append(count,question,lens,tip,answer,small,prev,next,download);
    answer.focus();
  }
  selector.addEventListener('change',()=>{field=selector.value;exported=false;render();});
  backdrop.addEventListener('click',ev=>{if(ev.target===backdrop)close();});
  backdrop.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){ev.preventDefault();close();}
    if(ev.key==='Tab'){
      const list=[...dialog.querySelectorAll('button:not([disabled]),select,textarea')].filter(n=>!n.hidden);
      if(list.length){if(ev.shiftKey&&document.activeElement===list[0]){ev.preventDefault();list.at(-1).focus();}else if(!ev.shiftKey&&document.activeElement===list.at(-1)){ev.preventDefault();list[0].focus();}}
    }
  });
  render();return true;
}
