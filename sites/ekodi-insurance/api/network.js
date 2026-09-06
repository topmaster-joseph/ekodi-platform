const PARTNER_TYPES=new Set(['insurer','ga','planner','affiliate','other']);
const PARTNER_STATUS=new Set(['candidate','review','approved','paused','rejected']);
const AGREEMENT_STATUS=new Set(['none','review','signed','expired']);
const FEED_MODES=new Set(['manual','file','api']);
const ITEM_STATUS=new Set(['draft','review','approved','paused']);
const OUTCOME_STAGES=new Set(['queued','assigned','contacted','completed','declined','cancelled']);
const enc=new TextEncoder();

function clean(value,max=500){return String(value??'').trim().slice(0,max)}
function id(value,prefix){const v=clean(value,120);return new RegExp(`^${prefix}_[a-z0-9-]+$`,'i').test(v)?v:''}
function secureEqual(a,b){const aa=enc.encode(String(a||'')),bb=enc.encode(String(b||''));if(!aa.length||aa.length!==bb.length)return false;let d=0;for(let i=0;i<aa.length;i+=1)d|=aa[i]^bb[i];return d===0}
function internalAuthorized(request,env){return secureEqual(request.headers.get('x-ekodi-insurance-internal-token'),env.INSURANCE_INTERNAL_TOKEN)}
function comparisonEnabled(env){return clean(env.INSURANCE_COMPARISON_PUBLIC_ENABLED,16).toLowerCase()==='true'}
function safeUrl(value){const raw=clean(value,800);if(!raw)return'';try{const u=new URL(raw);return u.protocol==='https:'?u.toString():''}catch{return''}}
async function body(request){try{return await request.json()}catch{return null}}

