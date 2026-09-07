const OWNER_TYPES=new Set(['person','organization']);
const PRACTICE_STATUS=new Set(['active','paused']);
const RELATIONSHIP_TYPES=new Set(['agent','planner','ga','agency','broker','employee','other']);
const AFFILIATION_STATUS=new Set(['pending','verified','active','paused','ended']);
const CONNECTOR_MODES=new Set(['handoff','read_only','api']);
const CONNECTOR_STATUS=new Set(['unavailable','review','connected','paused']);
const PROJECTION_STAGES=new Set(['unassigned','queued','contacted','designed','submitted','completed','closed']);

function clean(value,max=500){return String(value??'').trim().slice(0,max)}
function safeUrl(value){const raw=clean(value,800);if(!raw)return'';try{const u=new URL(raw);return u.protocol==='https:'?u.toString():''}catch{return''}}
function typedId(value,prefix){const v=clean(value,120);return new RegExp(`^${prefix}_[a-z0-9-]+$`,'i').test(v)?v:''}
async function readBody(request){try{return await request.json()}catch{return null}}
function publicAffiliationReady(row){return Boolean(row&&row.status==='active'&&clean(row.registration_reference,120)&&safeUrl(row.verification_url))}

export async function practiceReady(env){
  if(!env.DB)return false;
  try{
    const rows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('insurance_practices','insurance_practice_members','insurance_affiliations','insurance_provider_connectors','insurance_consultation_projections')").all();
    return new Set((rows.results||[]).map(r=>r.name)).size===5;
  }catch{return false}
}

async function getPractice(env){
  const row=await env.DB.prepare('SELECT id,slug,owner_type AS ownerType,display_name AS displayName,status,created_at AS createdAt,updated_at AS updatedAt FROM insurance_practices WHERE id=?').bind('prc_primary').first();
  return row||null;
}
async function putPractice(request,env){
  const input=await readBody(request);if(!input)return{status:400,body:{error:'practice_payload_required'}};
  const existing=await getPractice(env);
  const ownerType=clean(input.ownerType??existing?.ownerType,20)||'person';
  const status=clean(input.status??existing?.status,20)||'active';
  if(!OWNER_TYPES.has(ownerType)||!PRACTICE_STATUS.has(status))return{status:400,body:{error:'invalid_practice_state'}};
  const displayName=clean(input.displayName??existing?.displayName,120);
  const slug=clean(input.slug??existing?.slug,80).toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!slug)return{status:400,body:{error:'practice_slug_required'}};
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO insurance_practices(id,slug,owner_type,owner_ref,display_name,status,created_at,updated_at)
    VALUES('prc_primary',?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,owner_type=excluded.owner_type,display_name=excluded.display_name,status=excluded.status,updated_at=excluded.updated_at`)
    .bind(slug,ownerType,'',displayName,status,existing?.createdAt||now,now).run();
  return{status:200,body:{practice:await getPractice(env)}};
}

async function listAffiliations(env,publicOnly=false){
  const where=publicOnly?"WHERE practice_id='prc_primary' AND public_enabled=1 AND status='active'":"WHERE practice_id='prc_primary'";
  const rows=await env.DB.prepare(`SELECT id,practice_id AS practiceId,carrier_key AS carrierKey,carrier_name AS carrierName,relationship_type AS relationshipType,status,registration_reference AS registrationReference,verification_url AS verificationUrl,official_company_url AS officialCompanyUrl,public_enabled AS publicEnabled,created_at AS createdAt,updated_at AS updatedAt FROM insurance_affiliations ${where} ORDER BY carrier_name`).all();
  return{affiliations:(rows.results||[]).filter(x=>!publicOnly||publicAffiliationReady({status:x.status,registration_reference:x.registrationReference,verification_url:x.verificationUrl})).map(x=>({...x,publicEnabled:Boolean(x.publicEnabled)}))};
}

async function putAffiliation(affiliationId,request,env){
  const input=await readBody(request);if(!input)return{status:400,body:{error:'affiliation_payload_required'}};
  const aid=typedId(affiliationId,'aff');if(!aid)return{status:400,body:{error:'invalid_affiliation_id'}};
  const carrierKey=clean(input.carrierKey,80).toLowerCase().replace(/[^a-z0-9-]/g,'');
  const carrierName=clean(input.carrierName,120),relationshipType=clean(input.relationshipType,20),status=clean(input.status,20);
  if(!carrierKey||!carrierName||!RELATIONSHIP_TYPES.has(relationshipType)||!AFFILIATION_STATUS.has(status))return{status:400,body:{error:'invalid_affiliation_state'}};
  const registrationReference=clean(input.registrationReference,120),verificationUrl=safeUrl(input.verificationUrl),officialCompanyUrl=safeUrl(input.officialCompanyUrl),publicEnabled=input.publicEnabled===true;
  if(publicEnabled&&!publicAffiliationReady({status,registration_reference:registrationReference,verification_url:verificationUrl}))return{status:409,body:{error:'affiliation_public_requires_active_verified_identity'}};
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO insurance_affiliations(id,practice_id,carrier_key,carrier_name,relationship_type,status,registration_reference,verification_url,official_company_url,public_enabled,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET carrier_key=excluded.carrier_key,carrier_name=excluded.carrier_name,relationship_type=excluded.relationship_type,status=excluded.status,registration_reference=excluded.registration_reference,verification_url=excluded.verification_url,official_company_url=excluded.official_company_url,public_enabled=excluded.public_enabled,updated_at=excluded.updated_at`)
    .bind(aid,'prc_primary',carrierKey,carrierName,relationshipType,status,registrationReference,verificationUrl,officialCompanyUrl,publicEnabled?1:0,now,now).run();
  return{status:200,body:{affiliation:{id:aid,practiceId:'prc_primary',carrierKey,carrierName,relationshipType,status,registrationReference,verificationUrl,officialCompanyUrl,publicEnabled,updatedAt:now}}};
}

