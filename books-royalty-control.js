import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/royalties';
const HOLDER_STATUSES = new Set(['active', 'inactive']);
const RIGHT_STATUSES = new Set(['draft', 'active', 'ended']);
const ROLES = new Set(['author', 'translator', 'illustrator', 'editor', 'organization', 'other']);
const BASES = new Set(['gross_sales', 'net_receipts', 'per_unit']);
const STATEMENT_STATUSES = new Set(['draft', 'reviewed', 'approved', 'paid', 'void']);
const TRANSITIONS = {
  draft: new Set(['reviewed', 'void']),
  reviewed: new Set(['draft', 'approved', 'void']),
  approved: new Set(['paid', 'void']),
  paid: new Set(),
  void: new Set(),
};

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : '';
}
function json(data, status = 200, request, env) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  const origin = request ? allowedOrigin(request, env) : '';
  if (origin) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(data), { status, headers });
}
function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function date(value, optional = true) {
  const text = clean(value, 10);
  if (!text && optional) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function today() { return new Date().toISOString().slice(0, 10); }
function integer(value, min = 0, max = 1_000_000_000) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}
async function body(request) { try { return await request.json(); } catch { return null; } }
async function session(request, env) {
  const url = new URL(request.url); url.pathname = '/api/session'; url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, data: await response.clone().json() };
}
async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
  return row?.id || null;
}
async function audit(env, email, action, resource, detail = '') {
  const id = await adminId(env, email);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, action, resource, clean(detail, 800), new Date().toISOString()).run();
}

function holderRow(row) { return { id: row.id, displayName: row.display_name, legalName: row.legal_name, email: row.email, phone: row.phone, payoutReference: row.payout_reference, status: row.status, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at }; }
function rightRow(row) { return { id: Number(row.id), publicationId: row.publication_id, publicationTitle: row.publication_title || '', rightsholderId: row.rightsholder_id, rightsholderName: row.rightsholder_name || '', role: row.role, royaltyBasis: row.royalty_basis, royaltyRateBps: Number(row.royalty_rate_bps || 0), fixedPerUnitKrw: Number(row.fixed_per_unit_krw || 0), territory: row.territory, exclusive: Boolean(row.exclusive), effectiveFrom: row.effective_from, effectiveTo: row.effective_to, contractRef: row.contract_ref, status: row.status, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at }; }
function statementRow(row) { return { id: Number(row.id), statementNo: row.statement_no, rightsholderId: row.rightsholder_id, rightsholderName: row.rightsholder_name || '', periodFrom: row.period_from, periodTo: row.period_to, status: row.status, basisAmountKrw: Number(row.basis_amount_krw || 0), royaltyAmountKrw: Number(row.royalty_amount_krw || 0), paidAt: row.paid_at, payoutRef: row.payout_ref, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at }; }
function lineRow(row) { return { id: Number(row.id), statementId: Number(row.statement_id), publicationId: row.publication_id, publicationTitle: row.publication_title || '', channelCode: row.channel_code, channelName: row.channel_name || row.channel_code, role: row.role, royaltyBasis: row.royalty_basis, salesKrw: Number(row.sales_krw || 0), refundsKrw: Number(row.refunds_krw || 0), channelFeesKrw: Number(row.channel_fees_krw || 0), units: Number(row.units || 0), basisAmountKrw: Number(row.basis_amount_krw || 0), royaltyRateBps: Number(row.royalty_rate_bps || 0), fixedPerUnitKrw: Number(row.fixed_per_unit_krw || 0), royaltyAmountKrw: Number(row.royalty_amount_krw || 0), contractRef: row.contract_ref }; }

