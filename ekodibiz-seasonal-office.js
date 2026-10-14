// EKODIBIZ seasonal workers business office: private records, no worker PII.
const ROOT='/ekodibiz/seasonal-workers';
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const PUBLIC_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CATEGORIES=Object.freeze([
  ['strategy','사업기획'],['local','지자체 · MOU'],['overseas','해외 협력기관'],
  ['demand','수요조사'],['welfare','근로자 지원·현장관리'],['documents','자료·근거'],['tasks','일정·업무']
]);
const STATUSES=Object.freeze(['draft','review','active','done']);
const EDIT_ROLES=new Set(['owner','store_owner','tenant_admin','workspace_admin','client_admin','admin','manager','hq_manager','client_editor']);
const HEADERS=Object.freeze({'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow, noarchive','x-frame-options':'DENY'});
const INITIAL_SOURCE=Object.freeze({
  title:'계절 근로자 관리체계 개선 제안서',
  category:'documents',status:'review',sourceType:'2026-10-14 대화에서 공유된 HWP 제안서',
  originalStored:false,
  summary:'지자체 MOU 전문지원, 해외 송출기관 검토, 농가 수요 조사, 전담관리자와 소통체계, 불법 수수료 방지 및 근로자 처우 개선을 제안하는 자료입니다.',
  reviewPoints:['해외 기관·POH 계약 및 MOU 사실관계 확인','2026년 적용 법령·계절근로 체류자격·장기체류 전환 요건 확인','송출 수수료·보증금 제안의 적법성 및 인권 영향 검토','2023년 파견 실적 및 2027년 협의 계획 증빙 확보'],
});
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}})}
function fail(status,code){return json({ok:false,error:code},status)}
function clean(v,n=150){return String(v??'').trim().slice(0,n)}
function validUrl(v){if(!v)return '';try{const u=new URL(String(v));return u.protocol==='https:'&&u.username===''&&u.password===''&&u.href.length<=2048?u.href:''}catch{return ''}}
function bodyLimit(request){const size=Number(request.headers.get('content-length')||'0');return size>16384}
async function actor(request,env,fetcher=fetch){
  const header=request.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/i.test(header))return null;
  const token=header.slice(7);
  const key=String(env?.SUPABASE_PUBLISHABLE_KEY||PUBLIC_KEY);
  const headers={apikey:key,authorization:'Bearer '+token,'content-type':'application/json'};
  const [userRes,contextRes]=await Promise.all([
    fetcher(SUPABASE+'/auth/v1/user',{headers,cache:'no-store'}),
    fetcher(SUPABASE+'/rest/v1/rpc/current_site_activity_contexts',{method:'POST',headers,body:'{}',cache:'no-store'})
  ]);
  if(!userRes.ok||!contextRes.ok)return null;
  const user=await userRes.json().catch(()=>null);
  const raw=await contextRes.json().catch(()=>null);
  if(!user?.id||!user?.email||!Array.isArray(raw))return null;
  const context=raw.find(item=>['ekodi-biz','ekodibiz'].includes(String(item?.tenant||'').toLowerCase())&&item.tenant_id);
  if(!context)return null;
  return {userId:String(user.id),email:String(user.email).slice(0,254),workspaceId:String(context.tenant_id),role:String(context.authorization_role||'').toLowerCase(),canEdit:EDIT_ROLES.has(String(context.authorization_role||'').toLowerCase())};
}
export function isSeasonalOfficePath(pathname){return pathname===ROOT||pathname===ROOT+'/'||pathname===ROOT+'/app.js'||pathname===ROOT+'/api/records'||pathname===ROOT+'/api/activity'}
export async function seasonalOfficeApi(request,env,fetcher=fetch){
  const path=new URL(request.url).pathname;
  if(![ROOT+'/api/records',ROOT+'/api/activity'].includes(path))return null;
  if(!['GET','POST','PATCH'].includes(request.method))return fail(405,'METHOD_NOT_ALLOWED');
  if(path===ROOT+'/api/activity'&&request.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
  if(bodyLimit(request))return fail(413,'BODY_TOO_LARGE');
  let person;
  try{person=await actor(request,env,fetcher)}catch{return fail(503,'IDENTITY_UNAVAILABLE')}
  if(!person)return fail(401,'WORKSPACE_LOGIN_REQUIRED');
  if(!env?.DB)return fail(503,'DATA_STORE_UNAVAILABLE');
  const write=request.method!=='GET';
  if(write&&!person.canEdit)return fail(403,'EDITOR_ROLE_REQUIRED');
  if(write&&!String(request.headers.get('content-type')||'').includes('application/json'))return fail(415,'JSON_REQUIRED');
  try{
    if(path.endsWith('/activity')){
      const {results=[]}=await env.DB.prepare('SELECT id,record_id,action,actor_email,created_at FROM seasonal_office_audit WHERE workspace_id=? ORDER BY created_at DESC LIMIT 35').bind(person.workspaceId).all();
      return json({ok:true,activity:results});
    }
    if(request.method==='GET'){
      const {results=[]}=await env.DB.prepare('SELECT id,category,title,summary,status,reference_url,target_date,created_at,updated_at FROM seasonal_office_records WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 250').bind(person.workspaceId).all();
      return json({ok:true,actor:{email:person.email,role:person.role,canEdit:person.canEdit},records:results,initialSource:INITIAL_SOURCE,categories:CATEGORIES,statuses:STATUSES});
    }
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body))return fail(400,'INVALID_JSON');
    const title=clean(body.title,180);
    const category=clean(body.category,30);
    const status=clean(body.status||'draft',20);
    const summary=clean(body.summary,4000);
    const rawUrl=clean(body.referenceUrl,2048),referenceUrl=validUrl(rawUrl);
    const targetDate=clean(body.targetDate,10);
    if(title.length<2||!CATEGORIES.some(x=>x[0]===category)||!STATUSES.includes(status)||rawUrl&&!referenceUrl||targetDate&&!/^\d{4}-\d\d-\d\d$/.test(targetDate))return fail(400,'INVALID_RECORD');
    if(request.method==='POST'){
      const id=crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO seasonal_office_records (id,workspace_id,category,title,summary,status,reference_url,target_date,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,person.workspaceId,category,title,summary,status,referenceUrl,targetDate,person.userId),
        env.DB.prepare('INSERT INTO seasonal_office_audit (id,workspace_id,record_id,action,actor_email) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),person.workspaceId,id,'created',person.email)
      ]);
      return json({ok:true,id},201);
    }
    const id=clean(body.id,80);
    if(!/^[a-f0-9-]{36}$/i.test(id))return fail(400,'INVALID_ID');
    const existing=await env.DB.prepare('SELECT id FROM seasonal_office_records WHERE id=? AND workspace_id=?').bind(id,person.workspaceId).first();
    if(!existing)return fail(404,'RECORD_NOT_FOUND');
    await env.DB.batch([
      env.DB.prepare('UPDATE seasonal_office_records SET category=?,title=?,summary=?,status=?,reference_url=?,target_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?').bind(category,title,summary,status,referenceUrl,targetDate,id,person.workspaceId),
      env.DB.prepare('INSERT INTO seasonal_office_audit (id,workspace_id,record_id,action,actor_email) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),person.workspaceId,id,'updated',person.email)
    ]);
    return json({ok:true,id});
  }catch(e){console.error('seasonal office storage:',String(e?.message||e).slice(0,150));return fail(503,'OFFICE_STORE_NOT_READY')}
}
const STYLES = [
  ':root{font-family:Inter,Pretendard,system-ui,sans-serif;--ink:#172b29;--muted:#647875;--line:#e3e9e6;--paper:#fff;--green:#166454;--bg:#f5f8f6}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.62}a{color:inherit}button,input,select,textarea{font:inherit}',
  '.shell{display:grid;grid-template-columns:242px minmax(0,1fr);min-height:100vh}.side{background:#153832;color:#eefaf5;padding:29px 17px;display:flex;flex-direction:column;gap:22px}.brand{font-size:17px;letter-spacing:.03em;font-weight:850;text-decoration:none}.sub{display:block;color:#b6d2c9;font-size:11px;font-weight:500}.nav{display:grid;gap:5px}.nav button{background:transparent;border:0;color:#c8d9d3;border-radius:10px;padding:11px 12px;text-align:left;cursor:pointer}.nav button.active{background:#2b5a50;color:#fff;font-weight:800}.aside-note{margin-top:auto;color:#b6d2c9;font-size:11px}',
  '.main{min-width:0;padding:28px clamp(16px,3vw,48px) 64px;max-width:1480px;width:100%;margin:0 auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:21px}.crumb{font-weight:800;color:#58766e}.top-actions{display:flex;gap:8px;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 15px;text-decoration:none;border:1px solid #cddbd5;border-radius:11px;background:#fff;color:var(--ink);cursor:pointer;font-weight:700}.button.primary{background:var(--green);border-color:var(--green);color:#fff}.button:disabled{opacity:.5;cursor:not-allowed}',
  '.hero{margin:37px 0 25px}.eyebrow{color:var(--green);font-weight:850;font-size:11px;letter-spacing:.14em}.hero h1{font-size:clamp(30px,4vw,51px);margin:8px 0;letter-spacing:-.055em;line-height:1.15;word-break:keep-all}.hero p{font-size:15px;color:var(--muted);margin:8px 0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.panel{background:var(--paper);padding:22px;border:1px solid var(--line);border-radius:17px;min-width:0}.panel h2{font-size:17px;letter-spacing:-.02em;margin:0 0 13px}.number{font-weight:850;font-size:31px}.helper{color:var(--muted);font-size:12px}.wide{grid-column:1/-1}.stack{display:grid;gap:10px}.record{padding:13px;border:1px solid var(--line);border-radius:12px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start}.record h3{font-size:14px;margin:0 0 5px}.record p{margin:0;color:var(--muted);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.tag{font-size:11px;white-space:nowrap;padding:4px 9px;border-radius:100px;background:#e9f2ee;color:#275b4b;font-weight:700}.tag.review{background:#fff1d9;color:#8d641b}.tag.draft{background:#eef1f2;color:#5e6a6d}.tag.done{background:#e1f3e7;color:#326a45}.source{border-left:4px solid #b78c4b}.note{background:#fffaf0;border:1px solid #eedebc;border-radius:13px;padding:16px;color:#694d24;font-size:12px}.hidden{display:none!important}',
  '.editor{display:grid;gap:12px}.editor label{display:grid;gap:5px;color:var(--muted);font-weight:700;font-size:12px}.editor input,.editor select,.editor textarea{width:100%;border:1px solid #cedbd5;border-radius:10px;background:#fff;color:var(--ink);padding:10px}.editor textarea{min-height:120px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.full{grid-column:1/-1}.status{min-height:19px;font-size:12px;color:#8b4a26}.simple{max-width:620px}.ref{font-size:11px;color:var(--muted)}',
  '@media(max-width:980px){.shell{grid-template-columns:1fr}.side{padding:16px;gap:10px}.nav{display:flex;overflow-x:auto}.nav button{white-space:nowrap}.aside-note{display:none}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.main{padding-top:20px}}',
  '@media(max-width:620px){.grid,.fields{grid-template-columns:1fr}.full{grid-column:auto}.panel{padding:17px}.hero{margin-top:25px}.top{align-items:flex-start}.record{display:grid}.main{padding-inline:14px}}'
].join('');
export function seasonalOfficePage(){
  const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>계절근로자사업 웹오피스 · 에코디비즈</title><style>'+STYLES+'</style></head><body><div class="shell" data-ekodi-workspace="ekodi-biz" data-ekodi-business-unit="seasonal-workers"><aside class="side"><a class="brand" href="/ekodibiz">EKODIBIZ<span class="sub">SEASONAL WORKERS OFFICE</span></a><nav id="nav" class="nav" aria-label="업무 분류"></nav><p class="aside-note">권한 있는 협력과 근로자의 존엄을 우선합니다.<br>민감한 개인자료는 등록하지 않습니다.</p></aside><main class="main"><header class="top"><div class="crumb">에코디비즈 / 계절근로자사업</div><div class="top-actions"><a class="button" href="/ekodibiz">비즈 홈</a><span class="button" id="account">인증 확인 중</span><button type="button" id="signOut" class="button hidden">로그아웃</button><button id="new" class="button primary hidden" type="button">새 기록</button></div></header><div class="hero"><span class="eyebrow">PRIVATE BUSINESS OFFICE</span><h1 id="pageTitle">계절근로자사업</h1><p id="pageSubtitle">지자체 협력부터 현장 지원까지 기록과 근거를 함께 관리합니다.</p></div><div id="notice" role="status" class="status"></div><section id="content" class="grid"><article class="panel wide"><h2>보호된 업무공간</h2><p class="helper">계정을 확인하고 있습니다.</p></article></section></main></div><script type="module" src="'+ROOT+'/app.js"></script></body></html>';
  return new Response(html,{headers:{...HEADERS,'content-type':'text/html; charset=utf-8'}});
}
function browserApp(){
  const ROOT='/ekodibiz/seasonal-workers';
  const KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const SERVICE='https://renzehysxirjilvdxacv.supabase.co';
  const tabs=[['overview','종합현황'],['strategy','사업기획'],['local','지자체·MOU'],['overseas','해외 협력기관'],['demand','수요조사'],['welfare','현장관리'],['documents','자료·근거'],['tasks','일정·업무']];
  const labels={draft:'초안',review:'검토 필요',active:'진행 중',done:'완료'};
  const $=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  let sb=null,records=[],source=null,role=null,tab='overview',editing=null,activity=[];
  const say=x=>$('notice').textContent=x;
  const authUrl=()=>{const url=new URL('https://ekodi.kr/auth/');url.searchParams.set('site','biz');url.searchParams.set('return_to',location.origin+ROOT);location.assign(url.href)};
  async function api(route,init={}){
    const {data}=await sb.auth.getSession();
    if(!data.session?.access_token)throw new Error('로그인이 필요합니다.');
    const response=await fetch(ROOT+'/api/'+route,{...init,headers:{authorization:'Bearer '+data.session.access_token,...(init.body?{'content-type':'application/json'}:{})},cache:'no-store'});
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(value.error||'요청 오류');
    return value;
  }
  const mainTitle=()=>tab==='overview'?'계절근로자사업':tabs.find(x=>x[0]===tab)?.[1]||'계절근로자사업';
  const recordCard=item=>'<article class="record"><div><h3>'+esc(item.title)+'</h3><p>'+esc(item.summary||'내용 없음')+'</p><span class="ref">'+esc(item.target_date||'')+(item.reference_url?' · <a target="_blank" rel="noopener noreferrer" href="'+esc(item.reference_url)+'">참고 링크</a>':'')+'</span></div><div><span class="tag '+esc(item.status)+'">'+esc(labels[item.status]||item.status)+'</span>'+(role?.canEdit?'<div><button type="button" class="button" data-edit="'+esc(item.id)+'">수정</button></div>':'')+'</div></article>';
  function nav(){
    $('nav').innerHTML=tabs.map(([id,name])=>'<button type="button" class="'+(tab===id?'active':'')+'" data-tab="'+id+'">'+name+'</button>').join('');
    document.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{tab=x.dataset.tab;editing=null;render()});
  }
  function sourceCard(){
    if(!source)return '';
    return '<article class="panel wide source"><span class="eyebrow">공유 자료 · 미검증</span><h2>'+esc(source.title)+'</h2><p class="helper">'+esc(source.summary)+'</p><p class="tag review">원문 파일 서버 보관 미확인 · 원본 연결 대기</p><h3>근거 검토 체크</h3><div class="stack">'+source.reviewPoints.map(x=>'<div class="helper">• '+esc(x)+'</div>').join('')+'</div></article>';
  }
  function render(){
    nav();$('pageTitle').textContent=mainTitle();$('pageSubtitle').textContent='신뢰할 수 있는 자료와 담당자의 결정으로 사업을 준비합니다.';
    $('new').classList.toggle('hidden',!role?.canEdit);$('account').textContent=role?.email||'EKODIBIZ';
    const shown=tab==='overview'?records:records.filter(x=>x.category===tab);
    const metrics='<article class="panel"><div class="helper">등록 업무기록</div><div class="number">'+records.length+'</div></article><article class="panel"><div class="helper">진행 중</div><div class="number">'+records.filter(x=>x.status==='active').length+'</div></article><article class="panel"><div class="helper">검토 필요</div><div class="number">'+records.filter(x=>x.status==='review').length+'</div></article>';
    const list='<article class="panel wide"><h2>'+(tab==='overview'?'최근 사업기록':mainTitle()+' 기록')+'</h2><div class="stack">'+(shown.length?shown.map(recordCard).join(''):'<p class="helper">아직 등록된 업무 기록이 없습니다. 승인된 담당자가 첫 기록을 추가할 수 있습니다.</p>')+'</div></article>';
    const safety='<aside class="note wide"><b>중요 경계</b><p>제안서의 정책·비자·보증금·MOU·파견 실적은 사실 또는 법적 허가로 확정하지 않습니다. 공식 근거를 별도로 확인하고 관계기관과 전문가의 검토를 거쳐야 합니다. 여권번호·체류번호·연락처·건강정보 및 근로자 개인기록을 이 일반 업무장부에 넣지 마세요.</p></aside>';
    const history=tab==='overview'&&activity.length?'<article class="panel wide"><h2>변경 이력</h2>'+activity.slice(0,12).map(x=>'<div class="helper">'+esc(x.created_at)+' · '+esc(x.action)+' · '+esc(x.actor_email)+'</div>').join('')+'</article>':'';
    $('content').innerHTML=(tab==='overview'?metrics:'')+(tab==='overview'||tab==='documents'?sourceCard():'')+list+history+safety;
    document.querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>openEditor(records.find(x=>x.id===el.dataset.edit)));
  }
  function openEditor(item){
    if(!role?.canEdit)return;
    editing=item||null;
    $('pageTitle').textContent=item?'기록 수정':'새 업무기록';
    const selected=item?.category||(tab==='overview'?'tasks':tab);
    $('content').innerHTML='<article class="panel wide simple"><h2>'+(item?'기록 수정':'새 기록 등록')+'</h2><form id="editor" class="editor"><div class="fields"><label>분류<select name="category">'+tabs.slice(1).map(([x,y])=>'<option value="'+x+'" '+(selected===x?'selected':'')+'>'+y+'</option>').join('')+'</select></label><label>상태<select name="status">'+Object.entries(labels).map(([x,y])=>'<option value="'+x+'" '+((item?.status||'draft')===x?'selected':'')+'>'+y+'</option>').join('')+'</select></label><label class="full">업무명<input name="title" required maxlength="180" value="'+esc(item?.title||'')+'"></label><label class="full">내용·근거<textarea name="summary" maxlength="4000">'+esc(item?.summary||'')+'</textarea></label><label>목표일<input type="date" name="targetDate" value="'+esc(item?.target_date||'')+'"></label><label>참고자료 HTTPS 링크<input name="referenceUrl" type="url" maxlength="2048" value="'+esc(item?.reference_url||'')+'"></label></div><div class="top-actions"><button class="button primary" type="submit">기록 저장</button><button id="cancel" class="button" type="button">취소</button></div></form><p class="helper">문서 원본 업로드와 근로자 개인자료 저장은 현재 지원하지 않습니다. 공개 저장소나 일반 업무기록에 민감자료를 넣지 마세요.</p></article>';
    $('cancel').onclick=render;
    $('editor').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),body=Object.fromEntries(f.entries());if(item)body.id=item.id;say('저장 확인 중');try{await api('records',{method:item?'PATCH':'POST',body:JSON.stringify(body)});await load();say('권한 확인 후 저장되었습니다.')}catch(error){say(error.message)}};
  }
  function signedOut(){
    $('account').textContent='로그인 필요';$('new').classList.add('hidden');$('content').innerHTML='<article class="panel wide simple"><h2>관계자 전용 웹오피스</h2><p class="helper">에코디비즈 사업에 등록된 권한을 확인한 뒤 업무기록을 표시합니다.</p><button type="button" class="button primary" id="login">Google 계정으로 로그인</button></article>';$('login').onclick=authUrl;
  }
  async function load(){
    const data=await api('records');records=data.records||[];role=data.actor;source=data.initialSource;
    try{activity=(await api('activity')).activity||[]}catch{activity=[]}
    $('signOut').classList.remove('hidden');render();
  }
  async function boot(){
    const m=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb=m.createClient(SERVICE,KEY,{auth:{persistSession:true,detectSessionInUrl:false}});
    const p=new URLSearchParams(location.hash.slice(1)),token=p.get('ekodi_token');
    if(token){const {error}=await sb.auth.verifyOtp({token_hash:token,type:p.get('ekodi_type')||'email'});if(error)throw error;history.replaceState({},document.title,location.pathname+location.search)}
    const {data}=await sb.auth.getSession();
    $('signOut').onclick=async()=>{await sb.auth.signOut();signedOut()};
    if(!data.session){signedOut();return}
    await load();
  }
  boot().catch(e=>{say('업무공간 인증 또는 자료 연결에 실패했습니다: '+e.message);signedOut()});
}
export function seasonalOfficeScript(){return new Response('('+browserApp.toString()+')();',{headers:{...HEADERS,'content-type':'text/javascript; charset=utf-8'}})}
export const SEASONAL_OFFICE=Object.freeze({path:ROOT,categories:CATEGORIES.map(x=>x[0]),private:true,requiresWorkspaceMembership:true,originalDocumentUploaded:false});
