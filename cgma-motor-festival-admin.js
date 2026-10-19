// 청계면상인회 관리자 화면(/cgma/admin/festival) — 2026 모터페스티벌 상가 참여 신청 명단.
// Mounted by workspace-admin-page.js with the shell's own sign-in token (getToken), so administrators
// never sign in twice. Authority is enforced by the Control API (cgma owner/admin or super_admin);
// every applicant string is rendered through textContent only.
const API='/api/merchant-events/motor-festival-2026/applications';
const STYLE='/cgma/admin/assets/cgma-motor-festival-admin.css';
const PUBLIC_URL='https://ekodi.kr/cgma/motor-festival-2026/';
const LABEL=Object.freeze({regular:'정회원',join:'가입 즉시 참여',info:'가입 안내 후 결정',none:'가입 의사 없음',
  yes:'참여 희망',maybe:'조건 확인 후',no:'불참',all:'종일',am:'오전',pm:'오후',discuss:'협의'});

function installStyle(){
  if(document.querySelector('link[data-cgma-festival-style]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=STYLE;link.dataset.cgmaFestivalStyle='true';
  document.head.append(link);
}
function el(tag,{className='',text='',attrs={}}={},children=[]){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!=='')node.textContent=String(text);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  for(const child of children)node.append(child);
  return node;
}
const label=value=>LABEL[value]||String(value??'');
const tally=obj=>Object.entries(obj||{}).map(([k,v])=>`${label(k)} ${v}`).join(', ')||'-';
const kst=value=>{try{return new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}catch{return String(value||'')}};

export function festivalStatisticsText(summary){
  return ['제2회 전남폴리텍 모터페스티벌 상가 참여 접수 현황 (청계면상인회)',
    `전체 ${summary.total}건 / 참여 희망 ${summary.participating}건 / 조건 확인 후 ${summary.maybe}건 / 불참 ${summary.declined}건`,
    `회원구분: 정회원 ${summary.regular} · 가입 즉시 참여 ${summary.join} · 가입 안내 후 결정 ${summary.info} · 가입 의사 없음 ${summary.none}`,
    `업종: ${tally(summary.byCategory)}`,`참여형태: ${tally(summary.byActivity)}`,
    `필요시설: ${tally(summary.bySupport)}`,`운영시간: ${tally(summary.byHours)}`].join('\n');
}

export async function mountCgmaMotorFestivalAdmin({root,summaryRoot,getToken,state=()=>{}}){
  if(!root||!summaryRoot||typeof getToken!=='function')throw new Error('CGMA_FESTIVAL_ADMIN_CONTEXT_REQUIRED');
  installStyle();
  let summary=null;
  const status=el('p',{className:'cgma-festival-status',attrs:{role:'status','aria-live':'polite'}});
  const refresh=el('button',{className:'primary',text:'새로고침',attrs:{type:'button'}});
  const share=el('button',{text:'개인정보 제외 통계 복사',attrs:{type:'button',disabled:''}});
  const publicLink=el('a',{text:'신청 화면 열기',attrs:{href:PUBLIC_URL,target:'_blank',rel:'noopener'}});
  const tableHost=el('div',{className:'cgma-festival-table'});
  root.replaceChildren(el('section',{className:'cgma-festival'},[
    el('h2',{text:'모터페스티벌 상가 참여 신청'}),
    el('p',{className:'cgma-festival-note',text:'2026-10-25(일) 행사 · 신청 마감 10-25 08:00 · 개인정보는 2026-11-24 00:00(KST) 자동 파기됩니다. 조회 기록이 남습니다.'}),
    el('div',{className:'cgma-festival-actions'},[refresh,share,publicLink]),status,tableHost,
  ]));
  const say=(kind,message)=>{status.className='cgma-festival-status '+kind;status.textContent=message;};

  async function load(){
    share.setAttribute('disabled','');tableHost.replaceChildren();summaryRoot.replaceChildren();
    say('','접수 현황 확인 중…');state('조회 중');
    const token=await getToken();
    if(!token){say('err','관리자 로그인이 필요합니다. 상단에서 다시 로그인해 주세요.');state('로그인 필요');return;}
    let response;
    try{response=await fetch(API,{cache:'no-store',credentials:'same-origin',headers:{authorization:'Bearer '+token}});}
    catch{say('err','네트워크 오류로 접수 현황을 불러오지 못했습니다.');state('오류');return;}
    if(response.status===401){say('err','로그인이 만료되었습니다. 다시 로그인해 주세요.');state('로그인 필요');return;}
    if(response.status===403){say('err','이 계정에는 청계면상인회 행사 관리자 권한(owner/admin)이 없습니다.');state('권한 없음');return;}
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.summary||!Array.isArray(data.applications)){say('err','접수 현황을 불러오지 못했습니다. (HTTP '+response.status+')');state('오류');return;}
    summary=data.summary;
    for(const [title,value] of [['전체 접수',summary.total],['참여 희망',summary.participating],['조건 확인 후',summary.maybe],
      ['정회원',summary.regular],['가입 즉시 참여',summary.join],['가입 안내 후 결정',summary.info]]){
      summaryRoot.append(el('div',{className:'summary-card'},[el('strong',{text:value}),el('span',{text:title})]));
    }
    if(!data.applications.length){
      tableHost.append(el('p',{className:'cgma-festival-empty',text:'아직 접수된 신청이 없습니다.'}));
    }else{
      const head=el('tr',{},['접수번호','접수일시','업체명','담당자','연락처','업종','회원구분','참여의향','참여형태','품목','시간','지원시설','인원','건의사항'].map(t=>el('th',{text:t})));
      const rows=data.applications.map(a=>el('tr',{},[a.receipt_id,kst(a.created_at),a.business_name,a.contact_name,a.phone,a.category,
        label(a.membership),label(a.intent),(a.activity||[]).join(', '),a.items,label(a.hours),(a.support||[]).join(', '),a.staff,a.notes]
        .map(v=>el('td',{text:v??''}))));
      tableHost.append(el('table',{},[el('thead',{},[head]),el('tbody',{},rows)]));
    }
    share.removeAttribute('disabled');
    const unreadable=Number(data.unreadable_fields||0);
    say(unreadable?'warn':'ok',`조회 완료 · ${data.applications.length}건${unreadable?` · 복호화 불가 ${unreadable}개 필드`:''}`);
    state('조회 완료');
  }
  refresh.addEventListener('click',load);
  share.addEventListener('click',async()=>{
    if(!summary)return;
    try{await navigator.clipboard.writeText(festivalStatisticsText(summary));say('ok','개인정보 없는 통계를 복사했습니다.');}
    catch{say('err','클립보드에 복사할 수 없습니다.');}
  });
  await load();
  return {reload:load};
}
