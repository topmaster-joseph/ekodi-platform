// 모터페스티벌 2026 관리자 화면 — reuses the existing EKODI sign-in held in this tab.
// Authorization is enforced by the server; this page only presents what the server permits.
const API='/api/merchant-events/motor-festival-2026/applications';
const status=document.querySelector('#status'),data=document.querySelector('#data'),cards=document.querySelector('#cards');
const share=document.querySelector('#share'),login=document.querySelector('#login');
const LABEL={regular:'정회원',join:'가입 즉시 참여',info:'가입 안내 후 결정',none:'가입 의사 없음',yes:'참여 희망',maybe:'조건 확인 후',no:'불참',all:'종일',am:'오전',pm:'오후',discuss:'협의'};
let summary=null;

function token(){
  try{
    const workspace=JSON.parse(sessionStorage.getItem('ekodi-workspace-admin-session')||'null');
    const now=Math.floor(Date.now()/1000);
    if(workspace?.accessToken&&(!workspace.expiresAt||Number(workspace.expiresAt)>now+30))return workspace.accessToken;
  }catch{}
  try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return ''}
}
function say(kind,message){status.className='msg '+kind;status.textContent=message}
function cell(row,value,tag='td'){const el=document.createElement(tag);el.textContent=String(value??'');row.append(el)}
function card(label,value){const el=document.createElement('div');el.className='card';const b=document.createElement('b');b.textContent=String(value);el.append(b,document.createTextNode(label));cards.append(el)}
function list(obj){return Object.entries(obj||{}).map(([k,v])=>`${LABEL[k]||k} ${v}`).join(', ')||'-'}

async function load(){
  share.disabled=true;data.replaceChildren();cards.replaceChildren();login.hidden=true;
  say('','권한 및 접수 현황 확인 중…');
  const bearer=token();
  if(!bearer){login.hidden=false;say('err','관리자 로그인이 필요합니다.');return}
  try{
    const response=await fetch(API,{cache:'no-store',credentials:'same-origin',headers:{authorization:'Bearer '+bearer}});
    if(response.status===401){login.hidden=false;say('err','관리자 로그인이 필요하거나 로그인이 만료되었습니다.');return}
    if(response.status===403){say('err','청계면상인회 행사 관리자 권한이 없습니다.');return}
    const v=await response.json().catch(()=>null);
    if(!response.ok||!v?.summary||!Array.isArray(v.applications))throw new Error('서버 오류 '+response.status);
    summary=v.summary;
    card('전체 접수',summary.total);card('정회원',summary.regular);card('가입 즉시 참여',summary.join);
    card('가입 안내 후 결정',summary.info);card('참여 희망',summary.participating);card('조건 확인 후',summary.maybe);
    const table=document.createElement('table'),head=document.createElement('tr');
    ['접수번호','접수일시','업체명','담당자','연락처','업종','회원구분','참여의향','참여형태','품목','시간','지원시설','인원','건의사항'].forEach(x=>cell(head,x,'th'));
    table.append(head);
    for(const a of v.applications){
      const tr=document.createElement('tr');
      [a.receipt_id,new Date(a.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),a.business_name,a.contact_name,a.phone,a.category,
       LABEL[a.membership]||a.membership,LABEL[a.intent]||a.intent,(a.activity||[]).join(', '),a.items,LABEL[a.hours]||a.hours,
       (a.support||[]).join(', '),a.staff,a.notes].forEach(x=>cell(tr,x));
      table.append(tr);
    }
    data.append(table);
    share.disabled=false;
    say('ok',`관리자 조회 완료 (${v.viewer?.email||''}) · ${v.applications.length}건`);
  }catch(error){say('err','접수 현황을 불러오지 못했습니다: '+error.message)}
}
share.addEventListener('click',async()=>{
  if(!summary)return;
  const lines=['제2회 전남폴리텍 모터페스티벌 상가 참여 접수 현황 (청계면상인회)',
    `전체 ${summary.total}건 / 참여 희망 ${summary.participating}건 / 조건 확인 후 ${summary.maybe}건 / 불참 ${summary.declined}건`,
    `회원구분: 정회원 ${summary.regular} · 가입 즉시 참여 ${summary.join} · 가입 안내 후 결정 ${summary.info} · 가입 의사 없음 ${summary.none}`,
    `업종: ${list(summary.byCategory)}`,`참여형태: ${list(summary.byActivity)}`,`필요시설: ${list(summary.bySupport)}`,`운영시간: ${list(summary.byHours)}`];
  try{await navigator.clipboard.writeText(lines.join('\n'));say('ok','개인정보 없는 통계를 복사했습니다.')}catch{say('err','클립보드에 복사할 수 없습니다.')}
});
document.querySelector('#refresh').addEventListener('click',load);
load();
