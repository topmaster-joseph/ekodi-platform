// 라면 부스 근무 배정 관리 — reuses the EKODI administrator sign-in held in this tab.
// Authorization is enforced by the server; this page only presents what the server permits.
const API='/api/cgmurrc/booth/admin';
const $=id=>document.getElementById(id);
const SHORT=['10시','11시','12시','13시','14시','15시','16시','17시'];
const PER=2;
let view=null,busy=false;
const issued=new Map(); // member_id -> {name,link} issued in this page session (plain links are shown once)

function token(){
  try{
    const workspace=JSON.parse(sessionStorage.getItem('ekodi-workspace-admin-session')||'null');
    const now=Math.floor(Date.now()/1000);
    if(workspace?.accessToken&&(!workspace.expiresAt||Number(workspace.expiresAt)>now+30))return workspace.accessToken;
  }catch{}
  try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return ''}
}
function say(text,kind=''){const s=$('status');s.textContent=text;s.className='msg'+(kind?' '+kind:'');s.hidden=!text}
function el(tag,props={},...children){const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e}
function btn(label,onclick,cls=''){const b=el('button',{type:'button',className:cls,disabled:busy},label);b.addEventListener('click',onclick);return b}

async function call(method,body){
  const bearer=token();
  const res=await fetch(API,{method,cache:'no-store',credentials:'same-origin',headers:{
    ...(bearer?{authorization:'Bearer '+bearer}:{}),
    ...(body?{'content-type':'application/json','x-ekodi-intake-request':'1'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>null);
  return {res,data};
}
async function load(){
  try{
    const {res,data}=await call('GET');
    if(res.status===401){$('login').hidden=false;say('');return}
    if(!res.ok||!data?.ok){say(data?.error||'불러오지 못했습니다.','err');return}
    view=data;$('app').hidden=false;say('');render();
  }catch{say('인터넷 연결을 확인해 주세요.','err')}
}
async function act(body,done){
  if(busy)return;busy=true;render();
  try{
    const {res,data}=await call('POST',body);
    if(res.ok&&data?.ok){
      view=data;
      if(data.issued){issued.set(data.issued.member_id,data.issued);say(`${data.issued.name}님 링크를 발급했습니다. 아래 카톡 문구를 보내 주세요.`,'ok')}
      else if(done)say(done,'ok');
    }else{say(data?.error||'처리하지 못했습니다.','err');if(res.status===409)await load()}
  }catch{say('인터넷 연결을 확인해 주세요.','err')}
  finally{busy=false;render()}
}
const nameOf=id=>view.members.find(m=>m.id===id)?.name||'';
function statusMap(){const m=new Map();for(const e of view.entries)m.set(e.member_id+':'+e.slot,e.status);return m}
function kakao(name,link){
  return `[청계면 도시재생 주민협의체] ${name}님, 10/28(수) 누구나 라면 부스 근무표입니다.\n아래 본인 전용 링크에서 배정된 시간을 확인하시고, 더 하실 수 있는 시간은 「이 시간도 할 수 있어요」를 눌러 주세요. 사무국장이 확정해 드립니다.\n${link}\n※ 본인 전용 링크이니 다른 분께 전달하지 마세요.`;
}

function render(){
  if(!view)return;
  const map=statusMap();
  // pending requests
  const pend=view.entries.filter(e=>e.status!=='assigned').sort((a,b)=>a.slot-b.slot);
  $('pendingCount').textContent=pend.length?`(${pend.length}건)`:'(없음)';
  $('pending').replaceChildren(...(pend.length?pend.map(e=>{
    const what=e.status==='requested'?`${view.slots[e.slot].label} 추가 희망`:`${view.slots[e.slot].label} 빠지기 요청`;
    return el('div',{className:'req'},el('b',{},nameOf(e.member_id)),el('span',{},what),
      btn('확정',()=>act({action:'confirm',member_id:e.member_id,slot:e.slot},`${nameOf(e.member_id)}님 ${SHORT[e.slot]} 요청을 확정했습니다.`),'primary'),
      btn('거절',()=>act({action:'reject',member_id:e.member_id,slot:e.slot},`${nameOf(e.member_id)}님 ${SHORT[e.slot]} 요청을 거절했습니다.`),'danger'));
  }):[el('p',{className:'muted'},'확정을 기다리는 요청이 없습니다.')]));
  // grid
  $('head').replaceChildren(el('th',{},'이름'),...view.slots.map((s,i)=>el('th',{className:'s'},SHORT[i]+(s.tag?` ${s.tag}`:''))),el('th',{className:'s'},'배정'));
  $('rows').replaceChildren(...view.members.map(m=>{
    let count=0;
    const cells=view.slots.map((_,i)=>{
      const st=map.get(m.id+':'+i)||'';
      if(st==='assigned'||st==='drop_requested')count++;
      const label={assigned:'✓',requested:'희망',drop_requested:'빠짐'}[st]||'';
      const b=btn(label,()=>{
        if(st==='assigned')act({action:'unassign',member_id:m.id,slot:i},`${m.name}님 ${SHORT[i]} 배정을 해제했습니다.`);
        else if(!st)act({action:'assign',member_id:m.id,slot:i},`${m.name}님을 ${SHORT[i]}에 배정했습니다.`);
        else say('회원 요청은 위 「확정 대기 요청」에서 확정·거절하세요.');
      },'cell '+st);
      b.setAttribute('aria-label',`${m.name} ${view.slots[i].label} ${label||'비어 있음'}`);
      return el('td',{className:'s'},b);
    });
    return el('tr',{},el('td',{className:'who'},m.name),...cells,el('td',{className:'s'},`${count}회`));
  }));
  $('foot').replaceChildren(el('td',{},'인원'),...view.slots.map((_,i)=>{
    const n=view.entries.filter(e=>e.slot===i&&e.status!=='requested').length;
    return el('td',{className:n<PER?'short':''},`${n}/${PER}`);
  }),el('td'));
  // links
  $('links').replaceChildren(...view.members.map(m=>{
    const got=issued.get(m.id);
    const linkCell=el('td',{},got?el('code',{},got.link):el('span',{className:'muted'},m.link_issued?'발급됨 (보안상 다시 볼 수 없음)':'미발급'));
    const label=m.link_issued?'재발급':'발급';
    return el('tr',{},el('td',{className:'who'},m.name),linkCell,el('td',{},
      btn(label,()=>act({action:'issue_link',member_id:m.id})),' ',
      btn('삭제',()=>{if(confirmRemove(m))act({action:'remove_member',member_id:m.id},`${m.name}님을 명단에서 뺐습니다.`)},'danger')));
  }));
  $('kakao').value=[...issued.values()].map(x=>kakao(x.name,x.link)).join('\n\n---\n\n');
  for(const b of document.querySelectorAll('button'))b.disabled=busy;
}
// confirm() dialogs are unreliable in some embedded views; use a two-tap confirmation instead.
let pendingRemove=null;
function confirmRemove(m){
  if(pendingRemove===m.id){pendingRemove=null;return true}
  pendingRemove=m.id;say(`${m.name}님을 명단에서 빼려면 「삭제」를 한 번 더 누르세요. 개인 링크도 멈춥니다.`,'err');return false;
}
$('add').addEventListener('click',()=>{const name=$('newName').value.trim();if(name)act({action:'add_member',name},`${name}님을 추가했습니다.`).then(()=>{$('newName').value=''})});
$('copyAll').addEventListener('click',async()=>{
  const t=$('kakao').value;if(!t){say('이번에 발급한 링크가 없습니다.','err');return}
  try{await navigator.clipboard.writeText(t);say('카톡 문구를 복사했습니다.','ok')}catch{$('kakao').select();say('자동 복사가 막혀 문구를 선택해 두었습니다. 직접 복사하세요.')}
});
load();
