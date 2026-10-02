import authWorker from './auth-worker.js';
import { principalFromSupabaseRequest } from './ekodi-principal.js';
import { accessGrantIsActive, effectiveAccessCapabilities } from './access-governance.js';
import { runSeonamMediDailyCheck } from './seonammedi-monitor.js';

const PREFIX='/api/seonammedi';
const AUTH_EXCHANGE_PATH=PREFIX+'/admin/auth/exchange';
const AUTH_REFRESH_PATH=PREFIX+'/admin/auth/refresh';
const TENANT_SLUG='seonammedi';
const NOTICE_CAP='seonammedi.notice.manage';
const CHANNEL_CAP='seonammedi.channel.manage';
const CONTENT_CAP='seonammedi.content.manage';
const TIMELINE_CAP='seonammedi.timeline.manage';
const VOICE_CAP='seonammedi.voice.manage';
const PAGE_CAP='seonammedi.page.manage';
const FINANCE_CAP='seonammedi.finance.manage';
const MINUTES_CAP='seonammedi.page.manage';
const MINUTES_STATES=new Set(['shared','closed']);
const VOICE_STATES=new Set(['received','reviewing','answered','published','archived']);
const TIMELINE_STATES=new Set(['draft','published']);
const TIMELINE_SEED=[{"legacyKey":"seed-001","date":"1990.05","category":"장기연혁","title":"목포대 의과대학 신설 건의 시작","summary":"목포시 공식 추진사항은 국립목포대가 1990년 5월 정부에 의대 신설을 건의하기 시작했다고 정리합니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":0},{"legacyKey":"seed-002","date":"2007","category":"장기연혁","title":"의대 신설 관련 대통령 공약 반영","summary":"목포시 공식 추진사항은 2007년 제17대 대통령 선거 과정에서 목포대 의대 신설이 공약에 반영됐다고 기록합니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":1},{"legacyKey":"seed-003","date":"2012","category":"장기연혁","title":"의대 신설 관련 공약·지역 서명운동","summary":"목포시 공식자료는 2012년 제18대 대통령 선거 공약 반영을 기록하고, 국립목포대 총장백서는 같은 해 도민결의대회와 서명운동 추진 이력을 소개합니다.","evidence":"공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":2},{"legacyKey":"seed-004","date":"2018.07–2019.11","category":"정부·대학","title":"목포대 의과대학 설립 타당성 연구용역","summary":"목포시 공식 추진사항은 교육부 주관 타당성 연구용역이 이 기간 진행됐다고 정리합니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":3},{"legacyKey":"seed-005","date":"2023.01.19","category":"정부·대학","title":"권역별 국립대학교 의과대학 설립 공동 포럼","summary":"국립목포대 연혁에 공동 포럼 개최와 공동건의문 발표가 기록돼 있습니다.","evidence":"국립목포대 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":4},{"legacyKey":"seed-006","date":"2024.03.14","category":"정부·대학","title":"전남 국립의대 신설 추진 발표","summary":"목포시 공식 추진사항은 당시 정부가 전남 국립의대 신설 추진을 발표했다고 기록합니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":5},{"legacyKey":"seed-007","date":"2024.11.15","category":"정부·대학","title":"목포대·순천대 대학통합을 통한 국립의대 추진 합의","summary":"목포시 공식 추진사항에 양 대학 총장의 통합 추진 합의가 기록돼 있습니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":6},{"legacyKey":"seed-008","date":"2024.11.22","category":"정부·대학","title":"통합대학교 국립의대 정부 추천","summary":"목포시 공식 추진사항은 전라남도가 통합대학교 국립의과대학을 정부에 추천했다고 기록합니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":7},{"legacyKey":"seed-009","date":"2025.05.26","category":"정부·대학","title":"통합의대 설립 공동준비위원회 출범","summary":"양 대학 공동준비위원회 출범 이력이 목포시 공식 추진사항에 포함돼 있습니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":8},{"legacyKey":"seed-010","date":"2026.02.10","category":"정부·대학","title":"의사인력 양성규모 발표","summary":"목포시 공식 추진사항은 보건복지부 발표와 함께 의대 없는 지역 신설 시 2030년 개교·정원 100명 고려 내용을 기록합니다.","evidence":"목포시 공식자료","links":[],"media":[],"monitorKeywords":[],"sortOrder":9},{"legacyKey":"seed-011","date":"2026.07.02","category":"정부·대학","title":"국립의대 신설 중재안 제안","summary":"전남광주대전환기획위가 목포대·순천대의 국립의대 신설과 관련한 중재안을 제안한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":10},{"legacyKey":"seed-012","date":"2026.07.14","category":"정부·대학","title":"양 대학 자율협의·통합신청서 제출 요구","summary":"전남광주대전환기획위가 양 대학 회신 결과를 발표하고 자율 협의를 통한 통합신청서 제출을 요구한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":11},{"legacyKey":"seed-013","date":"2026.07.20","category":"정부·대학","title":"지역 완결형 필수·공공의료체계 권고안","summary":"전남광주대전환기획위가 지역 완결형 필수·공공의료체계 구축 권고안을 발표한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":12},{"legacyKey":"seed-014","date":"2026.07.27","category":"정부·대학","title":"공공의료혁신추진단 구성 발표","summary":"전남광주통합특별시가 공공의료혁신추진단 구성과 초광역 통합의료벨트 구축을 발표한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":13},{"legacyKey":"seed-015","date":"2026.08.02","category":"정부·대학","title":"통합 국립의대 긴급 조정회의","summary":"통합 국립의대 설립 및 초광역 통합의료벨트 구축을 위한 긴급 조정회의가 열린 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":14},{"legacyKey":"seed-016","date":"2026.08.06","category":"정부·대학","title":"교육부, 지역 의대 신설 추진계획서 제출 요청","summary":"교육부가 지역 의과대학 신설 추진계획서 제출을 요청한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":15},{"legacyKey":"seed-017","date":"2026.08.20","category":"정부·대학","title":"의과대학 신설 추진계획서 교육부 제출","summary":"전남광주통합특별시가 의과대학 신설 추진계획서를 교육부에 제출한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":16},{"legacyKey":"seed-018","date":"2026.08.26","category":"정부·대학","title":"교육부, 지역 의대 신설 추진계획서 재제출 요청","summary":"교육부가 지역 의과대학 신설 추진계획서 재제출을 요청한 것으로 당시 일지 보도에 정리돼 있습니다.","evidence":"언론보도","links":[],"media":[],"monitorKeywords":[],"sortOrder":17},{"legacyKey":"seed-019","date":"2026.08.30","category":"후보대학 선정","title":"전남광주특별시 국립의대 후보대학 선정 결과 발표","summary":"전남광주특별시는 순천대를 후보대학으로 선정했으며 보도된 평가점수는 순천대 89.15점, 목포대 87.85점입니다.","evidence":"공식발표·언론보도","links":[{"label":"후보대학 선정 보도","source":"뉴시스","url":"https://www.newsis.com/view/NISX20260830_0003768417"}],"media":[{"type":"photo","label":"후보대학 선정 관련 현장·발표 사진이 포함된 보도","source":"뉴시스","date":"2026-08-30","url":"https://www.newsis.com/view/NISX20260830_0003768417"}],"monitorKeywords":["후보대학","순천대","선정","목포대"],"sortOrder":18},{"legacyKey":"seed-020","date":"2026.09.21","category":"비대위 활동","title":"서울 상경투쟁 및 기자회견·공개서한 일정","summary":"비대위 참가자 자료집에는 국회 소통관·국회 정문·정당 당사·청와대 앞 기자회견과 공개서한 전달 일정이 포함돼 있습니다. 각 일정의 완료 여부는 후속 현장자료와 보도로 계속 확인합니다.","evidence":"비대위 현장자료","links":[{"label":"국회 기자회견 보도","source":"청년의사","url":"https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961"}],"media":[{"type":"photo","label":"국회 기자회견 사진이 포함된 보도","source":"청년의사 · 사진출처 국회인터넷의사중계시스템","date":"2026-09-21","url":"https://www.docdocdoc.co.kr/news/articleView.html?idxno=3042961"}],"monitorKeywords":["국회","기자회견","비상대책위원회","상경","공개서한"],"sortOrder":19}];
const CONTENT_STATES=new Set(['candidate','published','rejected']);
const CONTENT_CATEGORIES=new Set(['official','news']);
const PLATFORMS=new Set(['youtube','instagram','facebook','tiktok','blog','website','other']);
const CHANNEL_CATEGORIES=new Set(['official','related-org','media','civic','other']);

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const lower=value=>clean(value,320).toLowerCase();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});

