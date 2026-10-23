// 누구나 라면 부스 근무표 — 회원 개인 링크 화면.
// The key in the link (#k=...) identifies the member to the server; the server decides whose row changes.
const API='/api/cgmurrc/booth/me';
const $=id=>document.getElementById(id);
const key=new URLSearchParams(location.hash.slice(1)).get('k')||'';
let view=null,busy=false;

const STATE={
  assigned:{cls:'assigned',text:'✓ 배정됨',button:'이 시간 어려워요',action:'drop'},
  drop_requested:{cls:'pending',text:'빠지기 요청함 · 사무국 확인 대기',button:'요청 취소',action:'keep'},
  requested:{cls:'pending',text:'희망 접수 · 사무국 확정 대기',button:'희망 취소',action:'withdraw'},
  none:{cls:'',text:'배정 없음',button:'이 시간도 할 수 있어요',action:'request'},
};
function say(text,kind=''){const s=$('status');s.textContent=text;s.className='msg'+(kind?' '+kind:'');s.hidden=!text}
function el(tag,props={},...children){const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e}

function render(){
  const {member,slots,mine,board,writable}=view;
  $('title').textContent=`${member.name}님의 근무표`;
  $('mine').hidden=false;$('all').hidden=false;
  $('slots').replaceChildren(...slots.map((slot,i)=>{
    const st=STATE[mine[i]||'none'];
    const time=el('div',{className:'time'},slot.label);
    if(slot.tag)time.append(el('small',{},slot.tag));
    const btn=el('button',{type:'button',className:st.action==='request'?'':'primary',disabled:busy||!writable},st.button);
    btn.addEventListener('click',()=>act(i,st.action));
    return el('div',{className:'slot '+st.cls},time,el('div',{className:'state'},st.text),btn);
  }));
  $('board').replaceChildren(...slots.map((slot,i)=>{
    const names=board[i]||[];
    const td=el('td');
    if(!names.length)td.append('—');
    names.forEach((n,k)=>{if(k)td.append(', ');td.append(n===member.name?el('mark',{},n):n)});
    return el('tr',{},el('td',{className:'t'},slot.label+(slot.tag?` (${slot.tag})`:'')),td);
  }));
  if(!writable)say('행사가 끝나 더 이상 바꿀 수 없습니다.');
}

async function call(method,body){
  const res=await fetch(API,{method,cache:'no-store',credentials:'omit',headers:{
    'x-cgmurrc-booth-key':key,...(body?{'content-type':'application/json','x-ekodi-intake-request':'1'}:{})},
    body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>null);
  return {res,data};
}
async function load(){
  if(!key){say('개인 링크로 들어와 주세요. 사무국에서 보낸 카톡 링크를 누르면 됩니다.','err');return}
  try{
    const {res,data}=await call('GET');
    if(!res.ok||!data?.ok){say(data?.error||'근무표를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.','err');return}
    view=data;say('');render();
  }catch{say('인터넷 연결을 확인한 뒤 다시 열어 주세요.','err')}
}
const DONE={request:'희망 시간을 보냈습니다. 사무국장이 확정하면 초록색으로 바뀝니다.',withdraw:'희망을 취소했습니다.',
  drop:'빠지기 요청을 보냈습니다. 사무국장이 확인합니다.',keep:'빠지기 요청을 취소했습니다.'};
async function act(slot,action){
  if(busy)return;busy=true;render();
  try{
    const {res,data}=await call('POST',{slot,action});
    if(res.ok&&data?.ok){view=data;say(DONE[action],'ok')}
    else{say(data?.error||'처리하지 못했습니다. 다시 눌러 주세요.','err');if(res.status===409)await load()}
  }catch{say('인터넷 연결을 확인한 뒤 다시 눌러 주세요.','err')}
  finally{busy=false;if(view)render()}
}
load();
