// EKODIBIZ Business Center is loaded only inside an authenticated workspace-admin view.
// The SQL migration provides tenant-bound RLS and append-only audit, not browser storage.
export const BIZ_CENTER_VERSION = '20261014-compact-v2';

const STYLE = String.raw`
.ebiz{color:#18323e;font-size:14px;line-height:1.3;display:grid;gap:9px;min-width:0}
.ebiz *{box-sizing:border-box}
.ebiz h2,.ebiz h3,.ebiz p{margin:0}
.ebiz .ebiz-title{font-size:21px;letter-spacing:-.035em;line-height:1.22}
.ebiz .ebiz-sub{font-size:13px;color:#6e8088}
.ebiz .ebiz-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.ebiz .ebiz-actions{display:flex;align-items:center;flex-wrap:wrap;gap:5px}
.ebiz button,.ebiz input,.ebiz select,.ebiz textarea{font:inherit}
.ebiz .ebiz-btn{min-height:40px;border:1px solid #ccdcd9;background:#fff;color:#254b49;border-radius:8px;padding:7px 11px;cursor:pointer;text-align:center;font-weight:700}
.ebiz .ebiz-btn.primary{background:#245d50;color:#fff;border-color:#245d50}
.ebiz .ebiz-btn:disabled{opacity:.55;cursor:not-allowed}
.ebiz .ebiz-btn:focus-visible,.ebiz input:focus-visible,.ebiz select:focus-visible{outline:3px solid #75bfa5;outline-offset:2px}
.ebiz .ebiz-nav{display:flex;gap:5px;overflow-x:auto;padding:1px 0 5px;border-bottom:1px solid #e5ecea;scrollbar-width:thin}
.ebiz .ebiz-tab{border:1px solid #dce7e4;background:#fff;color:#426267;border-radius:8px;padding:7px 11px;min-height:40px;white-space:nowrap;cursor:pointer}
.ebiz .ebiz-tab[aria-current="page"]{color:#fff;background:#25584f;border-color:#25584f;font-weight:800}
.ebiz .ebiz-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
.ebiz .ebiz-stat{border:1px solid #e0e8e6;border-radius:10px;padding:11px;background:#fff}
.ebiz .ebiz-stat small{display:block;color:#6b8087;font-size:12px}
.ebiz .ebiz-stat strong{display:block;margin-top:3px;font-size:25px;letter-spacing:-.05em;line-height:1.1}
.ebiz .ebiz-card{background:#fff;border:1px solid #e0e8e6;border-radius:10px;padding:12px}
.ebiz .ebiz-cols{display:grid;grid-template-columns:1.3fr 1fr;gap:8px}
.ebiz .ebiz-line{display:flex;align-items:start;justify-content:space-between;gap:7px;padding:7px 0;border-bottom:1px solid #ecf1ef}
.ebiz .ebiz-line:last-child{border:0}
.ebiz .ebiz-line strong{display:block;font-size:14px}
.ebiz .ebiz-line small{display:block;color:#809198;font-size:12px;margin-top:1px}
.ebiz .ebiz-chip{display:inline-flex;background:#e9f4ec;color:#29694c;border-radius:6px;padding:3px 8px;font-size:11px;white-space:nowrap}
.ebiz .ebiz-chip.warn{background:#fcf3e3;color:#956323}
.ebiz .ebiz-chip.neutral{background:#f0f3f4;color:#677e86}
.ebiz .ebiz-note{padding:8px 10px;border:1px solid #d3e8de;background:#eff7f1;border-radius:8px;color:#356c57;font-size:13px}
.ebiz .ebiz-warning{padding:8px 10px;border:1px solid #e7c9a6;background:#fff8e9;border-radius:8px;color:#825b30}
.ebiz .ebiz-empty{padding:15px 8px;color:#758891;text-align:center;font-size:13px}
.ebiz .ebiz-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:7px 0}
.ebiz .ebiz-tools input{min-height:42px;flex:1 1 190px;border:1px solid #d5e1df;border-radius:8px;padding:9px 11px}
.ebiz .ebiz-tablewrap{overflow-x:auto}
.ebiz table{width:100%;border-collapse:collapse;min-width:610px}
.ebiz th,.ebiz td{text-align:left;border-bottom:1px solid #e8eeec;padding:7px 8px;vertical-align:middle;white-space:normal;line-height:1.3}
.ebiz th{font-size:12px;color:#627a83;background:#f7faf8}
.ebiz td{font-size:13px;color:#2d4955}
.ebiz td small{display:block;color:#8b9ba1}
.ebiz .ebiz-input,.ebiz select,.ebiz textarea{width:100%;min-height:42px;border:1px solid #d2dfdc;border-radius:8px;background:#fff;color:#17313a;padding:9px}
.ebiz label{display:grid;gap:3px;color:#4b6873;font-size:13px;font-weight:650}
.ebiz .ebiz-form{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:11px;border:1px solid #dce8e4;background:#f7faf8;border-radius:9px}
.ebiz .ebiz-wide{grid-column:1/-1}
.ebiz .ebiz-form-actions{display:flex;gap:8px;flex-wrap:wrap}
.ebiz .ebiz-mini{min-height:35px!important;font-size:12px!important;padding:5px 8px!important}
.ebiz .ebiz-links{display:flex;gap:8px;flex-wrap:wrap}
.ebiz .ebiz-links a{border:1px solid #dce6e5;border-radius:8px;padding:10px 12px;color:#315d56;text-decoration:none;font-weight:650}
.ebiz .ebiz-print-shade[hidden]{display:none!important}
.ebiz .ebiz-print-shade{position:fixed;inset:0;background:#092129b8;z-index:2147483600;display:flex;justify-content:center;align-items:start;overflow:auto;padding:20px}
.ebiz .ebiz-print-frame{background:#eff2f2;border-radius:11px;padding:15px;width:min(750px,100%)}
.ebiz .ebiz-print-tools{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.ebiz #ebiz-print-sheet{padding:44px;background:#fff;color:#122b34;min-height:700px}
.ebiz #ebiz-print-sheet h2{text-align:center;font-size:20px;margin:18px 0 12px;line-height:1.25}
.ebiz #ebiz-print-sheet table{min-width:0;font-size:11px}
.ebiz #ebiz-print-sheet td,.ebiz #ebiz-print-sheet th{font-size:11px}
.ebiz #ebiz-print-sheet .ebiz-print-heading{font-weight:800;border-bottom:2px solid #23424a;padding-bottom:12px}
@media(max-width:1000px){.ebiz .ebiz-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ebiz .ebiz-cols{grid-template-columns:1fr}}
@media(max-width:570px){.ebiz .ebiz-grid{grid-template-columns:1fr 1fr}.ebiz .ebiz-stat{padding:12px}.ebiz .ebiz-stat strong{font-size:23px}.ebiz .ebiz-form{grid-template-columns:1fr}.ebiz .ebiz-wide{grid-column:1}.ebiz .ebiz-print-shade{padding:6px}.ebiz #ebiz-print-sheet{padding:15px}.ebiz .ebiz-title{font-size:19px}}
@media print {
  @page{size:A4;margin:14mm}
  body *{visibility:hidden!important}
  .ebiz .ebiz-print-shade,.ebiz .ebiz-print-shade #ebiz-print-sheet,.ebiz .ebiz-print-shade #ebiz-print-sheet *{visibility:visible!important}
  .ebiz .ebiz-print-shade{position:absolute!important;inset:0!important;display:block!important;overflow:visible!important;background:white!important;padding:0!important}
  .ebiz .ebiz-print-frame{padding:0!important;background:white!important;border:0!important;width:100%!important}
  .ebiz .ebiz-print-tools{display:none!important}
  .ebiz #ebiz-print-sheet{min-height:0!important;padding:0!important}
  .ebiz #ebiz-print-sheet tr{break-inside:avoid}
}
`;