async function authBridge(request,env,mode){
  const body=await request.json().catch(()=>null);
  const tokenHash=clean(body?.token_hash,8192);
  const refreshToken=clean(body?.refresh_token,8192);
  if(mode==='exchange'&&!tokenHash)return json({ok:false,error:'token_hash_required'},400);
  if(mode==='refresh'&&!refreshToken)return json({ok:false,error:'refresh_token_required'},400);
  const base=clean(env?.MY_SUPABASE_URL,500).replace(/\/+$/,'');
  const key=clean(env?.MY_SUPABASE_PUBLISHABLE_KEY,1200);
  if(!base||!key)return json({ok:false,error:'auth_bridge_unconfigured'},503);
  const endpoint=mode==='refresh'?'/auth/v1/token?grant_type=refresh_token':'/auth/v1/verify';
  const payload=mode==='refresh'?{refresh_token:refreshToken}:{token_hash:tokenHash,type:clean(body?.type,40)||'email'};
  const upstream=await fetch(base+endpoint,{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(10000),
  }).catch(()=>null);
  if(!upstream)return json({ok:false,error:'auth_upstream_unavailable'},503);
  const data=await upstream.json().catch(()=>({}));
  if(!upstream.ok)return json({ok:false,error:data?.msg||data?.error_description||data?.error||('auth_'+upstream.status)},upstream.status);
  return json({
    access_token:data.access_token||'',
    refresh_token:data.refresh_token||'',
    expires_at:data.expires_at||0,
    expires_in:data.expires_in||0,
    user:data.user?{id:data.user.id||'',email:data.user.email||''}:null
  });
}
const validHttps=value=>{try{const url=new URL(String(value||''));return url.protocol==='https:'?url.toString():''}catch{return''}};
const safeBool=value=>value===true||value===1||value==='1';
const safeOrder=value=>Math.max(0,Math.min(9999,Number.parseInt(String(value??0),10)||0));