async function overview(request, env) {
  const [holdersResult, rightsResult, statementsResult, linesResult, publicationsResult] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_rightsholders ORDER BY display_name').all(),
    env.DB.prepare(`SELECT r.*, p.title AS publication_title, h.display_name AS rightsholder_name FROM books_publication_rights r JOIN books_publications p ON p.id=r.publication_id JOIN books_rightsholders h ON h.id=r.rightsholder_id ORDER BY r.status='active' DESC, p.title, h.display_name, r.role`).all(),
    env.DB.prepare(`SELECT s.*, h.display_name AS rightsholder_name FROM books_royalty_statements s JOIN books_rightsholders h ON h.id=s.rightsholder_id ORDER BY s.period_to DESC, s.id DESC LIMIT 300`).all(),
    env.DB.prepare(`SELECT l.*, p.title AS publication_title, c.name AS channel_name FROM books_royalty_statement_lines l LEFT JOIN books_publications p ON p.id=l.publication_id LEFT JOIN books_sales_channels c ON c.code=l.channel_code ORDER BY l.statement_id DESC, l.id`).all(),
    env.DB.prepare('SELECT id, title, author FROM books_publications ORDER BY title').all(),
  ]);
  const holders = holdersResult.results.map(holderRow);
  const rights = rightsResult.results.map(rightRow);
  const statements = statementsResult.results.map(statementRow);
  const lines = linesResult.results.map(lineRow);
  const metrics = {
    activeHolders: holders.filter(x => x.status === 'active').length,
    activeRights: rights.filter(x => x.status === 'active').length,
    draftStatements: statements.filter(x => ['draft','reviewed'].includes(x.status)).length,
    approvedPayableKrw: statements.filter(x => x.status === 'approved').reduce((s,x) => s + x.royaltyAmountKrw, 0),
    paidKrw: statements.filter(x => x.status === 'paid').reduce((s,x) => s + x.royaltyAmountKrw, 0),
  };
  return json({ holders, rights, statements, lines, publications: publicationsResult.results.map(r => ({ id:r.id, title:r.title, author:r.author })), metrics, enums: { holderStatuses:[...HOLDER_STATUSES], rightStatuses:[...RIGHT_STATUSES], roles:[...ROLES], bases:[...BASES], statementStatuses:[...STATEMENT_STATUSES] } }, 200, request, env);
}