export function businessCenterCss() {
  return new Response(STYLE, {headers:{
    'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300',
    'x-content-type-options':'nosniff'
  }});
}

// Serialized as a first-party on-demand module; never bundled into every admin page.
export function businessCenterScript() {
  return new Response('const __name=(fn,name)=>Object.defineProperty(fn,"name",{value:name,configurable:true});\nexport const mountBusinessCenter = '+mountBusinessCenter.toString()+';\n', {
    headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
  });
}

function mountBusinessCenter({target,summaryTarget,accessToken,supabaseUrl,supabaseKey,adminBase,role}) {
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const number=value=>new Intl.NumberFormat('ko-KR').format(value);
  const dte=value=>value?String(value).slice(0,10):'—';
  const labels={admin:'사업자·행정',project:'사업·프로젝트',education:'교육·강의',finance:'재무·증빙',document:'문서·인쇄',task:'점검·승인',history:'보고·이력'};
  const statusText={planned:'준비',in_progress:'진행',review:'검토',done:'완료',archived:'보관'};
  const sections=['home','admin','project','education','finance','document','task','history'];
  const state={section:'home',rows:[],audit:[],ready:false,busy:false,filter:'',openForm:false};
  if(!document.getElementById('ebiz-business-center-style')){
    const link=document.createElement('link');link.id='ebiz-business-center-style';link.rel='stylesheet';link.href='/ekodibiz-business-center.css?v=20261014-compact-v2';document.head.append(link);
  }
  summaryTarget.replaceChildren();
  target.classList.add('ebiz');
  target.innerHTML='<div class="ebiz-head"><div><p class="ebiz-sub">EKODIBIZ · BUSINESS CENTER</p><h2 class="ebiz-title">통합 경영·행정 업무센터</h2><p class="ebiz-sub">사업관리 · 문서인쇄 · 점검 · 변경이력 · 보고서</p></div><div class="ebiz-actions"><button class="ebiz-btn" data-eb-action="refresh">새로고침</button><button class="ebiz-btn" data-eb-action="csv">CSV 내보내기</button><button class="ebiz-btn primary" data-eb-action="print">보고서·인쇄</button></div></div><nav class="ebiz-nav" aria-label="에코디비즈 업무영역" id="ebiz-nav"></nav><div id="ebiz-status" role="status" aria-live="polite"></div><div id="ebiz-content"></div><div class="ebiz-print-shade" id="ebiz-print-preview" hidden role="dialog" aria-label="보고서 인쇄 미리보기" aria-modal="true"><div class="ebiz-print-frame"><div class="ebiz-print-tools"><strong>인쇄 · PDF 저장 미리보기</strong><div class="ebiz-actions"><button class="ebiz-btn" data-eb-action="close">닫기</button><button class="ebiz-btn primary" data-eb-action="confirmprint">브라우저 인쇄·PDF</button></div></div><article id="ebiz-print-sheet"></article></div></div>';
  const $=s=>target.querySelector(s);
  const status=(message,error=false)=>{$('#ebiz-status').innerHTML=message?'<div class="'+(error?'ebiz-warning':'ebiz-note')+'">'+esc(message)+'</div>':'';};
  const allKinds=['admin','project','education','finance','document','task'];
  function nav(){ $('#ebiz-nav').innerHTML=sections.map(s=>'<button class="ebiz-tab" data-eb-section="'+s+'" aria-current="'+(state.section===s?'page':'false')+'">'+(s==='home'?'통합 현황':labels[s])+'</button>').join('');}
  async function request(path,opts={}){
    const token=await accessToken();
    if(!token)throw new Error('로그인 만료. 관리자 로그인을 다시 진행하세요.');
    const response=await fetch(supabaseUrl+path,{
      method:opts.method||'GET',cache:'no-store',headers:{
        apikey:supabaseKey,authorization:'Bearer '+token,'content-type':'application/json',
        ...(opts.method&&opts.method!=='GET'?{'prefer':'return=representation'}:{})
      },...(opts.body?{body:JSON.stringify(opts.body)}:{})
    });
    const text=await response.text();
    let data;try{data=text?JSON.parse(text):null}catch{data=null}
    if(!response.ok)throw new Error(response.status===404?'업무 원장이 아직 배포되지 않았습니다. 데이터베이스 마이그레이션을 확인하세요.':(data?.message||'업무 원장 오류 ('+response.status+')'));
    return data;
  }
  async function refresh(){
    status('관리자 전용 업무 원장을 조회하고 있습니다.');
    try{
      const [rows,audit]=await Promise.all([
        request('/rest/v1/ekodibiz_ops_items?select=id,kind,title,details,status,due_on,reference,created_at,updated_at&order=updated_at.desc&limit=250'),
        request('/rest/v1/ekodibiz_ops_audit?select=id,item_id,action,occurred_at&order=occurred_at.desc&limit=60')
      ]);
      state.rows=Array.isArray(rows)?rows:[];state.audit=Array.isArray(audit)?audit:[];state.ready=true;
      status('');paint();
    }catch(e){state.ready=false;state.rows=[];state.audit=[];status(e.message,true);paint()}
  }
  function kpis(){
    const rows=state.rows.filter(r=>r.status!=='archived');
    const active=rows.filter(r=>r.status==='in_progress'||r.status==='review').length;
    const toDo=rows.filter(r=>r.kind==='task'&&r.status!=='done').length;
    const missing=rows.filter(r=>r.due_on&&r.due_on<new Date().toISOString().slice(0,10)&&r.status!=='done').length;
    const stats=[['관리 항목',rows.length],['진행·검토',active],['미완료 점검',toDo],['기한 지난 업무',missing]];
    return '<div class="ebiz-grid">'+stats.map(([name,value])=>'<div class="ebiz-stat"><small>'+name+'</small><strong>'+number(value)+'</strong></div>').join('')+'</div>';
  }
  function rowText(r){return '<div><strong>'+esc(r.title)+'</strong><small>'+esc(labels[r.kind]||r.kind)+' · '+esc(statusText[r.status]||r.status)+(r.due_on?' · 기한 '+esc(dte(r.due_on)):'')+'</small></div>'}
  function home(){
    const tasks=state.rows.filter(r=>r.status!=='done'&&r.status!=='archived').slice(0,6);
    const events=state.audit.slice(0,6);
    return kpis()+'<div class="ebiz-cols"><section class="ebiz-card"><div class="ebiz-head"><h3>우선 처리할 업무</h3><button class="ebiz-btn ebiz-mini" data-eb-section="task">전체 보기</button></div>'+(tasks.length?tasks.map(r=>'<div class="ebiz-line">'+rowText(r)+'<span class="ebiz-chip '+(r.status==='review'?'warn':'neutral')+'">'+esc(statusText[r.status])+'</span></div>').join(''):'<div class="ebiz-empty">아직 등록된 업무가 없습니다. 업무를 추가하거나 기본 점검표를 생성하세요.</div>')+'</section><section class="ebiz-card"><div class="ebiz-head"><h3>최근 변경이력</h3><button class="ebiz-btn ebiz-mini" data-eb-section="history">이력 보기</button></div>'+(events.length?events.map(e=>'<div class="ebiz-line"><div><strong>'+esc(actionText(e.action))+'</strong><small>'+esc(dte(e.occurred_at))+'</small></div></div>').join(''):'<div class="ebiz-empty">아직 서버에 기록된 변경이력이 없습니다.</div>')+'</section></div><section class="ebiz-card"><div class="ebiz-head"><h3>빠른 실행</h3></div><div class="ebiz-actions"><button class="ebiz-btn primary" data-eb-action="new">업무 등록</button><button class="ebiz-btn" data-eb-action="seed">기본 점검표 만들기</button><button class="ebiz-btn" data-eb-action="print">종합보고서 인쇄</button></div><p class="ebiz-sub">견적·계약·세금계산서의 원본은 각 전용 서비스에서 관리하며, 이곳에는 진행상태와 참조정보만 기록합니다.</p></section>'+externalLinks();
  }
  function externalLinks(){return '<section class="ebiz-card"><h3>기존 에코디비즈 사업 서비스</h3><div class="ebiz-links"><a href="/ekodimall/admin">에코디몰</a><a href="/ekodibiz/trade/admin">무역관리</a><a href="/ekodibiz/invest/admin">투자관리</a><a href="/tax">세금·증빙</a><a href="/my/docs/">문서도구</a></div></section>'}
  function actionText(action){return ({created:'업무 등록',updated:'업무 변경',print_requested:'인쇄·PDF 화면 요청',csv_requested:'CSV 내보내기 요청'})[action]||'기록'}
  function table(rows){
    return '<div class="ebiz-tablewrap"><table><thead><tr><th>제목·설명</th><th>기한</th><th>상태</th><th>기록일</th><th>수정</th></tr></thead><tbody>'+
      rows.map(r=>'<tr><td><strong>'+esc(r.title)+'</strong><small>'+esc((r.details||'').slice(0,120))+'</small></td><td>'+esc(dte(r.due_on))+'</td><td><span class="ebiz-chip '+(r.status==='done'?'':'neutral')+'">'+esc(statusText[r.status])+'</span></td><td>'+esc(dte(r.updated_at))+'</td><td><div class="ebiz-actions"><button class="ebiz-btn ebiz-mini" data-eb-edit="'+esc(r.id)+'">편집</button><button class="ebiz-btn ebiz-mini" data-eb-print-id="'+esc(r.id)+'">인쇄</button>'+(r.kind==='task'?'<button class="ebiz-btn ebiz-mini" data-eb-check="'+esc(r.id)+'">'+(r.status==='done'?'다시 진행':'완료 체크')+'</button>':'')+'</div></td></tr>').join('')+
      '</tbody></table></div>';
  }
  function history(){
    const logs=state.audit;
    return '<section class="ebiz-card"><h3>변경·출력 요청이력</h3><p class="ebiz-sub">최근 서버 기록 최대 60건. 미리보기 열기/인쇄 요청은 실제 종이 출력 완료를 의미하지 않습니다.</p>'+ (logs.length?'<div class="ebiz-tablewrap"><table><thead><tr><th>일시</th><th>행위</th><th>대상 ID</th></tr></thead><tbody>'+logs.map(e=>'<tr><td>'+esc(e.occurred_at?new Date(e.occurred_at).toLocaleString('ko-KR'):'—')+'</td><td>'+esc(actionText(e.action))+'</td><td>'+esc(e.item_id||'전체 보고서')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="ebiz-empty">변경 이력이 없습니다.</div>')+'</section><section class="ebiz-card"><h3>보고·인쇄</h3><div class="ebiz-actions"><button class="ebiz-btn primary" data-eb-action="print">종합보고서 인쇄</button><button class="ebiz-btn" data-eb-action="csv">CSV 내보내기</button></div></section>';
  }
  function form(row=null){
    if(!state.openForm)return '';
    const kind=row?.kind||(state.section==='home'||state.section==='history'?'task':state.section);
    return '<form class="ebiz-form" id="ebiz-editor"><input type="hidden" name="id" value="'+esc(row?.id||'')+'"><label>관리 분야<select name="kind" required>'+allKinds.map(k=>'<option value="'+k+'" '+(kind===k?'selected':'')+'>'+esc(labels[k])+'</option>').join('')+'</select></label><label>진행 상태<select name="status" required>'+Object.keys(statusText).map(k=>'<option value="'+k+'" '+((row?.status||'planned')===k?'selected':'')+'>'+statusText[k]+'</option>').join('')+'</select></label><label class="ebiz-wide">제목<input class="ebiz-input" maxlength="200" minlength="2" name="title" required value="'+esc(row?.title||'')+'"></label><label class="ebiz-wide">상세 내용<textarea name="details" rows="3" maxlength="8000">'+esc(row?.details||'')+'</textarea></label><label>기한<input class="ebiz-input" name="due_on" type="date" value="'+esc(row?.due_on||'')+'"></label><label>참조번호·문서명<input class="ebiz-input" name="reference" maxlength="400" value="'+esc(row?.reference||'')+'"></label><div class="ebiz-form-actions ebiz-wide"><button class="ebiz-btn primary" type="submit">'+(row?'변경 저장':'새 항목 저장')+'</button><button class="ebiz-btn" type="button" data-eb-action="cancel">취소</button></div></form>';
  }
  function listView(){
    const view=state.section,rows=state.rows.filter(r=>r.kind===view && r.status!=='archived'&&(!state.filter||(r.title+' '+r.details).toLowerCase().includes(state.filter))).slice(0,250);
    return '<section class="ebiz-card"><div class="ebiz-head"><div><h3>'+esc(labels[view])+' 관리대장</h3><p class="ebiz-sub">기록된 업무를 검색·편집하고 변경이력을 보존합니다.</p></div><button class="ebiz-btn primary" data-eb-action="new">새 항목 등록</button></div><div class="ebiz-tools"><input id="ebiz-filter" type="search" aria-label="업무 검색" placeholder="제목이나 설명 검색" value="'+esc(state.filter)+'"><span class="ebiz-sub">'+number(rows.length)+'건 표시</span></div>'+form(state.rows.find(r=>r.id===state.openForm)||null)+'<div id="ebiz-list-results">'+(rows.length?table(rows):'<div class="ebiz-empty">등록된 항목이 없습니다.</div>')+'</div></section>'+((view==='finance')?externalLinks():'');
  }
  function paint(){
    nav();
    if(!state.ready){$('#ebiz-content').innerHTML='<section class="ebiz-card"><h3>업무 원장 연결 필요</h3><p class="ebiz-sub">운영 데이터를 확인할 수 있을 때만 기록과 보고서를 표시합니다. 임시 수치로 대체하지 않습니다.</p></section>';return}
    $('#ebiz-content').innerHTML=state.section==='home'?home():state.section==='history'?history():listView();
  }
  async function save(formElement){
    if(state.busy)return;
    const data=new FormData(formElement),id=String(data.get('id')||'');
    const kind=String(data.get('kind')||''),statusValue=String(data.get('status')||'');
    const title=String(data.get('title')||'').trim(),details=String(data.get('details')||'').trim(),reference=String(data.get('reference')||'').trim();
    const due_on=String(data.get('due_on')||'')||null;
    if(!allKinds.includes(kind)||!Object.keys(statusText).includes(statusValue)||title.length<2||title.length>200)throw new Error('입력 항목을 확인하세요.');
    const body={kind,status:statusValue,title,details,reference,due_on};
    state.busy=true;try{
      const saved=await request('/rest/v1/ekodibiz_ops_items'+(id?'?id=eq.'+encodeURIComponent(id):''),{method:id?'PATCH':'POST',body});
      if(!Array.isArray(saved)||saved.length!==1)throw new Error('업무 저장 결과를 확인할 수 없습니다. 다시 조회하세요.');
      state.openForm=false;state.filter='';await refresh();status('서버 원장에 저장하고 변경이력을 기록했습니다.');
    }finally{state.busy=false}
  }
  async function seed(){
    if(state.busy||!state.ready)return;
    const tasks=['소프트웨어 개발업 업종 추가 여부 확인','AI 교육사업 인허가 해당 여부 확인','프로그램 개발 표준계약서 검토','교육 결과보고서 표준양식 검토'];
    const missing=tasks.filter(title=>!state.rows.some(r=>r.title===title));
    if(!missing.length){status('기본 점검표는 이미 등록되어 있습니다.');return}
    state.busy=true;
    try{
      for(const title of missing)await request('/rest/v1/ekodibiz_ops_items',{method:'POST',body:{kind:'task',title,status:'planned',details:'기본 업무 점검표. 실제 확인 후 완료 상태로 변경하세요.'}});
      await refresh();status('기본 점검표 '+missing.length+'건을 서버에 등록했습니다.');
    }finally{state.busy=false}
  }
  async function logOutput(action){await request('/rest/v1/rpc/ekodibiz_ops_log_output',{method:'POST',body:{p_action:action}})}
  function reportHtml(recordId=null){
    const rows=state.rows.filter(r=>r.status!=='archived'&&(recordId?r.id===recordId:(state.section==='home'||state.section==='history'||r.kind===state.section))).slice(0,250);
    const dt=new Date().toLocaleDateString('ko-KR');
    const name=recordId?'개별 업무 기록서':state.section==='home'||state.section==='history'?'종합 경영보고서':labels[state.section]+' 현황표';
    const body=rows.map((r,i)=>'<tr><td>'+number(i+1)+'</td><td>'+esc(labels[r.kind])+'</td><td>'+esc(r.title)+'</td><td>'+esc(statusText[r.status])+'</td><td>'+esc(dte(r.due_on))+'</td></tr>').join('');
    return '<div class="ebiz-print-heading">EKODIBIZ · BUSINESS CENTER</div><h2>'+esc(name)+'</h2><p>사업자: 에코디비즈　|　작성 기준: '+esc(dt)+'</p><p>관리기록: '+number(rows.length)+'건 (최근 최대 250건)　|　작성 상태: 조회 시점 보고서</p><div class="ebiz-tablewrap"><table><thead><tr><th>No.</th><th>분야</th><th>제목</th><th>상태</th><th>기한</th></tr></thead><tbody>'+body+'</tbody></table></div><p>※ 원장에 등록된 관리 기록을 기준으로 생성합니다. 금융·세무 확정자료를 대체하지 않습니다.</p>';
  }
  async function openReport(recordId=null){if(!state.ready)return status('업무 원장 연결 후 출력할 수 있습니다.',true);if(recordId&&!state.rows.some(r=>r.id===recordId))throw new Error('인쇄할 업무 기록을 찾을 수 없습니다.');await logOutput('print_requested');$('#ebiz-print-sheet').innerHTML=reportHtml(recordId);$('#ebiz-print-preview').hidden=false;$('#ebiz-print-preview').querySelector('[data-eb-action="close"]')?.focus()}
  function closeReport(){$('#ebiz-print-preview').hidden=true;}
  function csvSafe(value){let s=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  async function csv(){
    if(!state.ready)return status('업무 원장 연결 후 출력할 수 있습니다.',true);
    await logOutput('csv_requested');
    const rows=state.rows.filter(r=>state.section==='home'||state.section==='history'||r.kind===state.section);
    const header=['분야','제목','상태','기한','설명','참조','변경일'];
    const cells=rows.map(r=>[labels[r.kind],r.title,statusText[r.status],r.due_on||'',r.details||'',r.reference||'',r.updated_at||'']);
    const blob=new Blob(['\ufeff'+[header,...cells].map(c=>c.map(csvSafe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ekodibiz-business-center.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('CSV 내려받기 요청을 기록했습니다.');
  }
  target.addEventListener('click',async ev=>{
    const section=ev.target.closest('[data-eb-section]');if(section){state.section=section.dataset.ebSection;state.filter='';state.openForm=false;paint();return}
    const edit=ev.target.closest('[data-eb-edit]');if(edit){state.openForm=edit.dataset.ebEdit;paint();$('#ebiz-editor')?.scrollIntoView({block:'nearest'});return}
    const printRecord=ev.target.closest('[data-eb-print-id]');if(printRecord){try{await openReport(printRecord.dataset.ebPrintId)}catch(err){status(err.message,true)}return}
    const check=ev.target.closest('[data-eb-check]');if(check){try{if(state.busy)return;const row=state.rows.find(r=>r.id===check.dataset.ebCheck&&r.kind==='task');if(!row)throw new Error('업무 원장을 다시 조회하세요.');state.busy=true;const saved=await request('/rest/v1/ekodibiz_ops_items?id=eq.'+encodeURIComponent(row.id),{method:'PATCH',body:{status:row.status==='done'?'in_progress':'done'}});if(!Array.isArray(saved)||saved.length!==1)throw new Error('업무 상태 변경이 저장되지 않았습니다.');await refresh();status('점검 완료 상태 및 이력이 저장되었습니다.')}catch(err){status(err.message,true)}finally{state.busy=false}return}
    const btn=ev.target.closest('[data-eb-action]');if(!btn)return;
    const action=btn.dataset.ebAction;
    try{
      if(action==='new'){if(state.section==='home'||state.section==='history')state.section='task';state.openForm='new';paint()}
      if(action==='cancel'){state.openForm=false;paint()}
      if(action==='refresh')await refresh();
      if(action==='seed')await seed();
      if(action==='print')await openReport();
      if(action==='close')closeReport();
      if(action==='confirmprint')window.print();
      if(action==='csv')await csv();
    }catch(err){status(err?.message||'처리 중 오류가 발생했습니다.',true)}
  });
  target.addEventListener('submit',async ev=>{
    if(ev.target.id!=='ebiz-editor')return;
    ev.preventDefault();
    try{await save(ev.target)}catch(error){status(error.message,true)}
  });
  target.addEventListener('input',ev=>{
    if(ev.target.id!=='ebiz-filter')return;
    const index=ev.target.selectionStart,query=ev.target.value;
    state.filter=query.trim().toLowerCase();
    // Only the table is repainted so typing keeps focus and selection.
    const view=state.section;
    const rows=state.rows.filter(r=>r.kind===view&&r.status!=='archived'&&(!state.filter||(r.title+' '+r.details).toLowerCase().includes(state.filter)));
    const panel=ev.target.closest('.ebiz-card');
    const results=panel?.querySelector('#ebiz-list-results');
    if(results)results.innerHTML=rows.length?tableMarkup(rows):'<div class="ebiz-empty">검색 결과가 없습니다.</div>';
    const counter=ev.target.parentElement?.querySelector('span');
    if(counter)counter.textContent=number(rows.length)+'건 표시';
    ev.target.setSelectionRange(index,index);
  });
  function tableMarkup(rows){return table(rows)}
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#ebiz-print-preview')&&!$('#ebiz-print-preview').hidden)closeReport()});
  paint();refresh();
}