async function addColumnIfMissing(db,table,column,definition){
  try{await db.prepare('SELECT '+column+' FROM '+table+' LIMIT 0').all();return}catch{}
  try{await db.prepare('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition).run()}catch(error){
    const message=String(error?.message||error||'');
    if(!/duplicate column name/i.test(message))throw error;
  }
}

async function ensurePublicContentSchema(db){
  await db.exec(`CREATE TABLE IF NOT EXISTS seonammedi_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    image_key TEXT NOT NULL DEFAULT '',
    image_type TEXT NOT NULL DEFAULT '',
    notice_kind TEXT NOT NULL DEFAULT 'notice',
    featured INTEGER NOT NULL DEFAULT 0,
    event_start TEXT,
    event_end TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS seonammedi_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL DEFAULT 'other',
    name TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'other',
    official INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS seonammedi_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_key TEXT UNIQUE,
    event_date TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '',
    links_json TEXT NOT NULL DEFAULT '[]',
    media_json TEXT NOT NULL DEFAULT '[]',
    monitor_keywords_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );`);
  const repair=[
    ['seonammedi_notices','title',"TEXT NOT NULL DEFAULT ''"],['seonammedi_notices','body',"TEXT NOT NULL DEFAULT ''"],['seonammedi_notices','status',"TEXT NOT NULL DEFAULT 'draft'"],['seonammedi_notices','pinned','INTEGER NOT NULL DEFAULT 0'],['seonammedi_notices','published_at','TEXT'],['seonammedi_notices','image_key',"TEXT NOT NULL DEFAULT ''"],['seonammedi_notices','image_type',"TEXT NOT NULL DEFAULT ''"],['seonammedi_notices','notice_kind',"TEXT NOT NULL DEFAULT 'notice'"],['seonammedi_notices','featured','INTEGER NOT NULL DEFAULT 0'],['seonammedi_notices','event_start','TEXT'],['seonammedi_notices','event_end','TEXT'],['seonammedi_notices','created_by',"TEXT NOT NULL DEFAULT ''"],['seonammedi_notices','created_at',"TEXT NOT NULL DEFAULT ''"],['seonammedi_notices','updated_at',"TEXT NOT NULL DEFAULT ''"],
    ['seonammedi_channels','platform',"TEXT NOT NULL DEFAULT 'other'"],['seonammedi_channels','name',"TEXT NOT NULL DEFAULT ''"],['seonammedi_channels','url',"TEXT NOT NULL DEFAULT ''"],['seonammedi_channels','category',"TEXT NOT NULL DEFAULT 'other'"],['seonammedi_channels','official','INTEGER NOT NULL DEFAULT 0'],['seonammedi_channels','visible','INTEGER NOT NULL DEFAULT 1'],['seonammedi_channels','sort_order','INTEGER NOT NULL DEFAULT 0'],['seonammedi_channels','note',"TEXT NOT NULL DEFAULT ''"],['seonammedi_channels','created_by',"TEXT NOT NULL DEFAULT ''"],['seonammedi_channels','created_at',"TEXT NOT NULL DEFAULT ''"],['seonammedi_channels','updated_at',"TEXT NOT NULL DEFAULT ''"],
    ['seonammedi_timeline','legacy_key','TEXT'],['seonammedi_timeline','event_date',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','category',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','title',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','summary',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','evidence',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','links_json',"TEXT NOT NULL DEFAULT '[]'"],['seonammedi_timeline','media_json',"TEXT NOT NULL DEFAULT '[]'"],['seonammedi_timeline','monitor_keywords_json',"TEXT NOT NULL DEFAULT '[]'"],['seonammedi_timeline','status',"TEXT NOT NULL DEFAULT 'published'"],['seonammedi_timeline','sort_order','INTEGER NOT NULL DEFAULT 0'],['seonammedi_timeline','created_by',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','created_at',"TEXT NOT NULL DEFAULT ''"],['seonammedi_timeline','updated_at',"TEXT NOT NULL DEFAULT ''"]
  ];
  for(const [table,column,definition] of repair)await addColumnIfMissing(db,table,column,definition);
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_seonammedi_notices_public ON seonammedi_notices(status,pinned,published_at,updated_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_seonammedi_notices_spotlight ON seonammedi_notices(status,featured,notice_kind,event_start,event_end,published_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_seonammedi_channels_public ON seonammedi_channels(visible,sort_order,id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_seonammedi_timeline_public ON seonammedi_timeline(status,sort_order,id)').run();
}

async function ensureContentCategoryColumn(db){
  try{await db.prepare("ALTER TABLE seonammedi_monitor_items ADD COLUMN publish_category TEXT NOT NULL DEFAULT 'news'").run()}catch{}
}

async function publicStorageRead(resource,read){
  try{return await read()}
  catch(error){
    console.error('seonammedi public storage read failed',{resource,error:String(error?.message||error)});
    return json({ok:false,error:resource+'_storage_read_failed'},503);
  }
}

async function ensureSchema(db){
  await ensureContentCategoryColumn(db);
  await ensurePublicContentSchema(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS seonammedi_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    pinned INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    image_key TEXT NOT NULL DEFAULT '',
    image_type TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_notices_public ON seonammedi_notices(status,pinned,published_at,updated_at);
  CREATE TABLE IF NOT EXISTS seonammedi_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    official INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_channels_public ON seonammedi_channels(visible,sort_order,id);
  CREATE TABLE IF NOT EXISTS seonammedi_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_key TEXT UNIQUE,
    event_date TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '',
    links_json TEXT NOT NULL DEFAULT '[]',
    media_json TEXT NOT NULL DEFAULT '[]',
    monitor_keywords_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'published',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_timeline_public ON seonammedi_timeline(status,sort_order,id);
  CREATE TABLE IF NOT EXISTS seonammedi_seed_state (
    seed_key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS seonammedi_admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    detail_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_admin_audit_created ON seonammedi_admin_audit(created_at);
  CREATE TABLE IF NOT EXISTS seonammedi_page_sections (
    section_key TEXT PRIMARY KEY,
    body_json TEXT NOT NULL DEFAULT '{}',
    visible INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS seonammedi_minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_token TEXT NOT NULL UNIQUE,
    meeting_at TEXT NOT NULL,
    title TEXT NOT NULL,
    attendees TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'closed',
    show_viewers INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_minutes_token ON seonammedi_minutes(share_token,status);
  CREATE TABLE IF NOT EXISTS seonammedi_minute_viewers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute_id INTEGER NOT NULL,
    viewer_name TEXT NOT NULL,
    viewed_at TEXT NOT NULL,
    FOREIGN KEY(minute_id) REFERENCES seonammedi_minutes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_minute_viewers_minute ON seonammedi_minute_viewers(minute_id,viewed_at,id);
  CREATE TABLE IF NOT EXISTS seonammedi_finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('income','expense')),
    amount INTEGER NOT NULL CHECK(amount >= 0),
    purpose TEXT NOT NULL,
    related_event TEXT NOT NULL DEFAULT '',
    evidence_status TEXT NOT NULL DEFAULT 'none',
    public_note TEXT NOT NULL DEFAULT '',
    visible INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonammedi_finance_public ON seonammedi_finance_entries(visible,entry_date,id);
  INSERT OR IGNORE INTO customer_tenants(slug,name,domain,status,created_at)
    VALUES('seonammedi','서남권 국립의대 소통센터','ekodi.kr/seonammedi','active',CURRENT_TIMESTAMP);`);
}

async function ensureTimelineSeed(db){
  const seedKey='timeline-v1';
  // Public timeline requests can reach this function without ensureSchema().
  // Create the seed-state table here so recovery never fails on a fresh/partial DB.
  await db.prepare(`CREATE TABLE IF NOT EXISTS seonammedi_seed_state (
    seed_key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`).run();
  // Always reconcile the immutable legacy seed rows. The seed-state marker only
  // records completion; it must not prevent recovery when timeline rows were
  // cleared, partially migrated, or created after the marker was written.
  const now=new Date().toISOString();
  for(const item of TIMELINE_SEED){
    const existing=await db.prepare('SELECT id FROM seonammedi_timeline WHERE legacy_key=? LIMIT 1').bind(item.legacyKey).first().catch(()=>null);
    if(existing?.id)continue;
    await db.prepare(`INSERT INTO seonammedi_timeline(
      legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,'published',?,'system-seed',?,?)`)
      .bind(item.legacyKey,item.date,item.category,item.title,item.summary,item.evidence,JSON.stringify(item.links||[]),JSON.stringify(item.media||[]),JSON.stringify(item.monitorKeywords||[]),item.sortOrder,now,now).run();
  }
  await db.prepare('INSERT OR REPLACE INTO seonammedi_seed_state(seed_key,applied_at) VALUES(?,?)').bind(seedKey,now).run();
}

async function platformSession(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return null;
  const session=await response.json().catch(()=>null);
  return session?.authenticated&&session?.email?session:null;
}

async function authority(request,env){
  if(!env?.DB?.prepare)return {ok:false,status:503,error:'storage_unavailable'};
  const session=await platformSession(request,env);
  if(session?.role==='super_admin')return {ok:true,email:lower(session.email),role:'super_admin',platform:true,capabilities:['*']};
  const principal=await principalFromSupabaseRequest(request);
  if(!principal?.email)return {ok:false,status:401,error:'authentication_required'};
  const principalEmail=lower(principal.email);
  const platformAdmin=await env.DB.prepare('SELECT role FROM admins WHERE lower(trim(email))=? LIMIT 1').bind(principalEmail).first().catch(()=>null);
  if(lower(platformAdmin?.role)==='super_admin')return {ok:true,email:principalEmail,role:'super_admin',platform:true,capabilities:['*']};
  const tenant=await env.DB.prepare('SELECT id,status FROM customer_tenants WHERE slug=? LIMIT 1').bind(TENANT_SLUG).first();
  if(!tenant||tenant.status!=='active')return {ok:false,status:404,error:'tenant_not_found'};
  const grant=await env.DB.prepare(`SELECT role,enabled,principal_type,capabilities_json,denied_capabilities_json,expires_at
    FROM customer_access_grants WHERE tenant_id=? AND lower(trim(email))=? LIMIT 1`).bind(tenant.id,principalEmail).first();
  if(!accessGrantIsActive(grant))return {ok:false,status:403,error:'access_forbidden'};
  const capabilities=effectiveAccessCapabilities(grant);
  if(!capabilities.includes(NOTICE_CAP)&&!capabilities.includes(CHANNEL_CAP)&&!capabilities.includes(CONTENT_CAP)&&!capabilities.includes(TIMELINE_CAP)&&!capabilities.includes(VOICE_CAP)&&!capabilities.includes(PAGE_CAP)&&!capabilities.includes(FINANCE_CAP))return {ok:false,status:403,error:'access_forbidden'};
  return {ok:true,email:principalEmail,role:clean(grant.role,80)||'staff',platform:false,capabilities};
}

function can(auth,cap){return Boolean(auth?.ok&&(auth.platform||auth.capabilities?.includes('*')||auth.capabilities?.includes(cap)))}
async function audit(env,auth,action,type,id,detail={}){
  try{await env.DB.prepare('INSERT INTO seonammedi_admin_audit(actor_email,action,resource_type,resource_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .bind(auth.email,action,type,id||null,JSON.stringify(detail),new Date().toISOString()).run()}catch{}
}

function publicNotice(row){const id=Number(row.id);return{id,title:row.title,body:row.body,pinned:Boolean(row.pinned),imageUrl:row.image_key?PREFIX+'/notices/'+id+'/image':'',publishedAt:row.published_at||row.updated_at,updatedAt:row.updated_at,kind:row.notice_kind==='event'?'event':'notice',featured:Boolean(row.featured),eventStart:row.event_start||'',eventEnd:row.event_end||''}}
function adminNotice(row){return{...publicNotice(row),status:row.status,createdBy:row.created_by,createdAt:row.created_at}}
function publicChannel(row){return{id:Number(row.id),platform:row.platform,name:row.name,url:row.url,category:row.category,official:Boolean(row.official),note:row.note||'',sortOrder:Number(row.sort_order||0)}}
function adminChannel(row){return{...publicChannel(row),visible:Boolean(row.visible),createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at}}

async function listPublicNotices(env){
  const rows=await env.DB.prepare(`SELECT id,title,body,pinned,published_at,updated_at,image_key,image_type,notice_kind,featured,event_start,event_end FROM seonammedi_notices
    WHERE status='published' ORDER BY pinned DESC,COALESCE(published_at,updated_at) DESC,id DESC LIMIT 40`).all();
  return json({ok:true,items:(rows.results||[]).map(publicNotice)});
}
async function publicNoticeImage(env,id){
  const row=await env.DB.prepare("SELECT image_key,image_type,status FROM seonammedi_notices WHERE id=? LIMIT 1").bind(id).first();
  if(!row||row.status!=='published'||!row.image_key)return new Response('not_found',{status:404});
  if(!env?.LIVE_RECORDINGS_BUCKET?.get)return new Response('storage_unavailable',{status:503});
  const object=await env.LIVE_RECORDINGS_BUCKET.get(row.image_key);if(!object)return new Response('not_found',{status:404});
  return new Response(object.body,{status:200,headers:{'content-type':row.image_type||object.httpMetadata?.contentType||'application/octet-stream','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
}
async function createPublicNotice(request,env){
  const principal=await principalFromSupabaseRequest(request);if(!principal?.email)return json({ok:false,error:'authentication_required'},401);
  const form=await request.formData().catch(()=>null);if(!form)return json({ok:false,error:'invalid_form'},400);
  const title=clean(form.get('title'),180),copy=clean(form.get('body'),10000);if(!title)return json({ok:false,error:'title_required'},400);
  const image=form.get('image');let imageKey='',imageType='';
  if(image&&typeof image==='object'&&Number(image.size||0)>0){
    if(!env?.LIVE_RECORDINGS_BUCKET?.put)return json({ok:false,error:'image_storage_unavailable'},503);
    if(Number(image.size)>8*1024*1024)return json({ok:false,error:'image_too_large'},413);
    imageType=String(image.type||'').toLowerCase();if(!['image/jpeg','image/png','image/webp','image/gif'].includes(imageType))return json({ok:false,error:'unsupported_image_type'},415);
    const ext=imageType==='image/jpeg'?'jpg':imageType.split('/')[1];imageKey='seonammedi/notices/'+crypto.randomUUID()+'.'+ext;
    await env.LIVE_RECORDINGS_BUCKET.put(imageKey,await image.arrayBuffer(),{httpMetadata:{contentType:imageType}});
  }
  const now=new Date().toISOString();
  try{
    const result=await env.DB.prepare('INSERT INTO seonammedi_notices(title,body,status,pinned,published_at,image_key,image_type,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(title,copy,'published',0,now,imageKey,imageType,principal.email,now,now).run();
    return json({ok:true,id:Number(result?.meta?.last_row_id||0)},201);
  }catch(error){if(imageKey)await env.LIVE_RECORDINGS_BUCKET?.delete?.(imageKey).catch(()=>{});throw error}
}
async function listPublicChannels(env){
  const rows=await env.DB.prepare(`SELECT id,platform,name,url,category,official,note,sort_order FROM seonammedi_channels
    WHERE visible=1 ORDER BY official DESC,sort_order ASC,id ASC LIMIT 80`).all();
  return json({ok:true,items:(rows.results||[]).map(publicChannel)});
}
const decodePreviewText=value=>clean(String(value||'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'),1200);
const previewMeta=(html,key)=>{
  const escaped=String(key).replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp('<meta[^>]+(?:property|name)=["\\\']'+escaped+'["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\']','i'),
    new RegExp('<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:property|name)=["\\\']'+escaped+'["\\\']','i')
  ];
  for(const pattern of patterns){const match=String(html||'').match(pattern);if(match?.[1])return decodePreviewText(match[1])}
  return '';
};
const previewTitle=html=>decodePreviewText(String(html||'').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
function channelProviderUrl(item){
  try{
    const url=new URL(item.url);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(item.platform==='instagram'&&host==='instagram.com'){
      const handle=url.pathname.split('/').filter(Boolean)[0]||'';
      if(handle&&!['accounts','explore','reels','direct'].includes(handle.toLowerCase()))return {kind:'instagram-profile',handle,profileEmbedUrl:'https://www.instagram.com/'+encodeURIComponent(handle)+'/embed/'};
    }
    if(item.platform==='youtube'&&['youtube.com','youtu.be'].includes(host))return {kind:'youtube'};
    if(item.platform==='facebook'&&['facebook.com','m.facebook.com'].includes(host))return {kind:'facebook'};
    if(item.platform==='tiktok'&&['tiktok.com','m.tiktok.com'].includes(host)){
      const videoId=clean(url.pathname.match(/\/video\/(\d{8,30})/)?.[1],40);
      return {kind:'tiktok',videoId};
    }
  }catch{}
  return {kind:'generic'};
}
function instagramRecentItems(html){
  const normalized=String(html||'').replace(/\\u002f/gi,'/').replace(/\\\//g,'/');
  const seen=new Set(),items=[];
  const add=(kind,shortcode)=>{
    const type=kind==='reel'?'reel':'post';
    const code=clean(shortcode,80);
    if(!/^[A-Za-z0-9_-]{5,}$/.test(code))return;
    const key=type+':'+code;if(seen.has(key))return;seen.add(key);
    const url='https://www.instagram.com/'+(type==='reel'?'reel':'p')+'/'+encodeURIComponent(code)+'/';
    items.push({type,url,embedUrl:url+'embed/'});
  };
  const urlPattern=/(?:https?:\/\/(?:www\.)?instagram\.com)?\/(p|reel)\/([A-Za-z0-9_-]{5,})\/?/gi;
  let match;while(items.length<3&&(match=urlPattern.exec(normalized)))add(match[1],match[2]);
  if(items.length<3){
    const shortcodePattern=/"shortcode"\s*:\s*"([A-Za-z0-9_-]{5,})"/g;
    while(items.length<3&&(match=shortcodePattern.exec(normalized)))add('p',match[1]);
  }
  return items.slice(0,3).map((item,index)=>({...item,label:'최근 공개 '+(item.type==='reel'?'릴스':'게시물')+' '+(index+1)}));
}
async function fetchChannelPreviewPage(url,userAgent,timeout=6000){
  if(!url)return null;
  try{return await fetch(url,{headers:{'user-agent':userAgent},redirect:'follow',signal:AbortSignal.timeout(timeout)})}catch{return null}
}
async function publicChannelPreview(env,id){
  const row=await env.DB.prepare(`SELECT id,platform,name,url,category,official,note,sort_order FROM seonammedi_channels
    WHERE id=? AND visible=1 LIMIT 1`).bind(id).first();
  if(!row)return json({ok:false,error:'not_found'},404);
  const item=publicChannel(row),provider=channelProviderUrl(item);
  const preview={title:item.name,description:item.note||'',image:'',embedUrl:'',mode:'summary',platform:item.platform,sourceUrl:item.url,recentItems:[]};
  if(provider.kind==='instagram-profile'){
    const userAgent='Mozilla/5.0 (compatible; EKODIChannelPreview/1.0; +https://ekodi.kr/seonammedi/)';
    const page=await fetchChannelPreviewPage(item.url,userAgent,6000);
    let html=page?.ok?await page.text().catch(()=>''):'';
    let recentItems=instagramRecentItems(html);
    if(!recentItems.length&&provider.profileEmbedUrl){
      const embedPage=await fetchChannelPreviewPage(provider.profileEmbedUrl,userAgent,5000);
      const embedHtml=embedPage?.ok?await embedPage.text().catch(()=>''):'';
      if(embedHtml){
        if(!html)html=embedHtml;
        recentItems=instagramRecentItems(embedHtml);
      }
    }
    if(html){
      preview.title=previewMeta(html,'og:title')||previewTitle(html)||preview.title;
      preview.description=previewMeta(html,'og:description')||previewMeta(html,'description')||preview.description;
      preview.image=validHttps(previewMeta(html,'og:image'));
    }
    preview.recentItems=recentItems;
    if(preview.recentItems.length){
      preview.mode='recent-embed';
      preview.contentType='recent-posts';
    }else preview.contentType='profile-summary';
    return json({ok:true,item,preview});
  }
  if(['facebook','tiktok'].includes(provider.kind)){
    const page=await fetchChannelPreviewPage(item.url,'Mozilla/5.0 (compatible; EKODIChannelPreview/1.0; +https://ekodi.kr/seonammedi/)',6500);
    const html=page?.ok?await page.text().catch(()=>''):'';
    if(html){
      preview.title=previewMeta(html,'og:title')||previewTitle(html)||preview.title;
      preview.description=previewMeta(html,'og:description')||previewMeta(html,'description')||preview.description;
      preview.image=validHttps(previewMeta(html,'og:image'));
    }
    if(provider.kind==='tiktok'&&provider.videoId){
      preview.embedUrl='https://www.tiktok.com/player/v1/'+provider.videoId+'?autoplay=0&rel=0';
      preview.mode='embed';
      preview.contentType='video';
      preview.videoId=provider.videoId;
    }else{
      preview.contentType='profile-summary';
    }
    return json({ok:true,item,preview});
  }
  if(provider.kind!=='youtube')return json({ok:true,item,preview});
  const page=await fetchChannelPreviewPage(item.url,'Mozilla/5.0 (compatible; EKODIChannelPreview/1.0; +https://ekodi.kr/seonammedi/)',7000);
  if(!page?.ok)return json({ok:true,item,preview});
  const html=await page.text().catch(()=>'');
  preview.title=previewMeta(html,'og:title')||previewTitle(html)||preview.title;
  preview.description=previewMeta(html,'og:description')||previewMeta(html,'description')||preview.description;
  preview.image=validHttps(previewMeta(html,'og:image'));
  let pageVideoId=clean(
    (html.match(/"videoId":"([A-Za-z0-9_-]{11})"/)||html.match(/watch\?v=([A-Za-z0-9_-]{11})/))?.[1],
    20
  );
  if(!/^[A-Za-z0-9_-]{11}$/.test(pageVideoId)){
    try{
      const videosUrl=new URL(item.url);
      videosUrl.search='';videosUrl.hash='';
      videosUrl.pathname=videosUrl.pathname.replace(/\/$/,'')+'/videos';
      const videosPage=await fetchChannelPreviewPage(videosUrl.href,'Mozilla/5.0 (compatible; EKODIChannelPreview/1.0; +https://ekodi.kr/seonammedi/)',6500);
      const videosHtml=videosPage?.ok?await videosPage.text().catch(()=>''):'';
      pageVideoId=clean(
        (videosHtml.match(/"videoId":"([A-Za-z0-9_-]{11})"/)||videosHtml.match(/watch\?v=([A-Za-z0-9_-]{11})/))?.[1],
        20
      );
    }catch{}
  }
  if(/^[A-Za-z0-9_-]{11}$/.test(pageVideoId)){
    preview.embedUrl='https://www.youtube-nocookie.com/embed/'+pageVideoId+'?rel=0';
    preview.mode='embed';
    preview.contentType='latest-video';
    preview.videoId=pageVideoId;
    return json({ok:true,item,preview});
  }
  const channelId=(
    html.match(/<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[A-Za-z0-9_-]{20,})["']/i)||
    html.match(/<meta[^>]+content=["'](UC[A-Za-z0-9_-]{20,})["'][^>]+itemprop=["']channelId["']/i)||
    html.match(/"(?:channelId|externalId|browseId)":"(UC[A-Za-z0-9_-]{20,})"/)||
    html.match(/feeds\/videos\.xml\?channel_id=(UC[A-Za-z0-9_-]{20,})/i)||
    html.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,})/i)
  )?.[1]||'';
  if(channelId){
    const feed=await fetchChannelPreviewPage('https://www.youtube.com/feeds/videos.xml?channel_id='+encodeURIComponent(channelId),'EKODIChannelPreview/1.0',5000);
    const xml=feed?.ok?await feed.text().catch(()=>''):'';
    const videoId=clean(xml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1],40);
    if(/^[A-Za-z0-9_-]{11}$/.test(videoId)){
      preview.embedUrl='https://www.youtube-nocookie.com/embed/'+videoId+'?rel=0';
      preview.mode='embed';
      preview.contentType='latest-video';
      preview.videoId=videoId;
    }
  }
  return json({ok:true,item,preview});
}

async function adminMe(request,env,auth){
  const site=await env.DB.prepare('SELECT public_status,updated_at FROM public_site_controls WHERE site_id=? LIMIT 1').bind(TENANT_SLUG).first().catch(()=>null);
  return json({ok:true,email:auth.email,role:auth.role,platform:Boolean(auth.platform),capabilities:auth.capabilities||[],permissions:{notices:can(auth,NOTICE_CAP),channels:can(auth,CHANNEL_CAP),content:can(auth,CONTENT_CAP),timeline:can(auth,TIMELINE_CAP),voices:can(auth,VOICE_CAP)||can(auth,CONTENT_CAP),pages:can(auth,PAGE_CAP)||can(auth,CONTENT_CAP),finance:can(auth,FINANCE_CAP),health:can(auth,PAGE_CAP)||can(auth,CONTENT_CAP)},publicStatus:site?.public_status||'public',publicStatusUpdatedAt:site?.updated_at||''});
}


const PAGE_KEYS=new Set(['status','organization']);
const parseJsonObject=value=>{try{const parsed=JSON.parse(String(value||'{}'));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}};
function pageRow(row){return{key:row.section_key,data:parseJsonObject(row.body_json),visible:Boolean(row.visible),updatedBy:row.updated_by||'',updatedAt:row.updated_at||''}}
async function listPublicPageData(env){
  const [sections,finance]=await Promise.all([
    env.DB.prepare('SELECT section_key,body_json,visible,updated_by,updated_at FROM seonammedi_page_sections WHERE visible=1').all(),
    env.DB.prepare('SELECT id,entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note FROM seonammedi_finance_entries WHERE visible=1 ORDER BY entry_date DESC,id DESC LIMIT 300').all()
  ]);
  const page={};for(const row of sections.results||[])page[row.section_key]=parseJsonObject(row.body_json);
  const entries=(finance.results||[]).map(row=>({id:Number(row.id),date:row.entry_date,type:row.entry_type,amount:Number(row.amount||0),purpose:row.purpose,event:row.related_event||'',evidenceStatus:row.evidence_status||'none',note:row.public_note||''}));
  let raised=0,spent=0;for(const row of entries){if(row.type==='income')raised+=row.amount;else spent+=row.amount}
  return json({ok:true,page,finance:{raised,spent,balance:raised-spent,entries}});
}
function canManagePages(auth){return can(auth,PAGE_CAP)||can(auth,CONTENT_CAP)}
async function getAdminPage(env,auth,key){
  if(!canManagePages(auth))return json({ok:false,error:'page_forbidden'},403);
  if(!PAGE_KEYS.has(key))return json({ok:false,error:'invalid_page_key'},400);
  const row=await env.DB.prepare('SELECT * FROM seonammedi_page_sections WHERE section_key=?').bind(key).first();
  return json({ok:true,item:row?pageRow(row):{key,data:null,visible:true,updatedBy:'',updatedAt:''}});
}
async function putAdminPage(request,env,auth,key){
  if(!canManagePages(auth))return json({ok:false,error:'page_forbidden'},403);
  if(!PAGE_KEYS.has(key))return json({ok:false,error:'invalid_page_key'},400);
  const body=await request.json().catch(()=>null);if(!body||typeof body.data!=='object'||Array.isArray(body.data))return json({ok:false,error:'invalid_page_data'},400);
  const now=new Date().toISOString(),visible=body.visible===false?0:1;
  await env.DB.prepare(`INSERT INTO seonammedi_page_sections(section_key,body_json,visible,updated_by,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(section_key) DO UPDATE SET body_json=excluded.body_json,visible=excluded.visible,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(key,JSON.stringify(body.data),visible,auth.email,now).run();
  await audit(env,auth,'update','page_section',null,{key,visible:Boolean(visible)});return json({ok:true,key});
}
function financeRow(row){return{id:Number(row.id),date:row.entry_date,type:row.entry_type,amount:Number(row.amount||0),purpose:row.purpose,event:row.related_event||'',evidenceStatus:row.evidence_status||'none',note:row.public_note||'',visible:Boolean(row.visible),createdBy:row.created_by||'',createdAt:row.created_at,updatedAt:row.updated_at}}
async function listAdminFinance(env,auth){
  if(!can(auth,FINANCE_CAP))return json({ok:false,error:'finance_forbidden'},403);
  const rows=await env.DB.prepare('SELECT * FROM seonammedi_finance_entries ORDER BY entry_date DESC,id DESC LIMIT 500').all();
  return json({ok:true,items:(rows.results||[]).map(financeRow)});
}
function financeInput(body,existing={}){
  const date=clean(body?.date??existing.entry_date,20),type=clean(body?.type??existing.entry_type,20),purpose=clean(body?.purpose??existing.purpose,500);
  const amount=Math.max(0,Math.round(Number(body?.amount??existing.amount??0)));if(!date||!['income','expense'].includes(type)||!purpose||!Number.isFinite(amount))return null;
  return{date,type,amount,purpose,event:clean(body?.event??existing.related_event,300),evidenceStatus:clean(body?.evidenceStatus??existing.evidence_status,40)||'none',note:clean(body?.note??existing.public_note,1000),visible:body?.visible===undefined?Number(existing.visible??1):(safeBool(body.visible)?1:0)};
}
async function createFinance(request,env,auth){
  if(!can(auth,FINANCE_CAP))return json({ok:false,error:'finance_forbidden'},403);
  const body=await request.json().catch(()=>null),v=financeInput(body);if(!v)return json({ok:false,error:'invalid_finance_entry'},400);
  const now=new Date().toISOString();const result=await env.DB.prepare('INSERT INTO seonammedi_finance_entries(entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note,visible,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(v.date,v.type,v.amount,v.purpose,v.event,v.evidenceStatus,v.note,v.visible,auth.email,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','finance_entry',id,{type:v.type,amount:v.amount,visible:Boolean(v.visible)});return json({ok:true,id},201);
}
async function updateFinance(request,env,auth,id){
  if(!can(auth,FINANCE_CAP))return json({ok:false,error:'finance_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonammedi_finance_entries WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),v=financeInput(body,existing);if(!v)return json({ok:false,error:'invalid_finance_entry'},400);
  const now=new Date().toISOString();await env.DB.prepare('UPDATE seonammedi_finance_entries SET entry_date=?,entry_type=?,amount=?,purpose=?,related_event=?,evidence_status=?,public_note=?,visible=?,updated_at=? WHERE id=?')
    .bind(v.date,v.type,v.amount,v.purpose,v.event,v.evidenceStatus,v.note,v.visible,now,id).run();
  await audit(env,auth,'update','finance_entry',id,{type:v.type,amount:v.amount,visible:Boolean(v.visible)});return json({ok:true,id});
}
async function deleteFinance(env,auth,id){
  if(!can(auth,FINANCE_CAP))return json({ok:false,error:'finance_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,entry_type,amount,purpose FROM seonammedi_finance_entries WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonammedi_finance_entries WHERE id=?').bind(id).run();await audit(env,auth,'delete','finance_entry',id,{type:existing.entry_type,amount:Number(existing.amount||0),purpose:existing.purpose});return json({ok:true,id});
}

async function listAdminNotices(env,auth){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const rows=await env.DB.prepare('SELECT * FROM seonammedi_notices ORDER BY pinned DESC,updated_at DESC,id DESC LIMIT 100').all();
  return json({ok:true,items:(rows.results||[]).map(adminNotice)});
}
async function noticeAdminPayload(request,existing={}){
  const type=String(request.headers.get('content-type')||'').toLowerCase();let input={},image=null;
  if(type.includes('multipart/form-data')){const form=await request.formData().catch(()=>null);if(!form)return null;for(const key of ['title','body','status','kind','eventStart','eventEnd'])input[key]=form.get(key);input.pinned=form.get('pinned')==='true'||form.get('pinned')==='on';input.featured=form.get('featured')==='true'||form.get('featured')==='on';image=form.get('image')}
  else input=await request.json().catch(()=>null);
  if(!input)return null;
  const value={title:clean(input.title??existing.title,180),body:clean(input.body??existing.body,10000),status:input.status==='published'?'published':'draft',pinned:safeBool(input.pinned)?1:0,kind:(input.kind??existing.notice_kind)==='event'?'event':'notice',featured:input.featured===undefined?Number(existing.featured||0):(safeBool(input.featured)?1:0),eventStart:clean(input.eventStart??existing.event_start,40)||null,eventEnd:clean(input.eventEnd??existing.event_end,40)||null,image};
  return value;
}
async function storeNoticeImage(env,image){
  if(!image||typeof image!=='object'||Number(image.size||0)<=0)return null;
  if(!env?.LIVE_RECORDINGS_BUCKET?.put)throw Object.assign(new Error('image_storage_unavailable'),{status:503});
  if(Number(image.size)>8*1024*1024)throw Object.assign(new Error('image_too_large'),{status:413});
  const imageType=String(image.type||'').toLowerCase();if(!['image/jpeg','image/png','image/webp','image/gif'].includes(imageType))throw Object.assign(new Error('unsupported_image_type'),{status:415});
  const ext=imageType==='image/jpeg'?'jpg':imageType.split('/')[1],imageKey='seonammedi/notices/'+crypto.randomUUID()+'.'+ext;
  await env.LIVE_RECORDINGS_BUCKET.put(imageKey,await image.arrayBuffer(),{httpMetadata:{contentType:imageType}});return{imageKey,imageType};
}
async function createNotice(request,env,auth){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const body=await noticeAdminPayload(request);if(!body)return json({ok:false,error:'invalid_request'},400);if(!body.title)return json({ok:false,error:'title_required'},400);
  let stored=null;try{stored=await storeNoticeImage(env,body.image)}catch(error){return json({ok:false,error:error.message||'image_upload_failed'},error.status||500)}
  const now=new Date().toISOString(),publishedAt=body.status==='published'?now:null;
  try{const result=await env.DB.prepare('INSERT INTO seonammedi_notices(title,body,status,pinned,published_at,image_key,image_type,notice_kind,featured,event_start,event_end,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(body.title,body.body,body.status,body.pinned,publishedAt,stored?.imageKey||'',stored?.imageType||'',body.kind,body.featured,body.eventStart,body.eventEnd,auth.email,now,now).run();
    const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','notice',id,{status:body.status,pinned:Boolean(body.pinned),featured:Boolean(body.featured),kind:body.kind});return json({ok:true,id},201)
  }catch(error){if(stored?.imageKey)await env.LIVE_RECORDINGS_BUCKET?.delete?.(stored.imageKey).catch(()=>{});throw error}
}
async function updateNotice(request,env,auth,id){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonammedi_notices WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await noticeAdminPayload(request,existing);if(!body)return json({ok:false,error:'invalid_request'},400);if(!body.title)return json({ok:false,error:'title_required'},400);
  let stored=null;try{stored=await storeNoticeImage(env,body.image)}catch(error){return json({ok:false,error:error.message||'image_upload_failed'},error.status||500)}
  const now=new Date().toISOString(),publishedAt=body.status==='published'?(existing.published_at||now):null,imageKey=stored?.imageKey||existing.image_key||'',imageType=stored?.imageType||existing.image_type||'';
  try{await env.DB.prepare('UPDATE seonammedi_notices SET title=?,body=?,status=?,pinned=?,published_at=?,updated_at=?,image_key=?,image_type=?,notice_kind=?,featured=?,event_start=?,event_end=? WHERE id=?')
    .bind(body.title,body.body,body.status,body.pinned,publishedAt,now,imageKey,imageType,body.kind,body.featured,body.eventStart,body.eventEnd,id).run();
    if(stored?.imageKey&&existing.image_key&&existing.image_key!==stored.imageKey)await env.LIVE_RECORDINGS_BUCKET?.delete?.(existing.image_key).catch(()=>{});
    await audit(env,auth,'update','notice',id,{status:body.status,pinned:Boolean(body.pinned),featured:Boolean(body.featured),kind:body.kind});return json({ok:true,id})
  }catch(error){if(stored?.imageKey)await env.LIVE_RECORDINGS_BUCKET?.delete?.(stored.imageKey).catch(()=>{});throw error}
}
async function deleteNotice(env,auth,id){
  if(!can(auth,NOTICE_CAP))return json({ok:false,error:'notice_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,title FROM seonammedi_notices WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonammedi_notices WHERE id=?').bind(id).run();await audit(env,auth,'delete','notice',id,{title:existing.title});return json({ok:true,id});
}



const parseJsonArray=value=>{try{const v=JSON.parse(String(value||'[]'));return Array.isArray(v)?v:[]}catch{return[]}};
function timelineRow(row,admin=false){
  const item={id:Number(row.id),date:row.event_date,category:row.category,title:row.title,summary:row.summary||'',evidence:row.evidence||'',links:parseJsonArray(row.links_json),media:parseJsonArray(row.media_json),monitorKeywords:parseJsonArray(row.monitor_keywords_json),sortOrder:Number(row.sort_order||0)};
  if(admin){item.status=row.status;item.createdBy=row.created_by||'';item.createdAt=row.created_at;item.updatedAt=row.updated_at}
  return item;
}
async function listPublicTimeline(env){
  const rows=await env.DB.prepare("SELECT * FROM seonammedi_timeline WHERE status='published' ORDER BY sort_order ASC,id ASC LIMIT 300").all();
  return json({ok:true,items:(rows.results||[]).map(row=>timelineRow(row,false))});
}
async function listAdminTimeline(env,auth){
  if(!can(auth,TIMELINE_CAP))return json({ok:false,error:'timeline_forbidden'},403);
  await ensureTimelineSeed(env.DB);
  const rows=await env.DB.prepare('SELECT * FROM seonammedi_timeline ORDER BY sort_order ASC,id ASC LIMIT 500').all();
  return json({ok:true,items:(rows.results||[]).map(row=>timelineRow(row,true))});
}
function timelineInput(body,existing={}){
  const date=clean(body?.date??existing.event_date,40),category=clean(body?.category??existing.category,80),title=clean(body?.title??existing.title,220),summary=clean(body?.summary??existing.summary,8000),evidence=clean(body?.evidence??existing.evidence,500);
  const status=TIMELINE_STATES.has(clean(body?.status??existing.status,40))?clean(body?.status??existing.status,40):'draft';
  const sortOrder=safeOrder(body?.sortOrder??existing.sort_order);
  const links=Array.isArray(body?.links)?body.links:parseJsonArray(existing.links_json);
  const media=Array.isArray(body?.media)?body.media:parseJsonArray(existing.media_json);
  const monitorKeywords=Array.isArray(body?.monitorKeywords)?body.monitorKeywords:parseJsonArray(existing.monitor_keywords_json);
  if(!date||!category||!title)return null;
  return{date,category,title,summary,evidence,status,sortOrder,links,media,monitorKeywords};
}
async function createTimeline(request,env,auth){
  if(!can(auth,TIMELINE_CAP))return json({ok:false,error:'timeline_forbidden'},403);
  const body=await request.json().catch(()=>null),value=timelineInput(body);if(!value)return json({ok:false,error:'invalid_timeline'},400);
  const now=new Date().toISOString();
  const result=await env.DB.prepare(`INSERT INTO seonammedi_timeline(legacy_key,event_date,category,title,summary,evidence,links_json,media_json,monitor_keywords_json,status,sort_order,created_by,created_at,updated_at)
    VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(value.date,value.category,value.title,value.summary,value.evidence,JSON.stringify(value.links),JSON.stringify(value.media),JSON.stringify(value.monitorKeywords),value.status,value.sortOrder,auth.email,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','timeline',id,{title:value.title,status:value.status,category:value.category});return json({ok:true,id},201);
}
async function updateTimeline(request,env,auth,id){
  if(!can(auth,TIMELINE_CAP))return json({ok:false,error:'timeline_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonammedi_timeline WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),value=timelineInput(body,existing);if(!value)return json({ok:false,error:'invalid_timeline'},400);
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE seonammedi_timeline SET event_date=?,category=?,title=?,summary=?,evidence=?,links_json=?,media_json=?,monitor_keywords_json=?,status=?,sort_order=?,updated_at=? WHERE id=?`)
    .bind(value.date,value.category,value.title,value.summary,value.evidence,JSON.stringify(value.links),JSON.stringify(value.media),JSON.stringify(value.monitorKeywords),value.status,value.sortOrder,now,id).run();
  await audit(env,auth,'update','timeline',id,{title:value.title,status:value.status,category:value.category});return json({ok:true,id});
}
async function deleteTimeline(env,auth,id){
  if(!can(auth,TIMELINE_CAP))return json({ok:false,error:'timeline_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,title FROM seonammedi_timeline WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonammedi_timeline WHERE id=?').bind(id).run();await audit(env,auth,'delete','timeline',id,{title:existing.title});return json({ok:true,id});
}

function voiceRow(row){return{id:Number(row.id),category:row.category,displayName:row.display_name||'',contact:row.contact||'',message:row.message||'',publicConsent:Boolean(row.public_consent),privacyConsent:Boolean(row.privacy_consent),status:VOICE_STATES.has(row.review_status)?row.review_status:'received',createdAt:row.created_at,updatedAt:row.updated_at}}
function canManageVoices(auth){return can(auth,VOICE_CAP)||can(auth,CONTENT_CAP)}
async function listAdminVoices(env,auth){
  if(!canManageVoices(auth))return json({ok:false,error:'voice_forbidden'},403);
  const rows=await env.DB.prepare('SELECT id,category,display_name,contact,message,public_consent,privacy_consent,review_status,created_at,updated_at FROM seonammedi_civic_voices ORDER BY id DESC LIMIT 300').all();
  return json({ok:true,items:(rows.results||[]).map(voiceRow)});
}
async function updateAdminVoice(request,env,auth,id){
  if(!canManageVoices(auth))return json({ok:false,error:'voice_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonammedi_civic_voices WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),status=clean(body?.status??existing.review_status,40);
  if(!VOICE_STATES.has(status))return json({ok:false,error:'invalid_voice_status'},400);
  if(status==='published'&&!safeBool(existing.public_consent))return json({ok:false,error:'public_consent_required',message:'공개 동의가 없는 의견은 공개할 수 없습니다.'},400);
  const now=new Date().toISOString();await env.DB.prepare('UPDATE seonammedi_civic_voices SET review_status=?,updated_at=? WHERE id=?').bind(status,now,id).run();
  await audit(env,auth,'status','civic_voice',id,{status,category:existing.category});return json({ok:true,id,status});
}
async function deleteAdminVoice(env,auth,id){
  if(!canManageVoices(auth))return json({ok:false,error:'voice_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,category,display_name FROM seonammedi_civic_voices WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonammedi_civic_voices WHERE id=?').bind(id).run();await audit(env,auth,'delete','civic_voice',id,{category:existing.category,displayName:existing.display_name||''});return json({ok:true,id});
}

async function listAdminContent(env,auth){
  if(!can(auth,CONTENT_CAP))return json({ok:false,error:'content_forbidden'},403);
  await ensureContentCategoryColumn(env.DB);
  const rows=await env.DB.prepare(`SELECT id,title,url,resolved_url,publisher,published_at,query_label,review_state,publish_category,first_seen_at,last_seen_at
    FROM seonammedi_monitor_items ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 150`).all();
  return json({ok:true,items:(rows.results||[]).map(row=>({id:Number(row.id),title:row.title,url:row.resolved_url||row.url,publisher:row.publisher||'',publishedAt:row.published_at||row.first_seen_at,queryLabel:row.query_label||'',reviewState:row.review_state==='verified'?'published':CONTENT_STATES.has(row.review_state)?row.review_state:'candidate',category:row.publish_category==='official'?'official':'news'}))});
}
async function updateAdminContent(request,env,auth,id){
  if(!can(auth,CONTENT_CAP))return json({ok:false,error:'content_forbidden'},403);
  await ensureContentCategoryColumn(env.DB);
  const existing=await env.DB.prepare('SELECT id,title FROM seonammedi_monitor_items WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),state=clean(body?.state,40),category=clean(body?.category,40);
  if(!CONTENT_STATES.has(state)||!CONTENT_CATEGORIES.has(category))return json({ok:false,error:'invalid_content_review'},400);
  const stored=state==='published'?'verified':state;
  await env.DB.prepare('UPDATE seonammedi_monitor_items SET review_state=?,publish_category=? WHERE id=?').bind(stored,category,id).run();
  await audit(env,auth,'review','web_content',id,{state,category,title:existing.title});return json({ok:true,id,state,category});
}

async function listAdminChannels(env,auth){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const rows=await env.DB.prepare('SELECT * FROM seonammedi_channels ORDER BY sort_order ASC,id ASC LIMIT 150').all();
  return json({ok:true,items:(rows.results||[]).map(adminChannel)});
}
function channelInput(body,existing={}){
  const platform=clean(body?.platform??existing.platform,40).toLowerCase(),name=clean(body?.name??existing.name,160),url=validHttps(body?.url??existing.url);
  const category=clean(body?.category??existing.category,40).toLowerCase();
  if(!PLATFORMS.has(platform)||!name||!url||!CHANNEL_CATEGORIES.has(category))return null;
  return{platform,name,url,category,official:safeBool(body?.official)?1:0,visible:body?.visible===undefined?Number(existing.visible??1):(safeBool(body.visible)?1:0),sortOrder:safeOrder(body?.sortOrder??existing.sort_order),note:clean(body?.note??existing.note,500)};
}
async function createChannel(request,env,auth){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const body=await request.json().catch(()=>null),value=channelInput(body);if(!value)return json({ok:false,error:'invalid_channel'},400);
  const now=new Date().toISOString();const result=await env.DB.prepare(`INSERT INTO seonammedi_channels(platform,name,url,category,official,visible,sort_order,note,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(value.platform,value.name,value.url,value.category,value.official,value.visible,value.sortOrder,value.note,auth.email,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','channel',id,{platform:value.platform,name:value.name});return json({ok:true,id},201);
}
async function updateChannel(request,env,auth,id){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonammedi_channels WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),value=channelInput(body,existing);if(!value)return json({ok:false,error:'invalid_channel'},400);
  const now=new Date().toISOString();await env.DB.prepare(`UPDATE seonammedi_channels SET platform=?,name=?,url=?,category=?,official=?,visible=?,sort_order=?,note=?,updated_at=? WHERE id=?`)
    .bind(value.platform,value.name,value.url,value.category,value.official,value.visible,value.sortOrder,value.note,now,id).run();
  await audit(env,auth,'update','channel',id,{platform:value.platform,name:value.name,visible:Boolean(value.visible)});return json({ok:true,id});
}
async function deleteChannel(env,auth,id){
  if(!can(auth,CHANNEL_CAP))return json({ok:false,error:'channel_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,name FROM seonammedi_channels WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonammedi_channels WHERE id=?').bind(id).run();await audit(env,auth,'delete','channel',id,{name:existing.name});return json({ok:true,id});
}


function minuteRow(row,admin=false){
  const base={id:Number(row.id),meetingAt:row.meeting_at,title:row.title||'',attendees:row.attendees||'',body:row.body||'',status:MINUTES_STATES.has(row.status)?row.status:'closed',showViewers:Boolean(row.show_viewers),viewerCount:Number(row.viewer_count||0)};
  if(admin)base.shareToken=row.share_token;
  return base;
}
function minuteInput(body,existing={}){
  const meetingAt=clean(body?.meetingAt??existing.meeting_at,80),title=clean(body?.title??existing.title,220),attendees=clean(body?.attendees??existing.attendees,2000),text=clean(body?.body??existing.body,30000);
  const rawStatus=clean(body?.status??existing.status,20),status=MINUTES_STATES.has(rawStatus)?rawStatus:'closed';
  const showViewers=body?.showViewers===undefined?Boolean(existing.show_viewers??1):Boolean(body.showViewers);
  if(!meetingAt||!title||!text)return null;
  return{meetingAt,title,attendees,body:text,status,showViewers};
}
function newShareToken(){
  try{return crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'')}catch{return String(Date.now())+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)}
}
async function listAdminMinutes(env,auth){
  if(!can(auth,MINUTES_CAP))return json({ok:false,error:'minutes_forbidden'},403);
  await ensureSchema(env.DB);
  const rows=await env.DB.prepare(`SELECT m.*,COUNT(v.id) viewer_count FROM seonammedi_minutes m LEFT JOIN seonammedi_minute_viewers v ON v.minute_id=m.id GROUP BY m.id ORDER BY m.meeting_at DESC,m.id DESC LIMIT 300`).all();
  return json({ok:true,items:(rows.results||[]).map(r=>minuteRow(r,true))});
}
async function createMinute(request,env,auth){
  if(!can(auth,MINUTES_CAP))return json({ok:false,error:'minutes_forbidden'},403);
  const body=await request.json().catch(()=>null),value=minuteInput(body);if(!value)return json({ok:false,error:'invalid_minutes'},400);
  const now=new Date().toISOString(),token=newShareToken();
  const result=await env.DB.prepare(`INSERT INTO seonammedi_minutes(share_token,meeting_at,title,attendees,body,status,show_viewers,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(token,value.meetingAt,value.title,value.attendees,value.body,value.status,value.showViewers?1:0,auth.email,now,now).run();
  const id=Number(result?.meta?.last_row_id||0);await audit(env,auth,'create','minutes',id,{title:value.title,status:value.status});return json({ok:true,id,shareToken:token},201);
}
async function updateMinute(request,env,auth,id){
  if(!can(auth,MINUTES_CAP))return json({ok:false,error:'minutes_forbidden'},403);
  const existing=await env.DB.prepare('SELECT * FROM seonammedi_minutes WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  const body=await request.json().catch(()=>null),value=minuteInput(body,existing);if(!value)return json({ok:false,error:'invalid_minutes'},400);
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE seonammedi_minutes SET meeting_at=?,title=?,attendees=?,body=?,status=?,show_viewers=?,updated_at=? WHERE id=?`)
    .bind(value.meetingAt,value.title,value.attendees,value.body,value.status,value.showViewers?1:0,now,id).run();
  await audit(env,auth,'update','minutes',id,{title:value.title,status:value.status});return json({ok:true,id,shareToken:existing.share_token});
}
async function deleteMinute(env,auth,id){
  if(!can(auth,MINUTES_CAP))return json({ok:false,error:'minutes_forbidden'},403);
  const existing=await env.DB.prepare('SELECT id,title FROM seonammedi_minutes WHERE id=?').bind(id).first();if(!existing)return json({ok:false,error:'not_found'},404);
  await env.DB.prepare('DELETE FROM seonammedi_minute_viewers WHERE minute_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM seonammedi_minutes WHERE id=?').bind(id).run();
  await audit(env,auth,'delete','minutes',id,{title:existing.title});return json({ok:true,id});
}
async function publicMinuteView(request,env,token){
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
  await ensureSchema(env.DB);
  const row=await env.DB.prepare("SELECT * FROM seonammedi_minutes WHERE share_token=? AND status='shared' LIMIT 1").bind(token).first();
  if(!row)return json({ok:false,error:'not_found'},404);
  if(request.method==='GET')return json({ok:true,requiresName:true,title:row.title,meetingAt:row.meeting_at});
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  const body=await request.json().catch(()=>null),name=clean(body?.name,80);if(!name)return json({ok:false,error:'name_required'},400);
  const now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO seonammedi_minute_viewers(minute_id,viewer_name,viewed_at) VALUES(?,?,?)').bind(Number(row.id),name,now).run();
  const viewers=row.show_viewers?await env.DB.prepare('SELECT viewer_name,viewed_at FROM seonammedi_minute_viewers WHERE minute_id=? ORDER BY id ASC LIMIT 500').bind(Number(row.id)).all():{results:[]};
  return json({ok:true,minutes:minuteRow(row,false),viewers:(viewers.results||[]).map(v=>({name:v.viewer_name,viewedAt:v.viewed_at}))});
}

export async function handleSeonamMediAdminApi(request,env){
  const url=new URL(request.url);
  if(url.pathname===AUTH_EXCHANGE_PATH&&request.method==='POST')return authBridge(request,env,'exchange');
  if(url.pathname===AUTH_REFRESH_PATH&&request.method==='POST')return authBridge(request,env,'refresh');
  if(url.pathname===PREFIX+'/page-data'&&request.method==='GET'){if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return publicStorageRead('page-data',()=>listPublicPageData(env));}
  if(url.pathname===PREFIX+'/content'&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
    return publicStorageRead('content',async()=>{
      const [noticesResponse,channelsResponse]=await Promise.all([listPublicNotices(env),listPublicChannels(env)]);
      const noticesBody=await noticesResponse.json().catch(()=>({items:[]}));
      const channelsBody=await channelsResponse.json().catch(()=>({items:[]}));
      return json({ok:true,notices:noticesBody.items||[],channels:channelsBody.items||[]});
    });
  }
  if(url.pathname===PREFIX+'/timeline'&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return publicStorageRead('timeline',()=>listPublicTimeline(env));
  }
  if(url.pathname===PREFIX+'/notices'&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return publicStorageRead('notices',()=>listPublicNotices(env));
  }
  if(url.pathname===PREFIX+'/notices'&&request.method==='POST'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return createPublicNotice(request,env);
  }
  const noticeImageMatch=url.pathname.match(/^\/api\/seonammedi\/notices\/(\d+)\/image$/);
  if(noticeImageMatch&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return publicNoticeImage(env,Number(noticeImageMatch[1]));
  }
  if(url.pathname===PREFIX+'/channels'&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);return publicStorageRead('channels',()=>listPublicChannels(env));
  }
  const channelPreviewMatch=url.pathname.match(/^\/api\/seonammedi\/channels\/(\d+)\/preview$/);
  if(channelPreviewMatch&&request.method==='GET'){
    if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable'},503);
    return publicStorageRead('channel-preview',()=>publicChannelPreview(env,Number(channelPreviewMatch[1])));
  }
  const publicMinutes=url.pathname.match(/^\/api\/seonammedi\/minutes\/([A-Za-z0-9_-]{20,160})\/viewers$/);
  if(publicMinutes)return publicMinuteView(request,env,publicMinutes[1]);
  if(!url.pathname.startsWith(PREFIX+'/admin/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'GET, POST, PUT, DELETE, OPTIONS','cache-control':'no-store'}});
  const auth=await authority(request,env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status||403);
  if(url.pathname===PREFIX+'/admin/me'&&request.method==='GET')return adminMe(request,env,auth);
  if(url.pathname===PREFIX+'/admin/monitor/run'&&request.method==='POST'){
    if(!(can(auth,PAGE_CAP)||can(auth,CONTENT_CAP)))return json({ok:false,error:'health_forbidden'},403);
    const result=await runSeonamMediDailyCheck(env,{scheduledAt:new Date().toISOString(),force:true});
    await audit(env,auth,'run','monitor',result?.runId||null,{status:result?.status||'',checked:Number(result?.checked||0),seen:Number(result?.seen||0),added:Number(result?.added||0)});
    return json({ok:Boolean(result?.ok),result},result?.ok===false?502:200);
  }
  let pageMatch=url.pathname.match(/^\/api\/seonammedi\/admin\/pages\/(status|organization)$/);
  if(pageMatch&&request.method==='GET')return getAdminPage(env,auth,pageMatch[1]);
  if(pageMatch&&request.method==='PUT')return putAdminPage(request,env,auth,pageMatch[1]);
  if(url.pathname===PREFIX+'/admin/finance'&&request.method==='GET')return listAdminFinance(env,auth);
  if(url.pathname===PREFIX+'/admin/finance'&&request.method==='POST')return createFinance(request,env,auth);
  let financeMatch=url.pathname.match(/^\/api\/seonammedi\/admin\/finance\/(\d+)$/);
  if(financeMatch&&request.method==='PUT')return updateFinance(request,env,auth,Number(financeMatch[1]));
  if(financeMatch&&request.method==='DELETE')return deleteFinance(env,auth,Number(financeMatch[1]));
  if(url.pathname===PREFIX+'/admin/minutes'&&request.method==='GET')return listAdminMinutes(env,auth);
  if(url.pathname===PREFIX+'/admin/minutes'&&request.method==='POST')return createMinute(request,env,auth);
  let minutesMatch=url.pathname.match(/^\/api\/seonammedi\/admin\/minutes\/(\d+)$/);
  if(minutesMatch&&request.method==='PUT')return updateMinute(request,env,auth,Number(minutesMatch[1]));
  if(minutesMatch&&request.method==='DELETE')return deleteMinute(env,auth,Number(minutesMatch[1]));
  if(url.pathname===PREFIX+'/admin/notices'&&request.method==='GET')return listAdminNotices(env,auth);
  if(url.pathname===PREFIX+'/admin/notices'&&request.method==='POST')return createNotice(request,env,auth);
  let match=url.pathname.match(/^\/api\/seonammedi\/admin\/notices\/(\d+)$/);
  if(match&&request.method==='PUT')return updateNotice(request,env,auth,Number(match[1]));
  if(match&&request.method==='DELETE')return deleteNotice(env,auth,Number(match[1]));
  if(url.pathname===PREFIX+'/admin/timeline'&&request.method==='GET')return listAdminTimeline(env,auth);
  if(url.pathname===PREFIX+'/admin/timeline'&&request.method==='POST')return createTimeline(request,env,auth);
  let timelineMatch=url.pathname.match(/^\/api\/seonammedi\/admin\/timeline\/(\d+)$/);
  if(timelineMatch&&request.method==='PUT')return updateTimeline(request,env,auth,Number(timelineMatch[1]));
  if(timelineMatch&&request.method==='DELETE')return deleteTimeline(env,auth,Number(timelineMatch[1]));
  if(url.pathname===PREFIX+'/admin/voices'&&request.method==='GET')return listAdminVoices(env,auth);
  let voiceMatch=url.pathname.match(/^\/api\/seonammedi\/admin\/voices\/(\d+)$/);
  if(voiceMatch&&request.method==='PUT')return updateAdminVoice(request,env,auth,Number(voiceMatch[1]));
  if(voiceMatch&&request.method==='DELETE')return deleteAdminVoice(env,auth,Number(voiceMatch[1]));
  if(url.pathname===PREFIX+'/admin/content'&&request.method==='GET')return listAdminContent(env,auth);
  let contentMatch=url.pathname.match(/^\/api\/seonammedi\/admin\/content\/(\d+)$/);
  if(contentMatch&&request.method==='PUT')return updateAdminContent(request,env,auth,Number(contentMatch[1]));
  if(url.pathname===PREFIX+'/admin/channels'&&request.method==='GET')return listAdminChannels(env,auth);
  if(url.pathname===PREFIX+'/admin/channels'&&request.method==='POST')return createChannel(request,env,auth);
  match=url.pathname.match(/^\/api\/seonammedi\/admin\/channels\/(\d+)$/);
  if(match&&request.method==='PUT')return updateChannel(request,env,auth,Number(match[1]));
  if(match&&request.method==='DELETE')return deleteChannel(env,auth,Number(match[1]));
  return json({ok:false,error:'not_found'},404);
}

export const SEONAM_MEDI_ADMIN_CAPABILITIES=Object.freeze({notices:NOTICE_CAP,channels:CHANNEL_CAP,content:CONTENT_CAP,timeline:TIMELINE_CAP,voices:VOICE_CAP,pages:PAGE_CAP,finance:FINANCE_CAP,minutes:MINUTES_CAP});