async function listConnectors(url,env){
  const affiliationId=typedId(url.searchParams.get('affiliationId'),'aff');
  const sql=`SELECT c.id,c.affiliation_id AS affiliationId,a.carrier_name AS carrierName,c.provider_key AS providerKey,c.label,c.mode,c.official_url AS officialUrl,c.app_url AS appUrl,c.api_status AS apiStatus,c.created_at AS createdAt,c.updated_at AS updatedAt FROM insurance_provider_connectors c JOIN insurance_affiliations a ON a.id=c.affiliation_id ${affiliationId?'WHERE c.affiliation_id=?':''} ORDER BY a.carrier_name,c.label`;
  const rows=affiliationId?await env.DB.prepare(sql).bind(affiliationId).all():await env.DB.prepare(sql).all();
  return{connectors:rows.results||[]};
}

async function putConnector(connectorId,request,env){
  const input=await readBody(request);if(!input)return{status:400,body:{error:'connector_payload_required'}};
  const cid=typedId(connectorId,'cnx'),affiliationId=typedId(input.affiliationId,'aff');
  if(!cid||!affiliationId)return{status:400,body:{error:'invalid_connector_identity'}};
  const affiliation=await env.DB.prepare('SELECT id FROM insurance_affiliations WHERE id=? AND practice_id=?').bind(affiliationId,'prc_primary').first();
  if(!affiliation)return{status:404,body:{error:'affiliation_not_found'}};
  const providerKey=clean(input.providerKey,80).toLowerCase().replace(/[^a-z0-9-]/g,''),label=clean(input.label,120),mode=clean(input.mode,20),apiStatus=clean(input.apiStatus,20);
  if(!providerKey||!label||!CONNECTOR_MODES.has(mode)||!CONNECTOR_STATUS.has(apiStatus))return{status:400,body:{error:'invalid_connector_state'}};
  if(mode==='api'&&apiStatus!=='connected')return{status:409,body:{error:'api_connector_requires_verified_connection'}};
  const officialUrl=safeUrl(input.officialUrl),appUrl=safeUrl(input.appUrl),now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO insurance_provider_connectors(id,affiliation_id,provider_key,label,mode,official_url,app_url,api_status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET affiliation_id=excluded.affiliation_id,provider_key=excluded.provider_key,label=excluded.label,mode=excluded.mode,official_url=excluded.official_url,app_url=excluded.app_url,api_status=excluded.api_status,updated_at=excluded.updated_at`)
    .bind(cid,affiliationId,providerKey,label,mode,officialUrl,appUrl,apiStatus,now,now).run();
  return{status:200,body:{connector:{id:cid,affiliationId,providerKey,label,mode,officialUrl,appUrl,apiStatus,updatedAt:now}}};
}

async function workSummary(url,env){
  const affiliationId=typedId(url.searchParams.get('affiliationId'),'aff');
  const where=affiliationId?'WHERE p.affiliation_id=?':'';
  const sql=`SELECT p.affiliation_id AS affiliationId,a.carrier_name AS carrierName,p.stage,COUNT(*) AS n FROM insurance_consultation_projections p JOIN insurance_affiliations a ON a.id=p.affiliation_id ${where} GROUP BY p.affiliation_id,a.carrier_name,p.stage ORDER BY a.carrier_name,p.stage`;
  const rows=affiliationId?await env.DB.prepare(sql).bind(affiliationId).all():await env.DB.prepare(sql).all();
  return{mode:'carrier-isolated',projections:rows.results||[]};
}

async function putProjection(consultationId,request,env){
  const consultation=typedId(consultationId,'con');if(!consultation)return{status:400,body:{error:'invalid_consultation_id'}};
  const input=await readBody(request);if(!input)return{status:400,body:{error:'projection_payload_required'}};
  const affiliationId=typedId(input.affiliationId,'aff'),stage=clean(input.stage,20);
  if(!affiliationId||!PROJECTION_STAGES.has(stage))return{status:400,body:{error:'invalid_projection_state'}};
  const [consultationRow,affiliation]=await Promise.all([
    env.DB.prepare("SELECT id FROM consultation_requests WHERE id=? AND status!='revoked'").bind(consultation).first(),
    env.DB.prepare("SELECT id,status FROM insurance_affiliations WHERE id=? AND practice_id='prc_primary'").bind(affiliationId).first()
  ]);
  if(!consultationRow)return{status:404,body:{error:'consultation_not_found'}};
  if(!affiliation||!['verified','active'].includes(affiliation.status))return{status:409,body:{error:'projection_requires_verified_affiliation'}};
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO insurance_consultation_projections(consultation_id,affiliation_id,stage,external_case_ref,note,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(consultation_id,affiliation_id) DO UPDATE SET stage=excluded.stage,external_case_ref=excluded.external_case_ref,note=excluded.note,updated_at=excluded.updated_at`)
    .bind(consultation,affiliationId,stage,clean(input.externalCaseRef,160),clean(input.note,600),now).run();
  return{status:200,body:{projection:{consultationId:consultation,affiliationId,stage,updatedAt:now}}};
}