async function createHolder(request, env, auth) {
  const input = await body(request); const displayName = clean(input?.displayName,160); const status = clean(input?.status || 'active',20);
  if (!displayName) return json({error:'권리자명을 입력해 주세요.'},400,request,env);
  if (!HOLDER_STATUSES.has(status)) return json({error:'권리자 상태가 올바르지 않습니다.'},400,request,env);
  const id = `rh-${crypto.randomUUID()}`; const now = new Date().toISOString(); const who = await adminId(env,auth.email);
  await env.DB.prepare(`INSERT INTO books_rightsholders (id,display_name,legal_name,email,phone,payout_reference,status,note,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,displayName,clean(input?.legalName,200),clean(input?.email,200),clean(input?.phone,60),clean(input?.payoutReference,200),status,clean(input?.note,1200),now,now,who,who).run();
  await audit(env,auth.email,'books.royalties.holder.create',id,JSON.stringify({displayName,status}));
  return json({ok:true,id},201,request,env);
}
async function updateHolder(request, env, auth, id) {
  const current = await env.DB.prepare('SELECT * FROM books_rightsholders WHERE id=?').bind(id).first();
  if (!current) return json({error:'권리자를 찾을 수 없습니다.'},404,request,env);
  const input = await body(request); const displayName = clean(input?.displayName ?? current.display_name,160); const status = clean(input?.status ?? current.status,20);
  if (!displayName || !HOLDER_STATUSES.has(status)) return json({error:'권리자 정보를 확인해 주세요.'},400,request,env);
  const now = new Date().toISOString(); const who = await adminId(env,auth.email);
  await env.DB.prepare('UPDATE books_rightsholders SET display_name=?, legal_name=?, email=?, phone=?, payout_reference=?, status=?, note=?, updated_at=?, updated_by=? WHERE id=?')
    .bind(displayName,clean(input?.legalName ?? current.legal_name,200),clean(input?.email ?? current.email,200),clean(input?.phone ?? current.phone,60),clean(input?.payoutReference ?? current.payout_reference,200),status,clean(input?.note ?? current.note,1200),now,who,id).run();
  await audit(env,auth.email,'books.royalties.holder.update',id,JSON.stringify({displayName,status}));
  return json({ok:true,id},200,request,env);
}

async function normalizeRight(input, env, current={}) {
  const publicationId=clean(input?.publicationId ?? current.publication_id,80), rightsholderId=clean(input?.rightsholderId ?? current.rightsholder_id,120), role=clean(input?.role ?? current.role ?? 'author',30), royaltyBasis=clean(input?.royaltyBasis ?? current.royalty_basis ?? 'net_receipts',30), status=clean(input?.status ?? current.status ?? 'active',20);
  const effectiveFrom=date(input?.effectiveFrom ?? current.effective_from ?? ''), effectiveTo=date(input?.effectiveTo ?? current.effective_to ?? '');
  if (!publicationId || !await env.DB.prepare('SELECT id FROM books_publications WHERE id=?').bind(publicationId).first()) throw new Error('출판물을 선택해 주세요.');
  if (!rightsholderId || !await env.DB.prepare('SELECT id FROM books_rightsholders WHERE id=?').bind(rightsholderId).first()) throw new Error('권리자를 선택해 주세요.');
  if (!ROLES.has(role) || !BASES.has(royaltyBasis) || !RIGHT_STATUSES.has(status)) throw new Error('권리 규칙의 유형 또는 상태를 확인해 주세요.');
  if (effectiveFrom===null || effectiveTo===null || (effectiveFrom && effectiveTo && effectiveFrom>effectiveTo)) throw new Error('권리 적용기간을 확인해 주세요.');
  const royaltyRateBps=integer(input?.royaltyRateBps ?? current.royalty_rate_bps,0,10000), fixedPerUnitKrw=integer(input?.fixedPerUnitKrw ?? current.fixed_per_unit_krw,0,10_000_000);
  if (!royaltyRateBps && !fixedPerUnitKrw) throw new Error('로열티 비율 또는 권당 정액 중 하나를 입력해 주세요.');
  return { publicationId,rightsholderId,role,royaltyBasis,royaltyRateBps,fixedPerUnitKrw,territory:clean(input?.territory ?? current.territory ?? 'WORLD',80)||'WORLD',exclusive:input?.exclusive===undefined?Boolean(current.exclusive):Boolean(input.exclusive),effectiveFrom,effectiveTo,contractRef:clean(input?.contractRef ?? current.contract_ref,200),status,note:clean(input?.note ?? current.note,1200) };
}
async function createRight(request, env, auth) {
  let p; try { p=await normalizeRight(await body(request),env); } catch(error) { return json({error:error.message},400,request,env); }
  const now=new Date().toISOString(), who=await adminId(env,auth.email);
  const result=await env.DB.prepare(`INSERT INTO books_publication_rights (publication_id,rightsholder_id,role,royalty_basis,royalty_rate_bps,fixed_per_unit_krw,territory,exclusive,effective_from,effective_to,contract_ref,status,note,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(p.publicationId,p.rightsholderId,p.role,p.royaltyBasis,p.royaltyRateBps,p.fixedPerUnitKrw,p.territory,p.exclusive?1:0,p.effectiveFrom,p.effectiveTo,p.contractRef,p.status,p.note,now,now,who,who).run();
  const id=Number(result.meta?.last_row_id||0); await audit(env,auth.email,'books.royalties.right.create',String(id),JSON.stringify({publicationId:p.publicationId,rightsholderId:p.rightsholderId,rate:p.royaltyRateBps})); return json({ok:true,id},201,request,env);
}
async function updateRight(request, env, auth, id) {
  const current=await env.DB.prepare('SELECT * FROM books_publication_rights WHERE id=?').bind(id).first(); if(!current)return json({error:'권리 규칙을 찾을 수 없습니다.'},404,request,env);
  let p; try { p=await normalizeRight(await body(request),env,current); } catch(error) { return json({error:error.message},400,request,env); }
  const now=new Date().toISOString(), who=await adminId(env,auth.email);
  await env.DB.prepare(`UPDATE books_publication_rights SET publication_id=?,rightsholder_id=?,role=?,royalty_basis=?,royalty_rate_bps=?,fixed_per_unit_krw=?,territory=?,exclusive=?,effective_from=?,effective_to=?,contract_ref=?,status=?,note=?,updated_at=?,updated_by=? WHERE id=?`)
    .bind(p.publicationId,p.rightsholderId,p.role,p.royaltyBasis,p.royaltyRateBps,p.fixedPerUnitKrw,p.territory,p.exclusive?1:0,p.effectiveFrom,p.effectiveTo,p.contractRef,p.status,p.note,now,who,id).run();
  await audit(env,auth.email,'books.royalties.right.update',String(id),JSON.stringify({status:p.status,rate:p.royaltyRateBps})); return json({ok:true,id},200,request,env);
}

function calculateLine(rule,bucket) {
  const sales=Number(bucket.sales_krw||0), refunds=Number(bucket.refunds_krw||0), fees=Number(bucket.channel_fees_krw||0), units=Math.max(0,Number(bucket.units||0));
  let basis=0; if(rule.royalty_basis==='gross_sales')basis=Math.max(0,sales-refunds); if(rule.royalty_basis==='net_receipts')basis=Math.max(0,sales-refunds-fees);
  const percentAmount=Math.round(basis*Number(rule.royalty_rate_bps||0)/10000), unitAmount=units*Number(rule.fixed_per_unit_krw||0);
  return {sales,refunds,fees,units,basis,royalty:Math.max(0,percentAmount+unitAmount)};
}
async function generateStatement(request, env, auth) {
  const input=await body(request), holderId=clean(input?.rightsholderId,120), periodFrom=date(input?.periodFrom,false), periodTo=date(input?.periodTo,false);
  if(!holderId||periodFrom===null||periodTo===null||periodFrom>periodTo)return json({error:'권리자와 정산기간을 확인해 주세요.'},400,request,env);
  const holder=await env.DB.prepare("SELECT * FROM books_rightsholders WHERE id=? AND status='active'").bind(holderId).first(); if(!holder)return json({error:'활성 권리자를 찾을 수 없습니다.'},404,request,env);
  const duplicate=await env.DB.prepare("SELECT id,statement_no FROM books_royalty_statements WHERE rightsholder_id=? AND period_from=? AND period_to=? AND status<>'void'").bind(holderId,periodFrom,periodTo).first();
  if(duplicate)return json({error:`동일 기간 정산서가 이미 있습니다. (${duplicate.statement_no})`},409,request,env);
  const rightsResult=await env.DB.prepare(`SELECT * FROM books_publication_rights WHERE rightsholder_id=? AND status='active' AND (effective_from='' OR effective_from<=?) AND (effective_to='' OR effective_to>=?) ORDER BY publication_id,id`).bind(holderId,periodTo,periodFrom).all();
  if(!rightsResult.results.length)return json({error:'정산기간에 적용되는 활성 권리 규칙이 없습니다.'},400,request,env);
  const lines=[];
  for(const rule of rightsResult.results){
    const buckets=await env.DB.prepare(`SELECT channel_code, SUM(CASE WHEN transaction_type='sale' THEN amount_krw ELSE 0 END) AS sales_krw, SUM(CASE WHEN transaction_type='refund' THEN amount_krw ELSE 0 END) AS refunds_krw, SUM(CASE WHEN transaction_type='channel_fee' THEN amount_krw ELSE 0 END) AS channel_fees_krw, SUM(CASE WHEN transaction_type='sale' THEN quantity WHEN transaction_type='refund' THEN -quantity ELSE 0 END) AS units FROM books_finance_transactions WHERE publication_id=? AND occurred_on>=? AND occurred_on<=? GROUP BY channel_code ORDER BY channel_code`).bind(rule.publication_id,periodFrom,periodTo).all();
    for(const bucket of buckets.results){ const calc=calculateLine(rule,bucket); if(!calc.royalty&&!calc.sales&&!calc.units)continue; lines.push({rule,channelCode:bucket.channel_code,...calc}); }
  }
  if(!lines.length)return json({error:'정산기간에 로열티 계산 대상 거래가 없습니다.'},400,request,env);
  const basisTotal=lines.reduce((s,l)=>s+l.basis,0), royaltyTotal=lines.reduce((s,l)=>s+l.royalty,0), now=new Date().toISOString(), statementNo=`ROY-${periodTo.replaceAll('-','')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`, who=await adminId(env,auth.email);
  const created=await env.DB.prepare(`INSERT INTO books_royalty_statements (statement_no,rightsholder_id,period_from,period_to,status,basis_amount_krw,royalty_amount_krw,note,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(statementNo,holderId,periodFrom,periodTo,'draft',basisTotal,royaltyTotal,clean(input?.note,1200),now,now,who,who).run();
  const statementId=Number(created.meta?.last_row_id||0), insert=env.DB.prepare(`INSERT INTO books_royalty_statement_lines (statement_id,publication_id,channel_code,role,royalty_basis,sales_krw,refunds_krw,channel_fees_krw,units,basis_amount_krw,royalty_rate_bps,fixed_per_unit_krw,royalty_amount_krw,contract_ref,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  await env.DB.batch(lines.map(l=>insert.bind(statementId,l.rule.publication_id,l.channelCode,l.rule.role,l.rule.royalty_basis,l.sales,l.refunds,l.fees,l.units,l.basis,l.rule.royalty_rate_bps,l.rule.fixed_per_unit_krw,l.royalty,l.rule.contract_ref,now)));
  await audit(env,auth.email,'books.royalties.statement.generate',String(statementId),JSON.stringify({statementNo,holderId,periodFrom,periodTo,royaltyTotal,lines:lines.length})); return json({ok:true,id:statementId,statementNo,royaltyAmountKrw:royaltyTotal,lines:lines.length},201,request,env);
}

async function transitionStatement(request,env,auth,id){
  const statement=await env.DB.prepare(`SELECT s.*,h.display_name AS holder_name FROM books_royalty_statements s JOIN books_rightsholders h ON h.id=s.rightsholder_id WHERE s.id=?`).bind(id).first(); if(!statement)return json({error:'정산서를 찾을 수 없습니다.'},404,request,env);
  const input=await body(request), next=clean(input?.status,20); if(!STATEMENT_STATUSES.has(next)||!TRANSITIONS[statement.status]?.has(next))return json({error:`${statement.status} 상태에서 ${next||'요청 상태'}로 변경할 수 없습니다.`},409,request,env);
  const now=new Date().toISOString(), who=await adminId(env,auth.email), note=clean(input?.note??statement.note,1200);
  if(next!=='paid'){
    await env.DB.prepare('UPDATE books_royalty_statements SET status=?,note=?,updated_at=?,updated_by=? WHERE id=?').bind(next,note,now,who,id).run();
    await audit(env,auth.email,'books.royalties.statement.status',String(id),JSON.stringify({from:statement.status,to:next})); return json({ok:true,id,status:next},200,request,env);
  }
  const paidAt=date(input?.paidAt||today(),false), payoutRef=clean(input?.payoutRef||statement.payout_ref,200); if(paidAt===null||!payoutRef)return json({error:'지급일과 외부 지급 참조번호를 입력해 주세요. 은행 계좌번호 자체는 저장하지 않습니다.'},400,request,env);
  const linesResult=await env.DB.prepare('SELECT * FROM books_royalty_statement_lines WHERE statement_id=? ORDER BY id').bind(id).all(); if(!linesResult.results.length)return json({error:'정산서 상세내역이 없습니다.'},409,request,env);
  const statements=[];
  for(const line of linesResult.results){
    if(!Number(line.royalty_amount_krw||0))continue;
    const externalRef = `royalty:${statement.statement_no}:${line.id}`;
    const existing=await env.DB.prepare('SELECT id FROM books_finance_transactions WHERE external_ref=?').bind(externalRef).first(); if(existing)continue;
    statements.push(env.DB.prepare(`INSERT INTO books_finance_transactions (occurred_on,publication_id,channel_code,transaction_type,quantity,amount_original,currency,fx_rate,amount_krw,settlement_status,settlement_period,settlement_ref,external_ref,source,note,created_at,updated_at,created_by,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(paidAt,line.publication_id,line.channel_code,'royalty',0,line.royalty_amount_krw,'KRW',1,line.royalty_amount_krw,'settled',`${statement.period_from}:${statement.period_to}`,statement.statement_no,externalRef,'royalty-engine',`${statement.holder_name} · ${line.role}`,now,now,who,who));
  }
  statements.push(env.DB.prepare('UPDATE books_royalty_statements SET status=?,paid_at=?,payout_ref=?,note=?,updated_at=?,updated_by=? WHERE id=?').bind('paid',paidAt,payoutRef,note,now,who,id));
  await env.DB.batch(statements); await audit(env,auth.email,'books.royalties.statement.paid',String(id),JSON.stringify({statementNo:statement.statement_no,paidAt,payoutRef,amount:statement.royalty_amount_krw})); return json({ok:true,id,status:'paid',financeEntries:Math.max(0,statements.length-1)},200,request,env);
}

export async function handleBooksRoyaltyRequest(request,env){
  const path=new URL(request.url).pathname; if(!path.startsWith(PREFIX))return null; if(!env.DB)return json({error:'Books 데이터베이스 연결이 설정되지 않았습니다.'},503,request,env);
  const authResult=await session(request,env); if(!authResult.response.ok)return authResult.response; const auth=authResult.data||{}; if(!auth.email)return json({error:'관리자 인증이 필요합니다.'},401,request,env);
  if(request.method==='GET'&&path===PREFIX)return overview(request,env);
  if(request.method==='POST'&&path===`${PREFIX}/holders`)return createHolder(request,env,auth);
  if(request.method==='POST'&&path===`${PREFIX}/rights`)return createRight(request,env,auth);
  if(request.method==='POST'&&path===`${PREFIX}/statements/generate`)return generateStatement(request,env,auth);
  let match=path.match(/^\/api\/books\/admin\/royalties\/holders\/([^/]+)$/); if(match&&request.method==='PUT')return updateHolder(request,env,auth,decodeURIComponent(match[1]));
  match=path.match(/^\/api\/books\/admin\/royalties\/rights\/(\d+)$/); if(match&&request.method==='PUT')return updateRight(request,env,auth,Number(match[1]));
  match=path.match(/^\/api\/books\/admin\/royalties\/statements\/(\d+)$/); if(match&&request.method==='PUT')return transitionStatement(request,env,auth,Number(match[1]));
  return json({error:'Books royalties API endpoint not found'},404,request,env);
}
