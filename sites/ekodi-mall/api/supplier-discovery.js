const CANDIDATE_TRANSITIONS = Object.freeze({
  discovered: new Set(['screening','rejected']),
  screening: new Set(['shortlisted','rejected']),
  shortlisted: new Set(['outreach_ready','rejected']),
  outreach_ready: new Set(['contacted','rejected']),
  contacted: new Set(['due_diligence_ready','rejected']),
  due_diligence_ready: new Set(['converted','rejected']),
  converted: new Set(),
  rejected: new Set()
});
const VALID_DISCOVERY_SOURCES = new Set(['manual','public_web','referral','trade_show','government_directory','marketplace_reference']);
const VALID_EVIDENCE_TYPES = new Set(['business_identity','catalog','dropship','pricing','stock','returns','cs','pii','api','contact','rights','other']);
const VALID_OUTREACH_CHANNELS = new Set(['email','phone','webform','kakao','other']);
const VALID_SCENARIOS = new Set(['direct','marketplace','ai']);
const FEE_RATES = Object.freeze({ direct: 7, marketplace: 8, ai: 9 });
const STOCK_FRESH_DAYS = 7;

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const flag = (value) => String(value || '').toLowerCase() === 'true';
const httpsUrl = (value) => {
  const text = clean(value, 1200);
  if (!text) return '';
  try { const url = new URL(text); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
};
const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const cleanQuantity = (value) => Math.max(1, Math.min(99, Math.trunc(Number(value) || 1)));
const daysAgoIso = (days) => new Date(Date.now() - days * 86400000).toISOString();

async function readJson(request) { try { return await request.json(); } catch { return null; } }

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function allowedOpsEmails(env) {
  return new Set(clean(env.MALL_OPERATIONS_EMAILS, 2000).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

async function authorizeOperations(request, env) {
  const supplied = request.headers.get('x-ekodi-mall-ops-token') || '';
  if (env.MALL_OPERATIONS_TOKEN && supplied && supplied === env.MALL_OPERATIONS_TOKEN) return { ok: true, actor: 'mall-ops:service-token' };
  const user = await authenticate(request, env);
  if (!user) return { ok: false, status: 401, error: 'Mall 운영자 Google 로그인이 필요합니다.' };
  const email = clean(user.email, 240).toLowerCase();
  const allow = allowedOpsEmails(env);
  if (!allow.size) return { ok: false, status: 503, error: 'Mall 운영자 이메일 allowlist가 구성되지 않았습니다.' };
  if (!allow.has(email)) return { ok: false, status: 403, error: '이 Google 계정은 Supplier Discovery 권한이 없습니다.' };
  return { ok: true, actor: `mall-ops:${email}`, user };
}

export function scoreSupplierCandidate(input = {}) {
  const businessIdentityStatus = clean(input.businessIdentityStatus || input.business_identity_status, 30) || 'unknown';
  const directShipStatus = clean(input.directShipStatus || input.direct_ship_status, 30) || 'unknown';
  const margin = clampPercent(input.marginPercentEstimate ?? input.margin_percent_estimate);
  const stockReliability = clean(input.stockReliability || input.stock_reliability, 30) || 'unknown';
  const returnsCsStatus = clean(input.returnsCsStatus || input.returns_cs_status, 30) || 'unknown';
  const pilotSupportStatus = clean(input.pilotSupportStatus || input.pilot_support_status, 30) || 'unknown';
  const integrationCapability = clean(input.integrationCapability || input.integration_capability, 30) || 'unknown';
  const rightsClarity = clean(input.rightsClarity || input.rights_clarity, 30) || 'unknown';
  const discoverySource = clean(input.discoverySource || input.discovery_source, 40) || 'manual';
  const blockers = [];
  let score = 0;

  if (businessIdentityStatus === 'confirmed') score += 15;
  else blockers.push(businessIdentityStatus === 'rejected' ? 'business-identity-rejected' : 'business-identity-unconfirmed');

  if (directShipStatus === 'yes') score += 20;
  else blockers.push(directShipStatus === 'no' ? 'direct-ship-unavailable' : 'direct-ship-unconfirmed');

  if (margin >= 20) score += 20;
  else if (margin >= 15) score += 18;
  else if (margin >= 10) score += 14;
  else if (margin >= 5) score += 8;

  score += ({ high: 15, medium: 10, low: 4 }[stockReliability] || 0);
  if (returnsCsStatus === 'ready') score += 10;
  else if (returnsCsStatus === 'partial') score += 5;
  else if (returnsCsStatus === 'rejected') blockers.push('returns-cs-rejected');

  if (pilotSupportStatus === 'yes') score += 10;
  else if (pilotSupportStatus === 'no') blockers.push('pilot-not-supported');

  score += ({ api: 5, feed: 4, manual: 3 }[integrationCapability] || 0);
  if (rightsClarity === 'clear') score += 5;
  else blockers.push(rightsClarity === 'restricted' ? 'product-rights-restricted' : 'product-rights-unconfirmed');

  if (discoverySource === 'marketplace_reference' && (directShipStatus !== 'yes' || rightsClarity !== 'clear')) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel = blockers.length ? 'high' : score >= 75 ? 'low' : score >= 55 ? 'medium' : 'high';
  const dueDiligenceReady = score >= 75 && blockers.length === 0;
  return {
    totalScore: score,
    riskLevel,
    criticalBlockers: blockers,
    dueDiligenceReady,
    explanation: `신원 15 · 직배송 20 · 마진 20 · 재고 15 · 반품/CS 10 · 소량파일럿 10 · 연동 5 · 상품권리 5${discoverySource === 'marketplace_reference' ? ' · 리테일참고 위험보정 최대 -10' : ''}`
  };
}

export function candidateTransitionAllowed(fromStatus, toStatus) {
  return Boolean(CANDIDATE_TRANSITIONS[fromStatus]?.has(toStatus));
}

export async function supplierDiscoverySchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const rows = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'supplier_candidates','supplier_candidate_evidence','supplier_outreach_tasks','supplier_pilot_preflights','supplier_discovery_events'
    )`).all();
    return new Set((rows.results || []).map((row) => row.name)).size === 5;
  } catch { return false; }
}

async function audit(env, actor, action, { candidateId = null, preflightId = null, metadata = {} } = {}) {
  await env.DB.prepare(`INSERT INTO supplier_discovery_events (candidate_id,preflight_id,actor,action,metadata_json,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(candidateId, preflightId, clean(actor, 240), clean(action, 120), JSON.stringify(metadata || {}).slice(0, 5000), nowIso()).run();
}

function candidateView(row) {
  if (!row) return null;
  let blockers = [];
  try { blockers = JSON.parse(row.critical_blockers_json || '[]'); } catch {}
  return {
    id: row.id, candidateCode: row.candidate_code, displayName: row.display_name, legalName: row.legal_name || '', websiteUrl: row.website_url || '',
    discoverySource: row.discovery_source, discoveryRef: row.discovery_ref || '', category: row.category || '', region: row.region || '', publicContactRef: row.public_contact_ref || '',
    status: row.candidate_status, businessIdentityStatus: row.business_identity_status, directShipStatus: row.direct_ship_status,
    marginPercentEstimate: Number(row.margin_percent_estimate || 0), stockReliability: row.stock_reliability, returnsCsStatus: row.returns_cs_status,
    pilotSupportStatus: row.pilot_support_status, integrationCapability: row.integration_capability, rightsClarity: row.rights_clarity,
    totalScore: Number(row.total_score || 0), riskLevel: row.risk_level, criticalBlockers: blockers, scoreExplanation: row.score_explanation || '',
    convertedPartnerId: row.converted_partner_id || null, lastScoredAt: row.last_scored_at || null, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

async function getCandidate(env, id) {
  return env.DB.prepare('SELECT * FROM supplier_candidates WHERE id=?').bind(id).first();
}

async function evidenceSummary(env, candidateId) {
  const rows = await env.DB.prepare(`SELECT evidence_type AS evidenceType,verification_status AS verificationStatus,COUNT(*) AS count
    FROM supplier_candidate_evidence WHERE candidate_id=? GROUP BY evidence_type,verification_status`).bind(candidateId).all();
  const confirmed = new Set((rows.results || []).filter((row) => row.verificationStatus === 'confirmed').map((row) => row.evidenceType));
  return { rows: rows.results || [], confirmed };
}

async function listContext(env) {
  const candidates = await env.DB.prepare('SELECT * FROM supplier_candidates ORDER BY total_score DESC,updated_at DESC LIMIT 200').all();
  const evidence = await env.DB.prepare(`SELECT id,candidate_id AS candidateId,evidence_type AS evidenceType,evidence_url AS evidenceUrl,summary,
    verification_status AS verificationStatus,confidence,checked_at AS checkedAt,created_at AS createdAt,updated_at AS updatedAt
    FROM supplier_candidate_evidence ORDER BY updated_at DESC LIMIT 500`).all();
  const outreach = await env.DB.prepare(`SELECT id,candidate_id AS candidateId,channel,status,public_contact_ref AS publicContactRef,subject_draft AS subjectDraft,
    message_draft AS messageDraft,response_ref AS responseRef,created_at AS createdAt,updated_at AS updatedAt
    FROM supplier_outreach_tasks ORDER BY updated_at DESC LIMIT 300`).all();
  const pilotOptions = await env.DB.prepare(`SELECT sp.id AS partnerId,sp.display_name AS partnerName,sp.onboarding_status AS partnerStatus,sp.provider_type AS providerType,
    ss.id AS sourceId,ss.seller_id AS sellerId,ss.rights_status AS rightsStatus,ss.order_permission AS orderPermission,ss.pii_permission AS piiPermission,
    sk.id AS supplierSkuId,sk.sku_code AS skuCode,sk.display_name AS skuName,sk.cost_amount AS costAmount,sk.shipping_amount AS shippingAmount,
    sk.stock_state AS stockState,sk.checked_at AS checkedAt,p.id AS productId,p.name AS productName,p.price,p.status AS productStatus,p.sale_type AS saleType,
    spl.mapping_status AS mappingStatus,spl.min_margin_amount AS minMarginAmount,spl.min_margin_percent AS minMarginPercent
    FROM supplier_skus sk
    JOIN supplier_partners sp ON sp.id=sk.partner_id
    JOIN sourcing_sources ss ON ss.id=sk.source_id
    JOIN supplier_sku_product_links spl ON spl.supplier_sku_id=sk.id AND spl.source_id=sk.source_id
    JOIN products p ON p.id=spl.product_id
    ORDER BY sp.updated_at DESC,sk.updated_at DESC LIMIT 400`).all();
  const preflights = await env.DB.prepare(`SELECT id,partner_id AS partnerId,source_id AS sourceId,supplier_sku_id AS supplierSkuId,product_id AS productId,
    scenario_source AS scenarioSource,quantity,gross_amount AS grossAmount,fee_rate_percent AS feeRatePercent,platform_fee_amount AS platformFeeAmount,
    supplier_cost_amount AS supplierCostAmount,supplier_shipping_amount AS supplierShippingAmount,contribution_margin AS contributionMargin,
    contribution_margin_percent AS contributionMarginPercent,readiness_status AS readinessStatus,blockers_json AS blockersJson,created_at AS createdAt
    FROM supplier_pilot_preflights ORDER BY created_at DESC LIMIT 200`).all();
  return {
    candidates: (candidates.results || []).map(candidateView), evidence: evidence.results || [], outreach: outreach.results || [], pilotOptions: pilotOptions.results || [],
    preflights: (preflights.results || []).map((row) => { let blockers=[]; try { blockers=JSON.parse(row.blockersJson||'[]'); } catch {} return { ...row, blockers }; }),
    policy: { candidateDueDiligenceScore: 75, stockFreshDays: STOCK_FRESH_DAYS, autoOutreachSend: false, paymentExecution: false, buyerPiiRelease: false, supplierForward: false, autoOrder: false }
  };
}

async function createCandidate(env, actor, body = {}) {
  const displayName = clean(body.displayName, 160);
  const candidateCode = clean(body.candidateCode, 80).toLowerCase();
  const websiteUrl = body.websiteUrl ? httpsUrl(body.websiteUrl) : '';
  const discoverySource = VALID_DISCOVERY_SOURCES.has(body.discoverySource) ? body.discoverySource : 'manual';
  if (!displayName) return { status: 400, body: { error: '공급자 후보명이 필요합니다.' } };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateCode)) return { status: 400, body: { error: 'candidateCode는 영문 소문자·숫자·하이픈 형식이어야 합니다.' } };
  if (body.websiteUrl && !websiteUrl) return { status: 400, body: { error: '공개 웹사이트는 HTTPS URL만 등록할 수 있습니다.' } };
  const id = randomId('cand'); const now = nowIso();
  const score = scoreSupplierCandidate({ discoverySource });
  try {
    await env.DB.prepare(`INSERT INTO supplier_candidates
      (id,candidate_code,display_name,legal_name,website_url,discovery_source,discovery_ref,category,region,public_contact_ref,candidate_status,
       total_score,risk_level,critical_blockers_json,score_explanation,last_scored_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'discovered',?,?,?,?,?,?,?)`)
      .bind(id,candidateCode,displayName,clean(body.legalName,200),websiteUrl,discoverySource,clean(body.discoveryRef,500),clean(body.category,120),clean(body.region,120),
        clean(body.publicContactRef,500),score.totalScore,score.riskLevel,JSON.stringify(score.criticalBlockers),score.explanation,now,now,now).run();
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return { status: 409, body: { error: '이미 사용 중인 candidateCode입니다.' } };
    throw error;
  }
  await audit(env, actor, 'supplier_candidate.created', { candidateId:id, metadata:{ discoverySource } });
  return { status: 201, body: { candidate: candidateView(await getCandidate(env,id)) } };
}

async function assessCandidate(env, actor, id, body = {}) {
  const current = await getCandidate(env,id);
  if (!current) return { status:404, body:{ error:'공급자 후보를 찾을 수 없습니다.' } };
  if (['converted','rejected'].includes(current.candidate_status)) return { status:409, body:{ error:'종료된 후보는 평가를 변경할 수 없습니다.' } };
  const assessment = {
    businessIdentityStatus: ['unknown','confirmed','rejected'].includes(body.businessIdentityStatus) ? body.businessIdentityStatus : current.business_identity_status,
    directShipStatus: ['unknown','yes','no'].includes(body.directShipStatus) ? body.directShipStatus : current.direct_ship_status,
    marginPercentEstimate: clampPercent(body.marginPercentEstimate ?? current.margin_percent_estimate),
    stockReliability: ['unknown','low','medium','high'].includes(body.stockReliability) ? body.stockReliability : current.stock_reliability,
    returnsCsStatus: ['unknown','partial','ready','rejected'].includes(body.returnsCsStatus) ? body.returnsCsStatus : current.returns_cs_status,
    pilotSupportStatus: ['unknown','yes','no'].includes(body.pilotSupportStatus) ? body.pilotSupportStatus : current.pilot_support_status,
    integrationCapability: ['unknown','manual','feed','api'].includes(body.integrationCapability) ? body.integrationCapability : current.integration_capability,
    rightsClarity: ['unknown','clear','restricted'].includes(body.rightsClarity) ? body.rightsClarity : current.rights_clarity,
    discoverySource: current.discovery_source
  };
  const score = scoreSupplierCandidate(assessment); const now=nowIso();
  await env.DB.prepare(`UPDATE supplier_candidates SET business_identity_status=?,direct_ship_status=?,margin_percent_estimate=?,stock_reliability=?,
    returns_cs_status=?,pilot_support_status=?,integration_capability=?,rights_clarity=?,public_contact_ref=?,total_score=?,risk_level=?,critical_blockers_json=?,
    score_explanation=?,last_scored_at=?,updated_at=? WHERE id=?`)
    .bind(assessment.businessIdentityStatus,assessment.directShipStatus,assessment.marginPercentEstimate,assessment.stockReliability,assessment.returnsCsStatus,
      assessment.pilotSupportStatus,assessment.integrationCapability,assessment.rightsClarity,clean(body.publicContactRef,500) || current.public_contact_ref,
      score.totalScore,score.riskLevel,JSON.stringify(score.criticalBlockers),score.explanation,now,now,id).run();
  await audit(env,actor,'supplier_candidate.assessed',{candidateId:id,metadata:{score:score.totalScore,risk:score.riskLevel,blockers:score.criticalBlockers}});
  return { status:200, body:{ candidate:candidateView(await getCandidate(env,id)), scoring:score } };
}

async function addEvidence(env, actor, id, body = {}) {
  const candidate=await getCandidate(env,id); if(!candidate) return {status:404,body:{error:'공급자 후보를 찾을 수 없습니다.'}};
  const evidenceType=VALID_EVIDENCE_TYPES.has(body.evidenceType)?body.evidenceType:'other';
  const evidenceUrl=httpsUrl(body.evidenceUrl); if(!evidenceUrl) return {status:400,body:{error:'증거 URL은 HTTPS 공개 URL이어야 합니다.'}};
  const eid=randomId('sev'); const now=nowIso();
  await env.DB.prepare(`INSERT INTO supplier_candidate_evidence
    (id,candidate_id,evidence_type,evidence_url,summary,verification_status,confidence,checked_at,created_at,updated_at)
    VALUES (?,?,?,?,?,'unreviewed',0,NULL,?,?)`).bind(eid,id,evidenceType,evidenceUrl,clean(body.summary,1200),now,now).run();
  await audit(env,actor,'supplier_candidate.evidence_added',{candidateId:id,metadata:{evidenceId:eid,evidenceType}});
  return {status:201,body:{evidence:{id:eid,candidateId:id,evidenceType,evidenceUrl,verificationStatus:'unreviewed'}}};
}

async function reviewEvidence(env, actor, evidenceId, body = {}) {
  const decision=body.decision==='confirmed'?'confirmed':body.decision==='rejected'?'rejected':'';
  if(!decision) return {status:400,body:{error:'decision은 confirmed 또는 rejected여야 합니다.'}};
  const row=await env.DB.prepare('SELECT * FROM supplier_candidate_evidence WHERE id=?').bind(evidenceId).first();
  if(!row) return {status:404,body:{error:'증거 항목을 찾을 수 없습니다.'}};
  const confidence=Math.max(0,Math.min(100,Math.trunc(Number(body.confidence)||0))); const now=nowIso();
  await env.DB.prepare('UPDATE supplier_candidate_evidence SET verification_status=?,confidence=?,checked_at=?,updated_at=? WHERE id=?')
    .bind(decision,confidence,now,now,evidenceId).run();
  await audit(env,actor,'supplier_candidate.evidence_reviewed',{candidateId:row.candidate_id,metadata:{evidenceId,evidenceType:row.evidence_type,decision,confidence}});
  return {status:200,body:{evidence:{id:evidenceId,verificationStatus:decision,confidence,checkedAt:now}}};
}

async function createOutreachDraft(env, actor, id, body = {}) {
  const candidate=await getCandidate(env,id); if(!candidate) return {status:404,body:{error:'공급자 후보를 찾을 수 없습니다.'}};
  if (!['shortlisted','outreach_ready','contacted'].includes(candidate.candidate_status)) return {status:409,body:{error:'shortlisted 이상 후보만 연락 초안을 만들 수 있습니다.'}};
  const channel=VALID_OUTREACH_CHANNELS.has(body.channel)?body.channel:'email';
  const publicContactRef=clean(body.publicContactRef,500)||candidate.public_contact_ref;
  if(!publicContactRef) return {status:409,body:{error:'공개 연락처 참조 또는 연락 폼 URL이 필요합니다.'}};
  const idOut=randomId('out'); const now=nowIso();
  const subject=`[EKODI Mall] ${candidate.display_name} 직배송 파일럿 협력 문의`;
  const category=candidate.category?` ${candidate.category} 분야의`:'';
  const message=`안녕하세요. EKODI Mall은${category} 검증된 공급업체와 소량 직배송 파일럿을 준비하고 있습니다. 재고를 선매입하지 않고 실제 주문 발생 시 계약된 조건에 따라 고객에게 직접 발송하는 구조를 검토 중입니다. 공급가·배송 SLA·반품/CS 책임·개인정보 처리 범위와 1~3개 SKU의 소량 파일럿 가능 여부를 확인하고 싶습니다. 계약 또는 개인정보 전달 전에는 고객정보나 자동발주를 사용하지 않습니다. 협력 검토가 가능하시면 담당 채널을 회신해 주세요.`;
  await env.DB.prepare(`INSERT INTO supplier_outreach_tasks
    (id,candidate_id,channel,status,public_contact_ref,subject_draft,message_draft,response_ref,created_at,updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, '', ?, ?)`).bind(idOut,id,channel,publicContactRef,subject,message,now,now).run();
  await audit(env,actor,'supplier_candidate.outreach_draft_created',{candidateId:id,metadata:{outreachId:idOut,channel,autoSent:false}});
  return {status:201,body:{outreach:{id:idOut,candidateId:id,channel,status:'draft',publicContactRef,subjectDraft:subject,messageDraft:message,autoSent:false}}};
}

async function updateOutreach(env, actor, outreachId, body = {}) {
  const valid=new Set(['draft','ready','contacted','responded','closed','cancelled']); const status=valid.has(body.status)?body.status:'';
  if(!status) return {status:400,body:{error:'유효한 outreach 상태가 필요합니다.'}};
  const row=await env.DB.prepare('SELECT * FROM supplier_outreach_tasks WHERE id=?').bind(outreachId).first();
  if(!row) return {status:404,body:{error:'연락 작업을 찾을 수 없습니다.'}};
  const now=nowIso();
  await env.DB.prepare('UPDATE supplier_outreach_tasks SET status=?,response_ref=?,updated_at=? WHERE id=?').bind(status,clean(body.responseRef,800),now,outreachId).run();
  await audit(env,actor,'supplier_candidate.outreach_status',{candidateId:row.candidate_id,metadata:{outreachId,status,responseRefPresent:Boolean(clean(body.responseRef,800))}});
  return {status:200,body:{outreach:{id:outreachId,status,updatedAt:now}}};
}

async function transitionCandidate(env, actor, id, body = {}) {
  const candidate=await getCandidate(env,id); if(!candidate) return {status:404,body:{error:'공급자 후보를 찾을 수 없습니다.'}};
  const next=clean(body.status,40);
  if(!candidateTransitionAllowed(candidate.candidate_status,next)) return {status:409,body:{error:`허용되지 않은 후보 상태전이입니다: ${candidate.candidate_status} -> ${next}`}};
  if(next==='shortlisted' && (candidate.total_score<60 || candidate.business_identity_status!=='confirmed' || candidate.direct_ship_status!=='yes' || candidate.rights_clarity==='restricted')) {
    return {status:409,body:{error:'shortlisted에는 60점 이상, 사업자 신원 확인, 직배송 가능, 상품권리 제한 없음이 필요합니다.'}};
  }
  if(next==='outreach_ready' && (!candidate.public_contact_ref || candidate.total_score<65)) return {status:409,body:{error:'연락 준비에는 65점 이상과 공개 연락채널 참조가 필요합니다.'}};
  if(next==='contacted') {
    const outreach=await env.DB.prepare("SELECT id FROM supplier_outreach_tasks WHERE candidate_id=? AND status IN ('contacted','responded') LIMIT 1").bind(id).first();
    if(!outreach) return {status:409,body:{error:'실제 연락 기록을 먼저 남겨야 contacted로 전환할 수 있습니다.'}};
  }
  if(next==='due_diligence_ready') {
    const summary=await evidenceSummary(env,id);
    const needed=['business_identity','dropship','rights']; const missing=needed.filter((type)=>!summary.confirmed.has(type));
    let blockers=[]; try{blockers=JSON.parse(candidate.critical_blockers_json||'[]');}catch{}
    if(candidate.total_score<75 || blockers.length || missing.length) return {status:409,body:{error:'실사 준비에는 75점 이상, 핵심 blocker 0개, 신원·직배송·상품권리 confirmed 증거가 필요합니다.',missingEvidence:missing,blockers}};
  }
  if(next==='converted') return {status:409,body:{error:'Partner 전환은 convert 전용 경로를 사용합니다.'}};
  const now=nowIso(); await env.DB.prepare('UPDATE supplier_candidates SET candidate_status=?,updated_at=? WHERE id=?').bind(next,now,id).run();
  await audit(env,actor,'supplier_candidate.transition',{candidateId:id,metadata:{from:candidate.candidate_status,to:next}});
  return {status:200,body:{candidate:candidateView(await getCandidate(env,id))}};
}

async function convertCandidate(env, actor, id) {
  const candidate=await getCandidate(env,id); if(!candidate) return {status:404,body:{error:'공급자 후보를 찾을 수 없습니다.'}};
  if(candidate.candidate_status!=='due_diligence_ready') return {status:409,body:{error:'due_diligence_ready 후보만 Supplier Partner로 전환할 수 있습니다.'}};
  const score=scoreSupplierCandidate(candidate); if(!score.dueDiligenceReady) return {status:409,body:{error:'현재 평가상 Partner 전환 기준을 충족하지 못합니다.',blockers:score.criticalBlockers}};
  const summary=await evidenceSummary(env,id); const missing=['business_identity','dropship','rights'].filter((type)=>!summary.confirmed.has(type));
  if(missing.length) return {status:409,body:{error:'핵심 confirmed 증거가 부족합니다.',missingEvidence:missing}};
  const partnerId=randomId('sup'); const now=nowIso();
  let partnerCode=candidate.candidate_code;
  const collision=await env.DB.prepare('SELECT id FROM supplier_partners WHERE partner_code=?').bind(partnerCode).first();
  if(collision) partnerCode=`${partnerCode}-${crypto.randomUUID().slice(0,8)}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO supplier_partners
      (id,partner_code,display_name,legal_name,provider_type,onboarding_status,status_note,auto_order_allowed,created_at,updated_at)
      VALUES (?,?,?,?, 'contract_supplier','candidate',?,0,?,?)`).bind(partnerId,partnerCode,candidate.display_name,candidate.legal_name || '',`Discovery candidate ${candidate.candidate_code}에서 전환`,now,now),
    env.DB.prepare(`UPDATE supplier_candidates SET candidate_status='converted',converted_partner_id=?,updated_at=? WHERE id=?`).bind(partnerId,now,id),
    env.DB.prepare(`INSERT INTO supplier_partner_events (partner_id,actor,action,metadata_json,created_at) VALUES (?,?,?,?,?)`)
      .bind(partnerId,clean(actor,240),'supplier_partner.created_from_discovery',JSON.stringify({candidateId:id,score:candidate.total_score}),now)
  ]);
  await audit(env,actor,'supplier_candidate.converted',{candidateId:id,metadata:{partnerId,partnerCode}});
  return {status:201,body:{candidate:candidateView(await getCandidate(env,id)),partner:{id:partnerId,partnerCode,displayName:candidate.display_name,onboardingStatus:'candidate',autoOrderAllowed:false}}};
}