export async function linkConsultationAffiliation(env,consultationId,affiliationId){
  const cid=typedId(consultationId,'con'),aid=typedId(affiliationId,'aff');if(!cid||!aid)return false;
  const row=await env.DB.prepare("SELECT * FROM insurance_affiliations WHERE id=? AND practice_id='prc_primary' AND public_enabled=1 AND status='active'").bind(aid).first();
  if(!row||!publicAffiliationReady(row))return false;
  await env.DB.prepare(`INSERT INTO insurance_consultation_projections(consultation_id,affiliation_id,stage,external_case_ref,note,updated_at)
    VALUES(?,?,'queued','','',?) ON CONFLICT(consultation_id,affiliation_id) DO UPDATE SET stage='queued',updated_at=excluded.updated_at`)
    .bind(cid,aid,new Date().toISOString()).run();
  return true;
}

export async function publicPracticeSnapshot(env){
  if(!await practiceReady(env))return null;
  const [practice,affiliations,connectors]=await Promise.all([getPractice(env),listAffiliations(env,true),listConnectors(new URL('https://insurance.local/api/internal/network/connectors'),env)]);
  if(!practice||practice.status!=='active')return null;
  const allowed=new Set(affiliations.affiliations.map(x=>x.id));
  const publicConnectors=(connectors.connectors||[]).filter(x=>allowed.has(x.affiliationId)&&['handoff','read_only'].includes(x.mode)).map(x=>({id:x.id,affiliationId:x.affiliationId,label:x.label,mode:x.mode,officialUrl:x.officialUrl,appUrl:x.appUrl}));
  return{practice:{id:practice.id,slug:practice.slug,displayName:practice.displayName,ownerType:practice.ownerType},affiliations:affiliations.affiliations,connectors:publicConnectors};
}

export async function handleInsurancePractice(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/internal/network/practice'&&request.method==='GET')return{status:200,body:{practice:await getPractice(env)}};
  if(path==='/api/internal/network/practice'&&request.method==='PUT')return putPractice(request,env);
  if(path==='/api/internal/network/affiliations'&&request.method==='GET')return{status:200,body:await listAffiliations(env,false)};
  const affiliation=path.match(/^\/api\/internal\/network\/affiliations\/(aff_[a-z0-9-]+)$/i);
  if(affiliation&&request.method==='PUT')return putAffiliation(affiliation[1],request,env);
  if(path==='/api/internal/network/connectors'&&request.method==='GET')return{status:200,body:await listConnectors(url,env)};
  const connector=path.match(/^\/api\/internal\/network\/connectors\/(cnx_[a-z0-9-]+)$/i);
  if(connector&&request.method==='PUT')return putConnector(connector[1],request,env);
  if(path==='/api/internal/network/work-summary'&&request.method==='GET')return{status:200,body:await workSummary(url,env)};
  const projection=path.match(/^\/api\/internal\/network\/projections\/(con_[a-z0-9-]+)$/i);
  if(projection&&request.method==='PUT')return putProjection(projection[1],request,env);
  return null;
}
