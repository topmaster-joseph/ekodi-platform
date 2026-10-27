// 누구나 라면 부스 전체 근무표 — public, read-only. Shows confirmed names with their 연번 only.
const API='/api/cgmurrc/booth/board';
const $=id=>document.getElementById(id);
function el(tag,props={},...children){const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e}
function say(text,kind=''){const s=$('status');s.textContent=text;s.className='msg'+(kind?' '+kind:'');s.hidden=!text}

function render({slots,board}){
  $('board').replaceChildren(...slots.map((slot,i)=>{
    const people=board[i]||[];
    const time=el('div',{className:'time'},slot.label);
    if(slot.tag)time.append(el('small',{},slot.tag));
    const names=el('div',{className:'names'},...people.map(p=>el('span',{className:'name'},el('b',{},String(p.no)),p.name)));
    if(!people.length)names.append(el('span',{className:'empty'},'담당 미정'));
    return el('div',{className:'slot'+(slot.tag?' edge':'')},time,names);
  }));
  $('updated').textContent=`${new Date().toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} 기준`;
}
async function load(){
  $('refresh').disabled=true;
  try{
    const res=await fetch(API,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data?.ok){say(data?.error||'근무표를 불러오지 못했습니다. 「새로 고침」을 눌러 주세요.','err');return}
    render(data);say('');
  }catch{say('인터넷 연결을 확인한 뒤 「새로 고침」을 눌러 주세요.','err')}
  finally{$('refresh').disabled=false}
}
$('refresh').addEventListener('click',load);
load();