async function runPreflight(env, actor, body = {}) {
  const partnerId=clean(body.partnerId,80), sourceId=clean(body.sourceId,80), skuId=clean(body.supplierSkuId,80), productId=clean(body.productId,80);
  const scenario=VALID_SCENARIOS.has(body.scenarioSource)?body.scenarioSource:'marketplace'; const quantity=cleanQuantity(body.quantity);
  if(!partnerId||!sourceId||!skuId||!productId) return {status:400,body:{error:'Partner, source, SKU, 상품이 모두 필요합니다.'}};
  const row=await env.DB.prepare(`SELECT sp.id AS partner_id,sp.onboarding_status AS partner_status,sp.provider_type,sp.auto_order_allowed,
    sps.mapping_status AS source_mapping_status,ss.id AS source_id,ss.seller_id,ss.rights_status,ss.order_permission,ss.pii_permission,
    sc.status AS contract_status,sc.expires_at AS contract_expires_at,sk.id AS sku_id,sk.cost_amount,sk.shipping_amount,sk.stock_state,sk.checked_at,sk.active AS sku_active,
    spl.mapping_status AS sku_product_status,spl.min_margin_amount,spl.min_margin_percent,p.id AS product_id,p.name AS product_name,p.price,p.status AS product_status,
    p.sale_type,p.seller_type,p.store_id,p.checkout_ready,st.verification_status AS store_verification_status
    FROM supplier_skus sk
    JOIN supplier_partners sp ON sp.id=sk.partner_id
    JOIN supplier_partner_sources sps ON sps.partner_id=sp.id AND sps.source_id=sk.source_id
    JOIN sourcing_sources ss ON ss.id=sk.source_id
    JOIN supplier_sku_product_links spl ON spl.supplier_sku_id=sk.id AND spl.source_id=ss.id
    JOIN products p ON p.id=spl.product_id
    LEFT JOIN supplier_contracts sc ON sc.source_id=ss.id
    LEFT JOIN stores st ON st.id=p.store_id
    WHERE sp.id=? AND ss.id=? AND sk.id=? AND p.id=?`).bind(partnerId,sourceId,skuId,productId).first();
  if(!row) return {status:404,body:{error:'일치하는 Partner→Source→SKU→상품 파일럿 구성을 찾을 수 없습니다.'}};
  const blockers=[]; const now=nowIso();
  if(row.provider_type!=='contract_supplier') blockers.push('manual-first-contract-supplier-required');
  if(!['pilot_ready','pilot_active','active'].includes(row.partner_status)) blockers.push('partner-not-pilot-ready');
  if(!['contract_verified','pilot','active'].includes(row.source_mapping_status)) blockers.push('source-not-contract-verified');
  if(row.rights_status!=='contract_verified') blockers.push('source-rights-not-verified');
  if(row.order_permission!=='manual_contract') blockers.push('manual-order-permission-required');
  if(row.pii_permission!=='contracted_processor') blockers.push('pii-contract-not-recorded');
  if(row.contract_status!=='verified') blockers.push('supplier-contract-not-verified');
  if(row.contract_expires_at && row.contract_expires_at<=now) blockers.push('supplier-contract-expired');
  if(!row.sku_active) blockers.push('supplier-sku-inactive');
  if(row.stock_state!=='in_stock') blockers.push('stock-not-confirmed');
  if(!row.checked_at || row.checked_at<daysAgoIso(STOCK_FRESH_DAYS)) blockers.push('stock-check-stale');
  if(!['pilot','active'].includes(row.sku_product_status)) blockers.push('sku-product-mapping-not-pilot');
  if(row.sale_type!=='direct') blockers.push('product-not-direct-sale');
  if(row.product_status!=='published') blockers.push('product-not-published');
  if(!Number.isInteger(row.price) || row.price<=0) blockers.push('product-price-invalid');
  if(row.auto_order_allowed) blockers.push('auto-order-invariant-violation');

  const verifiedBusinessStore=row.seller_type==='business'&&Boolean(row.store_id)&&row.store_verification_status==='verified';
  const feeRate=verifiedBusinessStore?10:FEE_RATES[scenario];
  const grossAmount=Math.max(0,Math.trunc(Number(row.price)||0))*quantity;
  const platformFeeAmount=Math.floor((grossAmount*feeRate)/100);
  const supplierCostAmount=Math.max(0,Math.trunc(Number(row.cost_amount)||0))*quantity;
  const supplierShippingAmount=Math.max(0,Math.trunc(Number(row.shipping_amount)||0));
  const contributionMargin=grossAmount-platformFeeAmount-supplierCostAmount-supplierShippingAmount;
  const contributionMarginPercent=grossAmount>0?(contributionMargin/grossAmount)*100:0;
  if(contributionMargin<Number(row.min_margin_amount||0)) blockers.push('minimum-margin-amount-failed');
  if(contributionMarginPercent<Number(row.min_margin_percent||0)) blockers.push('minimum-margin-percent-failed');

  const global={paymentsEnabled:flag(env.PAYMENTS_ENABLED),buyerPiiReleaseEnabled:flag(env.BUYER_PII_RELEASE_ENABLED),supplierForwardEnabled:flag(env.SUPPLIER_FORWARD_ENABLED),autoOrderEnabled:false};
  const readinessStatus=blockers.length?'blocked':(global.paymentsEnabled&&global.buyerPiiReleaseEnabled&&global.supplierForwardEnabled?'operational_ready':'transaction_locked');
  const preflightId=randomId('pfl');
  const snapshot={partnerStatus:row.partner_status,sourceMappingStatus:row.source_mapping_status,rightsStatus:row.rights_status,orderPermission:row.order_permission,
    piiPermission:row.pii_permission,contractStatus:row.contract_status,stockState:row.stock_state,checkedAt:row.checked_at,productStatus:row.product_status,
    skuProductStatus:row.sku_product_status,minMarginAmount:Number(row.min_margin_amount||0),minMarginPercent:Number(row.min_margin_percent||0),global};
  await env.DB.prepare(`INSERT INTO supplier_pilot_preflights
    (id,partner_id,source_id,supplier_sku_id,product_id,seller_id,scenario_source,quantity,gross_amount,fee_rate_percent,platform_fee_amount,
     supplier_cost_amount,supplier_shipping_amount,contribution_margin,contribution_margin_percent,readiness_status,blockers_json,snapshot_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(preflightId,partnerId,sourceId,skuId,productId,row.seller_id,scenario,quantity,grossAmount,feeRate,platformFeeAmount,supplierCostAmount,supplierShippingAmount,
      contributionMargin,contributionMarginPercent,readinessStatus,JSON.stringify(blockers),JSON.stringify(snapshot),now).run();
  await audit(env,actor,'supplier_pilot.preflight',{preflightId,metadata:{partnerId,sourceId,skuId,productId,readinessStatus,blockers,contributionMargin}});
  return {status:200,body:{preflight:{id:preflightId,readinessStatus,blockers,scenarioSource:scenario,quantity,grossAmount,feeRatePercent:feeRate,platformFeeAmount,
    supplierCostAmount,supplierShippingAmount,contributionMargin,contributionMarginPercent,global,executionAllowed:readinessStatus==='operational_ready'&&false},message:readinessStatus==='transaction_locked'?'공급 구성은 준비됐지만 결제·PII Release·공급자 전달 전역 게이트가 잠겨 있습니다.':'Preflight 결과를 확인해 주세요.'}};
}

export async function handleSupplierDiscoveryRequest(request, env) {
  const url=new URL(request.url); const path=url.pathname;
  const isDiscovery=path.startsWith('/api/internal/supplier-discovery')||path.startsWith('/api/internal/supplier-candidates')||path.startsWith('/api/internal/supplier-evidence')||path.startsWith('/api/internal/supplier-outreach')||path==='/api/internal/supplier-preflight';
  if(!isDiscovery) return null;
  if(!env.DB) return {status:503,body:{error:'Mall 전용 데이터베이스 연결이 없습니다.'}};
  const auth=await authorizeOperations(request,env); if(!auth.ok) return {status:auth.status,body:{error:auth.error}};
  if(request.method==='GET'&&path==='/api/internal/supplier-discovery/context') return {status:200,body:{context:await listContext(env),actor:auth.actor}};
  if(request.method==='POST'&&path==='/api/internal/supplier-candidates'){const body=await readJson(request);return body?createCandidate(env,auth.actor,body):{status:400,body:{error:'Invalid JSON'}};}
  const assessment=path.match(/^\/api\/internal\/supplier-candidates\/(cand_[a-f0-9]{32})\/assessment$/i);
  if(request.method==='POST'&&assessment){const body=await readJson(request);return body?assessCandidate(env,auth.actor,assessment[1],body):{status:400,body:{error:'Invalid JSON'}};}
  const transition=path.match(/^\/api\/internal\/supplier-candidates\/(cand_[a-f0-9]{32})\/transition$/i);
  if(request.method==='POST'&&transition){const body=await readJson(request);return body?transitionCandidate(env,auth.actor,transition[1],body):{status:400,body:{error:'Invalid JSON'}};}
  const evidence=path.match(/^\/api\/internal\/supplier-candidates\/(cand_[a-f0-9]{32})\/evidence$/i);
  if(request.method==='POST'&&evidence){const body=await readJson(request);return body?addEvidence(env,auth.actor,evidence[1],body):{status:400,body:{error:'Invalid JSON'}};}
  const evidenceReview=path.match(/^\/api\/internal\/supplier-evidence\/(sev_[a-f0-9]{32})\/review$/i);
  if(request.method==='POST'&&evidenceReview){const body=await readJson(request);return body?reviewEvidence(env,auth.actor,evidenceReview[1],body):{status:400,body:{error:'Invalid JSON'}};}
  const outreach=path.match(/^\/api\/internal\/supplier-candidates\/(cand_[a-f0-9]{32})\/outreach-draft$/i);
  if(request.method==='POST'&&outreach){const body=await readJson(request);return createOutreachDraft(env,auth.actor,outreach[1],body||{});}
  const outreachStatus=path.match(/^\/api\/internal\/supplier-outreach\/(out_[a-f0-9]{32})\/status$/i);
  if(request.method==='POST'&&outreachStatus){const body=await readJson(request);return body?updateOutreach(env,auth.actor,outreachStatus[1],body):{status:400,body:{error:'Invalid JSON'}};}
  const convert=path.match(/^\/api\/internal\/supplier-candidates\/(cand_[a-f0-9]{32})\/convert$/i);
  if(request.method==='POST'&&convert) return convertCandidate(env,auth.actor,convert[1]);
  if(request.method==='POST'&&path==='/api/internal/supplier-preflight'){const body=await readJson(request);return body?runPreflight(env,auth.actor,body):{status:400,body:{error:'Invalid JSON'}};}
  return {status:404,body:{error:'Supplier discovery route not found.'}};
}
