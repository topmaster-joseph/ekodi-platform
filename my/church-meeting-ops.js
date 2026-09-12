const PASTOR_API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';
const REPORT_API='/api/church/admin/reports';
const HOME_URL='https://ekodi.kr/ekodichurch/';
const LIVE_URL='https://ekodi.kr/ekodichurch/live/';
const STORAGE_KEY='ekodi.my.church.meeting-ops.v1';
const q=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'})[c]);
const token=()=>window.EKODI_MY_AUTH?.getAccessToken?.()||'';
const signedIn=()=>Boolean(window.EKODI_MY_AUTH?.isSignedIn?.());
let state={workspaceKey:'',role:'',services:[],selected:null,source:'',error:'',loading:false};

function selectedChurchWorkspace(){
  const selected=q('#workspaceList')?.querySelector('[data-workspace-key].selected');
  if(!selected)return '';
  const text=String(selected.textContent||'').toLowerCase();
  return text.includes('church')||text.includes('교회')?String(selected.dataset.workspaceKey||''):'';
}
function parseList(value){
  if(Array.isArray(value))return value.map(v=>String(v||'').trim()).filter(Boolean);
  if(!value)return [];
  if(typeof value==='string'){
    try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.map(v=>typeof v==='string'?v:String(v?.title||v?.name||'')).filter(Boolean)}catch{}
    return value.split(/\r?\n|[,;]+/).map(v=>v.trim()).filter(Boolean);
  }
  return [];
}
function meetingKind(row){
  const text=`${row?.title||''} ${row?.service_type||''} ${row?.kind||''}`.toLowerCase();
  if(/토요|saturday|sat\b/.test(text))return 'saturday';
  if(/주일|sunday|sun\b/.test(text))return 'sunday';
  const date=String(row?.service_date||row?.date||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
    const day=new Date(`${date}T12:00:00+09:00`).getUTCDay();
    if(day===6)return 'saturday';
    if(day===0)return 'sunday';
  }
  return 'other';
}
function normalizeService(row,index=0){
  const date=String(row?.service_date||row?.date||'').slice(0,10);
  const kind=meetingKind(row);
  return {
    id:String(row?.id||`${date}-${kind}-${index}`),date,kind,
    title:String(row?.title||(kind==='sunday'?'주일모임':kind==='saturday'?'토요모임':'모임')),
    scripture:String(row?.scripture||row?.bible_text||row?.passage||''),
    sermonTitle:String(row?.sermon_title||row?.message_title||row?.theme||''),
    preacher:String(row?.preacher||row?.speaker||''),
    songs:parseList(row?.worship_songs||row?.songs||row?.music),
    order:parseList(row?.worship_order||row?.service_order||row?.program),
    announcements:String(row?.announcements||row?.notice||row?.notes||''),
    outline:String(row?.sermon_outline||row?.message||row?.body||''),raw:row||{}
  };
}
function fallbackService(item,index=0){
  const parts=String(item?.summary||'').split(' · ').map(v=>v.trim());
  return normalizeService({service_date:item?.date,title:item?.title,scripture:parts[0]||'',sermon_title:parts[1]||'',preacher:parts[2]||''},index);
}
function formatDate(date){
  if(!date)return '날짜 미정';
  try{return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(`${date}T12:00:00+09:00`))}catch{return date}
}
function yymmdd(date){return String(date||'').replaceAll('-','').slice(2,8)}
function label(kind){return kind==='sunday'?'주일모임':kind==='saturday'?'토요모임':'교회모임'}
function loadDraft(id){try{const all=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return all?.[id]||null}catch{return null}}
function saveDraft(pack){try{const all=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');all[pack.id]={...pack,raw:undefined,savedAt:new Date().toISOString()};localStorage.setItem(STORAGE_KEY,JSON.stringify(all));return true}catch{return false}}
function withDraft(pack){return {...pack,...(loadDraft(pack.id)||{}),raw:pack.raw}}
function activePack(){return state.selected?withDraft(state.selected):null}
function buildHomepage(pack){return [`${formatDate(pack.date)} · ${label(pack.kind)}`,pack.sermonTitle||pack.title,pack.scripture?`말씀 ${pack.scripture}`:'',pack.preacher?`말씀나눔 ${pack.preacher}`:'',pack.announcements||''].filter(Boolean).join('\n')}
function buildLive(pack){
  const title=[pack.sermonTitle||pack.title,label(pack.kind),yymmdd(pack.date)].filter(Boolean).join(' | ');
  const description=[pack.sermonTitle||pack.title,pack.scripture?`말씀: ${pack.scripture}`:'',pack.preacher?`말씀나눔: ${pack.preacher}`:'',`에코디교회 ${label(pack.kind)} 라이브`,HOME_URL].filter(Boolean).join('\n');
  return {title,description};
}
function injectStyles(){
  if(q('#churchMeetingOpsStyles'))return;
  const style=document.createElement('style');style.id='churchMeetingOpsStyles';style.textContent=`
  #churchMeetingOps{margin:26px auto;max-width:1180px;padding:24px;border:1px solid #e5e7eb;border-radius:22px;background:#fff;box-shadow:0 14px 40px rgba(15,23,42,.06)}
  #churchMeetingOps[hidden]{display:none}.cmo-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.cmo-head h2{margin:.15rem 0 .4rem}.cmo-status{font-size:.9rem;color:#64748b}
  .cmo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}.cmo-card{border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:#fafafa;text-align:left;cursor:pointer}.cmo-card.active{outline:2px solid #111827;background:#fff}.cmo-card small,.cmo-card span{display:block;color:#64748b}.cmo-card strong{display:block;margin:.35rem 0}
  .cmo-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.cmo-editor label{display:grid;gap:6px;font-size:.86rem;color:#475569}.cmo-editor input,.cmo-editor textarea{width:100%;box-sizing:border-box;border:1px solid #d7dce3;border-radius:10px;padding:10px 12px;font:inherit}.cmo-editor .wide{grid-column:1/-1}.cmo-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.cmo-actions button,.cmo-actions a{border:1px solid #cbd5e1;border-radius:999px;background:#fff;padding:9px 13px;font:inherit;text-decoration:none;color:#111827;cursor:pointer}.cmo-actions .primary{background:#111827;color:#fff;border-color:#111827}.cmo-preview{margin-top:16px;padding:14px;border-radius:14px;background:#f8fafc;white-space:pre-wrap;font-size:.9rem;color:#334155}.cmo-empty{padding:20px;border:1px dashed #cbd5e1;border-radius:14px;color:#64748b;margin-top:16px}
  @media(max-width:760px){.cmo-grid,.cmo-editor{grid-template-columns:1fr}.cmo-head{display:block}}`;
  document.head.append(style);
}
function ensureHost(){
  injectStyles();let host=q('#churchMeetingOps');if(host)return host;
  host=document.createElement('section');host.id='churchMeetingOps';host.hidden=true;host.setAttribute('aria-label','에코디교회 모임 운영');
  const anchor=q('#creator')||q('#account')||q('main')?.lastElementChild;
  if(anchor?.parentNode)anchor.parentNode.insertBefore(host,anchor);else q('main')?.append(host);
  host.addEventListener('input',event=>{if(!event.target.matches('[data-pack-field]'))return;const pack=activePack();if(!pack)return;pack[event.target.dataset.packField]=event.target.value;saveDraft(pack);renderEditor(pack)});
  host.addEventListener('click',onClick);return host;
}
function editorValue(pack,key){return esc(pack?.[key]||'')}
function renderEditor(pack){
  const host=ensureHost();const box=q('[data-cmo-editor]',host);if(!box||!pack)return;
  const homepage=buildHomepage(pack),live=buildLive(pack);
  box.innerHTML=`<div class="cmo-editor">
    <label>날짜<input type="date" data-pack-field="date" value="${editorValue(pack,'date')}"></label><label>모임명<input data-pack-field="title" value="${editorValue(pack,'title')}"></label>
    <label>본문<input data-pack-field="scripture" value="${editorValue(pack,'scripture')}" placeholder="예: 신명기 28:1-14"></label><label>말씀 제목<input data-pack-field="sermonTitle" value="${editorValue(pack,'sermonTitle')}"></label>
    <label>말씀나눔<input data-pack-field="preacher" value="${editorValue(pack,'preacher')}"></label><label class="wide">공지<textarea rows="3" data-pack-field="announcements">${editorValue(pack,'announcements')}</textarea></label>
  </div><div class="cmo-actions"><button class="primary" type="button" data-cmo-action="all">전체 준비</button><button type="button" data-cmo-action="bulletin">주보</button><button type="button" data-cmo-action="ppt">PPTX</button><button type="button" data-cmo-action="homepage">홈페이지 문안</button><button type="button" data-cmo-action="live">라이브 설정</button><a href="${LIVE_URL}" target="_blank" rel="noopener">라이브 화면 열기</a></div>
  <div class="cmo-preview"><strong>홈페이지</strong>\n${esc(homepage)}\n\n<strong>라이브</strong>\n${esc(live.title)}\n${esc(live.description)}</div>`;
}
function render(){
  const host=ensureHost(),workspaceKey=selectedChurchWorkspace();if(!signedIn()||!workspaceKey){host.hidden=true;return}host.hidden=false;
  const sunday=state.services.find(item=>item.kind==='sunday'),saturday=state.services.find(item=>item.kind==='saturday'),sourceText=state.source?` · ${state.source}`:'';
  host.innerHTML=`<div class="cmo-head"><div><p class="eyebrow">EKODI CHURCH · MEETING OPS</p><h2>주일·토요모임 운영</h2><p>교회 원자료 하나에서 주보·PPT·홈페이지 문안·라이브 메타데이터를 함께 준비합니다.</p></div><span class="cmo-status">${state.loading?'자료 확인 중…':state.error?esc(state.error):`목회자 ${esc(state.role||'staff')}${sourceText}`}</span></div>
  ${state.loading?'<div class="cmo-empty">에코디교회 자료를 불러오고 있습니다.</div>':state.services.length?`<div class="cmo-grid">${[sunday,saturday].filter(Boolean).map(pack=>`<button type="button" class="cmo-card${state.selected?.id===pack.id?' active':''}" data-cmo-select="${esc(pack.id)}"><small>${label(pack.kind)}</small><strong>${esc(pack.sermonTitle||pack.title)}</strong><span>${esc(formatDate(pack.date))}${pack.scripture?` · ${esc(pack.scripture)}`:''}</span></button>`).join('')}</div><div data-cmo-editor></div>`:`<div class="cmo-empty">주일·토요모임 원자료가 아직 없거나 동기화되지 않았습니다. 교회 사역자료에 모임을 등록하면 이곳에서 자동으로 사용합니다.</div>`}`;
  if(state.selected)renderEditor(activePack());
}
async function verifyAndLoad(){
  const workspaceKey=selectedChurchWorkspace();if(!signedIn()||!workspaceKey){state={workspaceKey:'',role:'',services:[],selected:null,source:'',error:'',loading:false};render();return}
  if(state.loading||state.workspaceKey===workspaceKey&&state.services.length)return;state={...state,workspaceKey,loading:true,error:''};render();
  try{
    const access=token();if(!access)throw new Error('로그인이 필요합니다.');
    const overviewResponse=await fetch(REPORT_API,{headers:{authorization:`Bearer ${access}`,accept:'application/json'},cache:'no-store'}),overview=await overviewResponse.json().catch(()=>({}));
    if(!overviewResponse.ok)throw new Error(overview?.error||'에코디교회 목회자 권한을 확인하지 못했습니다.');state.role=overview?.capabilities?.role||'staff';
    let rows=[],source='교회 원자료';
    try{
      const url=new URL(PASTOR_API);url.searchParams.set('table','church_services');url.searchParams.set('order','service_date.desc');url.searchParams.set('limit','40');
      const response=await fetch(url,{headers:{authorization:`Bearer ${access}`,accept:'application/json'},cache:'no-store'}),data=await response.json().catch(()=>[]);if(!response.ok)throw new Error(data?.error||`HTTP ${response.status}`);rows=Array.isArray(data)?data:[];
    }catch(error){
      source='사역보고 동기화 자료';const report=(overview.reports||[]).find(r=>r.sourceStatus==='ready')||(overview.reports||[])[0];
      if(report?.id){const response=await fetch(`${REPORT_API}/${encodeURIComponent(report.id)}/sources`,{headers:{authorization:`Bearer ${access}`,accept:'application/json'},cache:'no-store'}),data=await response.json().catch(()=>({}));if(response.ok)rows=(data?.source?.items||[]).filter(item=>item.label==='예배·말씀').map((item,index)=>fallbackService(item,index));}
      if(!rows.length)console.warn('[EKODI Church Meeting Ops] pastor source unavailable',error);
    }
    const normalized=rows.map((row,index)=>row?.kind?row:normalizeService(row,index)).filter(item=>['sunday','saturday'].includes(item.kind)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    state.services=normalized;state.source=source;state.selected=normalized.find(item=>item.kind==='sunday')||normalized[0]||null;state.error='';
  }catch(error){state.error=error?.message||'모임 자료를 불러오지 못했습니다.';state.services=[];state.selected=null}finally{state.loading=false;render()}
}
async function copy(text,message){try{await navigator.clipboard.writeText(text);setStatus(message)}catch{setStatus('복사하지 못했습니다. 직접 선택해 복사해 주세요.')}}
function setStatus(message){const status=q('.cmo-status',ensureHost());if(status)status.textContent=message}
function bulletinHtml(pack){
  const order=pack.order.length?pack.order:['환영과 시작','찬양','기도','말씀','나눔과 결단','광고·교제'];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(pack.title)} 주보</title><style>body{font-family:Arial,'Noto Sans KR',sans-serif;max-width:820px;margin:40px auto;padding:0 28px;color:#111}header{border-bottom:3px solid #111;padding-bottom:18px;margin-bottom:24px}h1{font-size:32px}h2{margin-top:28px;font-size:20px}li{margin:8px 0}.meta{color:#555}.scripture{padding:18px;background:#f4f4f4;border-radius:12px}.foot{margin-top:42px;border-top:1px solid #ddd;padding-top:16px;color:#666}@media print{body{margin:0;max-width:none}}</style></head><body><header><small>에코디교회 · ${label(pack.kind)}</small><h1>${esc(pack.sermonTitle||pack.title)}</h1><div class="meta">${esc(formatDate(pack.date))}${pack.preacher?` · ${esc(pack.preacher)}`:''}</div></header><section class="scripture"><strong>말씀</strong><div>${esc(pack.scripture||'본문 확인 필요')}</div></section><h2>모임 순서</h2><ol>${order.map(item=>`<li>${esc(item)}</li>`).join('')}</ol>${pack.songs.length?`<h2>찬양</h2><ul>${pack.songs.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}${pack.announcements?`<h2>알림</h2><p>${esc(pack.announcements).replaceAll('\n','<br>')}</p>`:''}<div class="foot">말씀대로 살아내고, 서로를 살려내는 공동체 · 에코디교회</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))<\/script></body></html>`;
}
function openBulletin(pack){const blob=new Blob([bulletinHtml(pack)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);setStatus('주보 인쇄본을 열었습니다.')}
async function loadPptx(){
  if(window.PptxGenJS)return window.PptxGenJS;
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';s.onload=resolve;s.onerror=()=>reject(new Error('PPT 엔진을 불러오지 못했습니다.'));document.head.append(s)});
  if(!window.PptxGenJS)throw new Error('PPT 엔진을 사용할 수 없습니다.');return window.PptxGenJS;
}
async function makePpt(pack){
  setStatus('PPTX를 만들고 있습니다…');const PptxGenJS=await loadPptx(),pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='EKODI Church';pptx.subject=label(pack.kind);pptx.title=pack.sermonTitle||pack.title;pptx.company='EKODI Church';pptx.lang='ko-KR';
  const addTitle=(slide,title,subtitle='')=>{slide.addText(title,{x:.75,y:1.7,w:11.8,h:1.2,fontSize:32,bold:true,margin:0});if(subtitle)slide.addText(subtitle,{x:.8,y:3.1,w:11.6,h:1,fontSize:18,margin:0})};
  let slide=pptx.addSlide();addTitle(slide,pack.sermonTitle||pack.title,`${formatDate(pack.date)} · ${label(pack.kind)}${pack.preacher?` · ${pack.preacher}`:''}`);slide=pptx.addSlide();addTitle(slide,pack.scripture||'오늘의 말씀','본문');
  const order=pack.order.length?pack.order:['환영과 시작','찬양','기도','말씀','나눔과 결단','광고·교제'];slide=pptx.addSlide();slide.addText('모임 순서',{x:.7,y:.55,w:11.8,h:.7,fontSize:27,bold:true});slide.addText(order.map((text,i)=>`${i+1}. ${text}`).join('\n'),{x:1,y:1.55,w:11,h:5,fontSize:22,margin:.08});
  if(pack.announcements){slide=pptx.addSlide();slide.addText('알림',{x:.7,y:.55,w:11.8,h:.7,fontSize:27,bold:true});slide.addText(pack.announcements,{x:1,y:1.55,w:11,h:4.8,fontSize:21,margin:.08})}
  slide=pptx.addSlide();addTitle(slide,'말씀대로 살아내고, 서로를 살려내는 공동체','에코디교회');await pptx.writeFile({fileName:`EKODI_${label(pack.kind)}_${yymmdd(pack.date)||'meeting'}.pptx`});setStatus('PPTX를 만들었습니다.');
}
async function prepareAll(pack){openBulletin(pack);await makePpt(pack);const live=buildLive(pack);await copy(`${buildHomepage(pack)}\n\n--- 라이브 ---\n${live.title}\n${live.description}`,'주보·PPTX를 만들고 홈페이지/라이브 문안을 복사했습니다.')}
async function onClick(event){
  const select=event.target.closest('[data-cmo-select]');if(select){const chosen=state.services.find(item=>item.id===select.dataset.cmoSelect);if(chosen){state.selected=chosen;render()}return}
  const action=event.target.closest('[data-cmo-action]')?.dataset.cmoAction;if(!action)return;const pack=activePack();if(!pack)return;
  try{if(action==='bulletin')openBulletin(pack);if(action==='ppt')await makePpt(pack);if(action==='homepage')await copy(buildHomepage(pack),'홈페이지용 문안을 복사했습니다.');if(action==='live'){const live=buildLive(pack);await copy(`${live.title}\n\n${live.description}`,'라이브 제목·설명을 복사했습니다.');window.open(LIVE_URL,'_blank','noopener')}if(action==='all')await prepareAll(pack)}catch(error){console.error('[EKODI Church Meeting Ops]',error);setStatus(error?.message||'준비 중 오류가 발생했습니다.')}
}
const observer=new MutationObserver(()=>{const key=selectedChurchWorkspace();if(key!==state.workspaceKey)void verifyAndLoad()});const workspaces=q('#workspaceList');if(workspaces)observer.observe(workspaces,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('ekodi:my-session',()=>void verifyAndLoad());window.addEventListener('pageshow',()=>void verifyAndLoad());setTimeout(()=>void verifyAndLoad(),0);