export async function networkReady(env){
  if(!env.DB)return false;
  try{const rows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('insurance_partners','insurance_catalog_items','insurance_consultation_outcomes','insurance_advisor_profiles','insurance_advisor_consultation_links')").all();return new Set((rows.results||[]).map(r=>r.name)).size===5}catch{return false}
}

async function listPartners(env){
  const rows=await env.DB.prepare(`SELECT id,name,partner_type AS partnerType,status,agreement_status AS agreementStatus,feed_mode AS feedMode,public_label AS publicLabel,compliance_note AS complianceNote,created_at AS createdAt,updated_at AS updatedAt FROM insurance_partners ORDER BY updated_at DESC`).all();
  return{partners:rows.results||[]};
}
async function putPartner(partnerId,request,env){
  const input=await body(request);if(!input)return{status:400,body:{error:'partner_payload_required'}};
  const pid=id(partnerId,'par');if(!pid)return{status:400,body:{error:'invalid_partner_id'}};
  const type=clean(input.partnerType,20),status=clean(input.status,20),agreement=clean(input.agreementStatus,20),feed=clean(input.feedMode,20);
  if(!PARTNER_TYPES.has(type)||!PARTNER_STATUS.has(status)||!AGREEMENT_STATUS.has(agreement)||!FEED_MODES.has(feed))return{status:400,body:{error:'invalid_partner_state'}};
  const name=clean(input.name,120);if(!name)return{status:400,body:{error:'partner_name_required'}};
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO insurance_partners(id,name,partner_type,status,agreement_status,feed_mode,public_label,compliance_note,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,partner_type=excluded.partner_type,status=excluded.status,agreement_status=excluded.agreement_status,feed_mode=excluded.feed_mode,public_label=excluded.public_label,compliance_note=excluded.compliance_note,updated_at=excluded.updated_at`)
    .bind(pid,name,type,status,agreement,feed,clean(input.publicLabel,120),clean(input.complianceNote,600),now,now).run();
  return{status:200,body:{partner:{id:pid,name,partnerType:type,status,agreementStatus:agreement,feedMode:feed,updatedAt:now}}};
}

async function listCatalog(url,env,publicOnly=false){
  const category=clean(url.searchParams.get('category'),60);
  const where=publicOnly?"WHERE i.status='approved' AND i.comparison_approved=1 AND p.status='approved' AND p.agreement_status='signed'":(category?'WHERE i.category=?':'');
  const sql=`SELECT i.id,i.partner_id AS partnerId,p.name AS partnerName,i.external_ref AS externalRef,i.insurer_name AS insurerName,i.item_name AS itemName,i.category,i.summary,i.landing_url AS landingUrl,i.status,i.comparison_approved AS comparisonApproved,i.updated_at AS updatedAt FROM insurance_catalog_items i JOIN insurance_partners p ON p.id=i.partner_id ${where} ORDER BY i.updated_at DESC LIMIT 200`;
  const rows=category&&!publicOnly?await env.DB.prepare(sql).bind(category).all():await env.DB.prepare(sql).all();
  return{items:(rows.results||[]).map(x=>({...x,comparisonApproved:Boolean(x.comparisonApproved)}))};
}
async function putCatalog(itemId,request,env){
  const input=await body(request);if(!input)return{status:400,body:{error:'catalog_payload_required'}};
  const iid=id(itemId,'off'),partnerId=id(input.partnerId,'par');if(!iid||!partnerId)return{status:400,body:{error:'invalid_catalog_identity'}};
  const status=clean(input.status,20);if(!ITEM_STATUS.has(status))return{status:400,body:{error:'invalid_catalog_status'}};
  const partner=await env.DB.prepare('SELECT status,agreement_status FROM insurance_partners WHERE id=?').bind(partnerId).first();
  if(!partner)return{status:404,body:{error:'partner_not_found'}};
  const comparisonApproved=input.comparisonApproved===true;
  if(comparisonApproved&&(partner.status!=='approved'||partner.agreement_status!=='signed'))return{status:409,body:{error:'comparison_requires_approved_signed_partner'}};
  const name=clean(input.itemName,160);if(!name)return{status:400,body:{error:'catalog_item_name_required'}};
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO insurance_catalog_items(id,partner_id,external_ref,insurer_name,item_name,category,summary,landing_url,status,comparison_approved,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET partner_id=excluded.partner_id,external_ref=excluded.external_ref,insurer_name=excluded.insurer_name,item_name=excluded.item_name,category=excluded.category,summary=excluded.summary,landing_url=excluded.landing_url,status=excluded.status,comparison_approved=excluded.comparison_approved,updated_at=excluded.updated_at`)
    .bind(iid,partnerId,clean(input.externalRef,160),clean(input.insurerName,120),name,clean(input.category,60)||'general',clean(input.summary,700),safeUrl(input.landingUrl),status,comparisonApproved?1:0,now,now).run();
  return{status:200,body:{item:{id:iid,partnerId,itemName:name,status,comparisonApproved,updatedAt:now}}};
}

async function funnel(env){
  const [consultations,outcomes,partners,catalog]=await Promise.all([
    env.DB.prepare("SELECT status,COUNT(*) AS n FROM consultation_requests WHERE status!='revoked' GROUP BY status").all(),
    env.DB.prepare('SELECT stage,COUNT(*) AS n,SUM(revenue_krw) AS revenue FROM insurance_consultation_outcomes GROUP BY stage').all(),
    env.DB.prepare("SELECT status,COUNT(*) AS n FROM insurance_partners GROUP BY status").all(),
    env.DB.prepare("SELECT status,comparison_approved AS approved,COUNT(*) AS n FROM insurance_catalog_items GROUP BY status,comparison_approved").all()
  ]);
  return{consultations:consultations.results||[],outcomes:outcomes.results||[],partners:partners.results||[],catalog:catalog.results||[]};
}
async function putOutcome(consultationId,request,env){
  const cid=id(consultationId,'con');if(!cid)return{status:400,body:{error:'invalid_consultation_id'}};
  const exists=await env.DB.prepare("SELECT id FROM consultation_requests WHERE id=? AND status!='revoked'").bind(cid).first();if(!exists)return{status:404,body:{error:'consultation_not_found'}};
  const input=await body(request);if(!input)return{status:400,body:{error:'outcome_payload_required'}};
  const stage=clean(input.stage,20);if(!OUTCOME_STAGES.has(stage))return{status:400,body:{error:'invalid_outcome_stage'}};
  const partnerId=input.partnerId?id(input.partnerId,'par'):null;
  if(partnerId){const partner=await env.DB.prepare("SELECT id FROM insurance_partners WHERE id=? AND status='approved'").bind(partnerId).first();if(!partner)return{status:409,body:{error:'outcome_partner_must_be_approved'}}}
  const now=new Date().toISOString(),actor=clean(request.headers.get('x-ekodi-actor'),240)||'central-admin';
  await env.DB.prepare(`INSERT INTO insurance_consultation_outcomes(consultation_id,partner_id,stage,outcome_code,external_case_ref,revenue_krw,note,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(consultation_id) DO UPDATE SET partner_id=excluded.partner_id,stage=excluded.stage,outcome_code=excluded.outcome_code,external_case_ref=excluded.external_case_ref,revenue_krw=excluded.revenue_krw,note=excluded.note,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(cid,partnerId,stage,clean(input.outcomeCode,80),clean(input.externalCaseRef,160),Math.max(0,Math.trunc(Number(input.revenueKrw)||0)),clean(input.note,600),actor,now).run();
  return{status:200,body:{outcome:{consultationId:cid,partnerId,stage,updatedAt:now}}};
}

function advisorPublishable(row){
  if(!row)return false;
  const expires=row.advertising_review_expires_at?Date.parse(row.advertising_review_expires_at):NaN;
  return Boolean(clean(row.display_name,120)&&clean(row.insurer_name,120)&&clean(row.registration_reference,120)&&safeUrl(row.verification_url)&&clean(row.advertising_review_ref,120)&&(!Number.isFinite(expires)||expires>Date.now()));
}
function normalizeAdvisor(row){
  if(!row)return null;
  return {id:row.id,slug:row.slug,displayName:row.display_name,insurerName:row.insurer_name,roleLabel:row.role_label,intro:row.intro,registrationReference:row.registration_reference,verificationUrl:row.verification_url,officialCompanyUrl:row.official_company_url,advertisingReviewRef:row.advertising_review_ref,advertisingReviewExpiresAt:row.advertising_review_expires_at||'',publicEnabled:Boolean(row.public_enabled),publishable:advisorPublishable(row),updatedAt:row.updated_at};
}
async function advisorProfile(env,publicOnly=false){
  const row=await env.DB.prepare('SELECT * FROM insurance_advisor_profiles WHERE id=?').bind('adv_primary').first();
  const profile=normalizeAdvisor(row);
  if(publicOnly&&(!profile?.publicEnabled||!profile.publishable))return null;
  return profile;
}
async function putAdvisorProfile(request,env){
  const input=await body(request);if(!input)return{status:400,body:{error:'advisor_profile_payload_required'}};
  const existing=await env.DB.prepare('SELECT * FROM insurance_advisor_profiles WHERE id=?').bind('adv_primary').first();
  const publicEnabled=input.publicEnabled===true;
  const next={displayName:clean(input.displayName??existing?.display_name,120),insurerName:clean(input.insurerName??existing?.insurer_name,120)||'롯데손해보험',roleLabel:clean(input.roleLabel??existing?.role_label,80)||'보험설계사',intro:clean(input.intro??existing?.intro,1200),registrationReference:clean(input.registrationReference??existing?.registration_reference,120),verificationUrl:safeUrl(input.verificationUrl??existing?.verification_url),officialCompanyUrl:safeUrl(input.officialCompanyUrl??existing?.official_company_url),advertisingReviewRef:clean(input.advertisingReviewRef??existing?.advertising_review_ref,120),advertisingReviewExpiresAt:clean(input.advertisingReviewExpiresAt??existing?.advertising_review_expires_at,40)};
  const check={display_name:next.displayName,insurer_name:next.insurerName,registration_reference:next.registrationReference,verification_url:next.verificationUrl,advertising_review_ref:next.advertisingReviewRef,advertising_review_expires_at:next.advertisingReviewExpiresAt};
  if(publicEnabled&&!advisorPublishable(check))return{status:409,body:{error:'advisor_publish_requires_verified_identity_and_review'}};
  const now=new Date().toISOString();
  await env.DB.prepare('UPDATE insurance_advisor_profiles SET display_name=?,insurer_name=?,role_label=?,intro=?,registration_reference=?,verification_url=?,official_company_url=?,advertising_review_ref=?,advertising_review_expires_at=?,public_enabled=?,updated_at=? WHERE id=?').bind(next.displayName,next.insurerName,next.roleLabel,next.intro,next.registrationReference,next.verificationUrl,next.officialCompanyUrl,next.advertisingReviewRef,next.advertisingReviewExpiresAt||null,publicEnabled?1:0,now,'adv_primary').run();
  return{status:200,body:{profile:await advisorProfile(env,false)}};
}
export async function linkAdvisorConsultation(env,consultationId,advisorProfileId){
  const aid=clean(advisorProfileId,80);if(!aid)return false;
  const row=await env.DB.prepare('SELECT * FROM insurance_advisor_profiles WHERE id=?').bind(aid).first();
  if(!row||!row.public_enabled||!advisorPublishable(row))return false;
  await env.DB.prepare('INSERT OR REPLACE INTO insurance_advisor_consultation_links(consultation_id,advisor_profile_id,created_at) VALUES(?,?,?)').bind(consultationId,aid,new Date().toISOString()).run();
  return true;
}

export async function handleInsuranceNetwork(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(request.method==='GET'&&path==='/api/advisor/profile'){const profile=await advisorProfile(env,true);return profile?{status:200,body:{profile}}:{status:404,body:{error:'advisor_profile_not_public'}};}
  if(request.method==='GET'&&path==='/api/network/catalog'){
    if(!comparisonEnabled(env))return{status:200,body:{enabled:false,mode:'reference-only',items:[],reason:'compliance-gate'}};
    return{status:200,body:{enabled:true,mode:'reference-only',...(await listCatalog(url,env,true))}};
  }
  if(!path.startsWith('/api/internal/network/'))return null;
  if(!internalAuthorized(request,env))return{status:401,body:{error:'Internal admin authorization required.'}};
  if(request.method==='GET'&&path==='/api/internal/network/advisor-profile')return{status:200,body:{profile:await advisorProfile(env,false)}};
  if(request.method==='PUT'&&path==='/api/internal/network/advisor-profile')return putAdvisorProfile(request,env);
  if(request.method==='GET'&&path==='/api/internal/network/partners')return{status:200,body:await listPartners(env)};
  const partner=path.match(/^\/api\/internal\/network\/partners\/(par_[a-z0-9-]+)$/i);if(request.method==='PUT'&&partner)return putPartner(partner[1],request,env);
  if(request.method==='GET'&&path==='/api/internal/network/catalog')return{status:200,body:await listCatalog(url,env,false)};
  const item=path.match(/^\/api\/internal\/network\/catalog\/(off_[a-z0-9-]+)$/i);
  if(request.method==='PUT'&&item)return putCatalog(item[1],request,env);
  if(request.method==='GET'&&path==='/api/internal/network/funnel')return{status:200,body:await funnel(env)};
  const outcome=path.match(/^\/api\/internal\/network\/outcomes\/(con_[a-z0-9-]+)$/i);
  if(request.method==='PUT'&&outcome)return putOutcome(outcome[1],request,env);
  return{status:404,body:{error:'insurance_network_endpoint_not_found'}};
}
