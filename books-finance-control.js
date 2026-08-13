import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/finance';
const VALID_TYPES = new Set([
  'sale', 'refund', 'channel_fee', 'production_cost', 'marketing_cost',
  'royalty', 'tax', 'other_income', 'other_expense',
]);
const VALID_SETTLEMENT = new Set(['pending', 'settled']);

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : '';
}

function json(data, status = 200, request, env) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const origin = request ? allowedOrigin(request, env) : '';
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function session(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  }), env);
  if (!response.ok) return { response };
  return { response, data: await response.clone().json() };
}

async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
  return row?.id || null;
}

async function audit(env, email, action, resource, detail = '') {
  const id = await adminId(env, email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, clean(detail, 500), new Date().toISOString()).run();
}

function validDate(value) {
  const text = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function transactionRow(row) {
  return {
    id: Number(row.id),
    occurredOn: row.occurred_on,
    publicationId: row.publication_id,
    publicationTitle: row.publication_title || '',
    channelCode: row.channel_code,
    channelName: row.channel_name || row.channel_code,
    transactionType: row.transaction_type,
    quantity: Number(row.quantity || 0),
    amountOriginal: Number(row.amount_original || 0),
    currency: row.currency,
    fxRate: Number(row.fx_rate || 1),
    amountKrw: Number(row.amount_krw || 0),
    settlementStatus: row.settlement_status,
    settlementPeriod: row.settlement_period,
    settlementRef: row.settlement_ref,
    externalRef: row.external_ref,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readChannels(env) {
  const rows = await env.DB.prepare('SELECT * FROM books_sales_channels ORDER BY sort_order, name').all();
  return rows.results.map(row => ({
    code: row.code,
    name: row.name,
    defaultCurrency: row.default_currency,
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
  }));
}

async function readPublications(env) {
  const rows = await env.DB.prepare('SELECT id, title, author FROM books_publications ORDER BY title').all();
  return rows.results.map(row => ({ id: row.id, title: row.title, author: row.author }));
}

function filteredQuery(url) {
  const where = [];
  const binds = [];
  const from = validDate(url.searchParams.get('from'));
  const to = validDate(url.searchParams.get('to'));
  const channel = clean(url.searchParams.get('channel'), 80);
  const publication = clean(url.searchParams.get('publication'), 80);
  if (from) { where.push('t.occurred_on >= ?'); binds.push(from); }
  if (to) { where.push('t.occurred_on <= ?'); binds.push(to); }
  if (channel && channel !== 'all') { where.push('t.channel_code = ?'); binds.push(channel); }
  if (publication && publication !== 'all') { where.push('t.publication_id = ?'); binds.push(publication); }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', binds, from, to, channel, publication };
}

function financialImpact(item) {
  const amount = Math.max(0, Number(item.amountKrw || 0));
  switch (item.transactionType) {
    case 'sale': return { sales: amount, refunds: 0, otherIncome: 0, costs: 0, net: amount };
    case 'refund': return { sales: 0, refunds: amount, otherIncome: 0, costs: 0, net: -amount };
    case 'other_income': return { sales: 0, refunds: 0, otherIncome: amount, costs: 0, net: amount };
    default: return { sales: 0, refunds: 0, otherIncome: 0, costs: amount, net: -amount };
  }
}

function summarize(transactions, channels) {
  const summary = {
    grossSales: 0,
    refunds: 0,
    otherIncome: 0,
    costs: 0,
    netRevenue: 0,
    profit: 0,
    unitsSold: 0,
    unsettledNet: 0,
  };
  const channelMap = new Map(channels.map(channel => [channel.code, {
    code: channel.code,
    name: channel.name,
    sales: 0,
    refunds: 0,
    otherIncome: 0,
    costs: 0,
    netRevenue: 0,
    profit: 0,
    units: 0,
    marginPercent: null,
  }]));
  const costMap = new Map();

  for (const item of transactions) {
    const impact = financialImpact(item);
    summary.grossSales += impact.sales;
    summary.refunds += impact.refunds;
    summary.otherIncome += impact.otherIncome;
    summary.costs += impact.costs;
    summary.unitsSold += item.transactionType === 'sale' ? item.quantity : item.transactionType === 'refund' ? -item.quantity : 0;
    if (item.settlementStatus === 'pending') summary.unsettledNet += impact.net;

    if (!channelMap.has(item.channelCode)) {
      channelMap.set(item.channelCode, {
        code: item.channelCode, name: item.channelName || item.channelCode,
        sales: 0, refunds: 0, otherIncome: 0, costs: 0, netRevenue: 0, profit: 0, units: 0, marginPercent: null,
      });
    }
    const bucket = channelMap.get(item.channelCode);
    bucket.sales += impact.sales;
    bucket.refunds += impact.refunds;
    bucket.otherIncome += impact.otherIncome;
    bucket.costs += impact.costs;
    bucket.units += item.transactionType === 'sale' ? item.quantity : item.transactionType === 'refund' ? -item.quantity : 0;
    if (impact.costs) costMap.set(item.transactionType, (costMap.get(item.transactionType) || 0) + impact.costs);
  }

  summary.netRevenue = summary.grossSales - summary.refunds + summary.otherIncome;
  summary.profit = summary.netRevenue - summary.costs;

  const channelSummary = Array.from(channelMap.values()).map(bucket => {
    bucket.netRevenue = bucket.sales - bucket.refunds + bucket.otherIncome;
    bucket.profit = bucket.netRevenue - bucket.costs;
    bucket.marginPercent = bucket.netRevenue > 0 ? Math.round((bucket.profit / bucket.netRevenue) * 10000) / 100 : null;
    return bucket;
  }).filter(bucket => bucket.sales || bucket.refunds || bucket.otherIncome || bucket.costs || bucket.units)
    .sort((a, b) => b.netRevenue - a.netRevenue || a.name.localeCompare(b.name, 'ko'));

  const costBreakdown = Array.from(costMap.entries())
    .map(([type, amountKrw]) => ({ type, amountKrw }))
    .sort((a, b) => b.amountKrw - a.amountKrw);

  return { summary, channelSummary, costBreakdown };
}

async function overview(request, env) {
  const url = new URL(request.url);
  const filter = filteredQuery(url);
  const [channels, publications] = await Promise.all([readChannels(env), readPublications(env)]);
  const sql = `SELECT t.*, c.name AS channel_name, p.title AS publication_title
    FROM books_finance_transactions t
    LEFT JOIN books_sales_channels c ON c.code = t.channel_code
    LEFT JOIN books_publications p ON p.id = t.publication_id
    ${filter.where}
    ORDER BY t.occurred_on DESC, t.id DESC
    LIMIT 1000`;
  const rows = await env.DB.prepare(sql).bind(...filter.binds).all();
  const transactions = rows.results.map(transactionRow);
  const aggregates = summarize(transactions, channels);
  return json({
    ...aggregates,
    transactions,
    channels,
    publications,
    filter: { from: filter.from, to: filter.to, channel: filter.channel, publication: filter.publication },
  }, 200, request, env);
}

async function channelExists(env, code) {
  return Boolean(await env.DB.prepare('SELECT code FROM books_sales_channels WHERE code = ? AND enabled = 1').bind(code).first());
}

async function publicationExists(env, id) {
  if (!id) return true;
  return Boolean(await env.DB.prepare('SELECT id FROM books_publications WHERE id = ?').bind(id).first());
}

async function normalizePayload(body, env, current = {}) {
  if (!body || typeof body !== 'object') throw new Error('매출·비용 정보를 확인해 주세요.');
  const occurredOn = validDate(body.occurredOn ?? current.occurred_on);
  const publicationId = clean(body.publicationId ?? current.publication_id, 80);
  const channelCode = clean(body.channelCode ?? current.channel_code, 80);
  const transactionType = clean(body.transactionType ?? current.transaction_type, 40);
  const settlementStatus = clean(body.settlementStatus ?? current.settlement_status ?? 'pending', 20);
  if (!occurredOn) throw new Error('거래일을 YYYY-MM-DD 형식으로 입력해 주세요.');
  if (!channelCode || !(await channelExists(env, channelCode))) throw new Error('등록된 판매채널을 선택해 주세요.');
  if (!(await publicationExists(env, publicationId))) throw new Error('등록된 출판물을 선택해 주세요.');
  if (!VALID_TYPES.has(transactionType)) throw new Error('거래 유형이 올바르지 않습니다.');
  if (!VALID_SETTLEMENT.has(settlementStatus)) throw new Error('정산 상태가 올바르지 않습니다.');

  const currency = clean(body.currency ?? current.currency ?? 'KRW', 8).toUpperCase() || 'KRW';
  const amountOriginal = Math.max(0, Number(body.amountOriginal ?? current.amount_original) || 0);
  const fxRate = Math.max(0, Number(body.fxRate ?? current.fx_rate ?? 1) || 1);
  const suppliedKrw = Number(body.amountKrw ?? current.amount_krw);
  const amountKrw = Math.max(0, Math.round(Number.isFinite(suppliedKrw) && suppliedKrw >= 0 ? suppliedKrw : amountOriginal * fxRate));
  const quantity = Math.max(0, Math.min(1000000, Math.trunc(Number(body.quantity ?? current.quantity) || 0)));
  if (!amountKrw && !amountOriginal) throw new Error('거래 금액을 입력해 주세요.');

  return {
    occurredOn,
    publicationId,
    channelCode,
    transactionType,
    quantity,
    amountOriginal,
    currency,
    fxRate,
    amountKrw,
    settlementStatus,
    settlementPeriod: clean(body.settlementPeriod ?? current.settlement_period, 30),
    settlementRef: clean(body.settlementRef ?? current.settlement_ref, 120),
    externalRef: clean(body.externalRef ?? current.external_ref, 160),
    source: clean(body.source ?? current.source ?? 'manual', 30) || 'manual',
    note: clean(body.note ?? current.note, 1000),
  };
}

async function createTransaction(request, env, sessionData) {
  const body = await readBody(request);
  let p;
  try { p = await normalizePayload(body, env); } catch (error) { return json({ error: error.message }, 400, request, env); }
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  const result = await env.DB.prepare(`INSERT INTO books_finance_transactions
    (occurred_on, publication_id, channel_code, transaction_type, quantity, amount_original, currency, fx_rate, amount_krw,
     settlement_status, settlement_period, settlement_ref, external_ref, source, note, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.occurredOn, p.publicationId, p.channelCode, p.transactionType, p.quantity, p.amountOriginal, p.currency, p.fxRate,
      p.amountKrw, p.settlementStatus, p.settlementPeriod, p.settlementRef, p.externalRef, p.source, p.note, now, now, who, who).run();
  const id = Number(result.meta?.last_row_id || 0);
  await audit(env, sessionData.email, 'books.finance.create', String(id), JSON.stringify({ channel: p.channelCode, type: p.transactionType, amountKrw: p.amountKrw }));
  return json({ ok: true, id }, 201, request, env);
}

async function updateTransaction(request, env, sessionData, id) {
  const current = await env.DB.prepare('SELECT * FROM books_finance_transactions WHERE id = ?').bind(id).first();
  if (!current) return json({ error: '거래내역을 찾을 수 없습니다.' }, 404, request, env);
  const body = await readBody(request);
  let p;
  try { p = await normalizePayload(body, env, current); } catch (error) { return json({ error: error.message }, 400, request, env); }
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  await env.DB.prepare(`UPDATE books_finance_transactions SET
    occurred_on=?, publication_id=?, channel_code=?, transaction_type=?, quantity=?, amount_original=?, currency=?, fx_rate=?, amount_krw=?,
    settlement_status=?, settlement_period=?, settlement_ref=?, external_ref=?, source=?, note=?, updated_at=?, updated_by=? WHERE id=?`)
    .bind(p.occurredOn, p.publicationId, p.channelCode, p.transactionType, p.quantity, p.amountOriginal, p.currency, p.fxRate,
      p.amountKrw, p.settlementStatus, p.settlementPeriod, p.settlementRef, p.externalRef, p.source, p.note, now, who, id).run();
  await audit(env, sessionData.email, 'books.finance.update', String(id), JSON.stringify({ channel: p.channelCode, type: p.transactionType, amountKrw: p.amountKrw }));
  return json({ ok: true, id }, 200, request, env);
}

async function deleteTransaction(request, env, sessionData, id) {
  const current = await env.DB.prepare('SELECT id, channel_code, transaction_type, amount_krw FROM books_finance_transactions WHERE id = ?').bind(id).first();
  if (!current) return json({ error: '거래내역을 찾을 수 없습니다.' }, 404, request, env);
  await env.DB.prepare('DELETE FROM books_finance_transactions WHERE id = ?').bind(id).run();
  await audit(env, sessionData.email, 'books.finance.delete', String(id), JSON.stringify(current));
  return json({ ok: true, id }, 200, request, env);
}

async function importTransactions(request, env, sessionData) {
  const body = await readBody(request);
  const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 500) : [];
  if (!rows.length) return json({ error: '가져올 거래내역이 없습니다.' }, 400, request, env);
  const prepared = [];
  const errors = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      prepared.push(await normalizePayload({ ...rows[index], source: rows[index]?.source || 'csv' }, env));
    } catch (error) {
      errors.push({ row: index + 2, error: error.message });
    }
  }
  if (errors.length) return json({ error: 'CSV 데이터에 확인이 필요한 행이 있습니다.', rowErrors: errors.slice(0, 30) }, 400, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  const insert = env.DB.prepare(`INSERT INTO books_finance_transactions
    (occurred_on, publication_id, channel_code, transaction_type, quantity, amount_original, currency, fx_rate, amount_krw,
     settlement_status, settlement_period, settlement_ref, external_ref, source, note, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  await env.DB.batch(prepared.map(p => insert.bind(
    p.occurredOn, p.publicationId, p.channelCode, p.transactionType, p.quantity, p.amountOriginal, p.currency, p.fxRate,
    p.amountKrw, p.settlementStatus, p.settlementPeriod, p.settlementRef, p.externalRef, p.source, p.note, now, now, who, who
  )));
  await audit(env, sessionData.email, 'books.finance.import', 'csv', JSON.stringify({ imported: prepared.length }));
  return json({ ok: true, imported: prepared.length }, 201, request, env);
}

export async function handleBooksFinanceRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(PREFIX)) return null;
  if (!env.DB) return json({ error: 'Books 데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const auth = await session(request, env);
  if (!auth.data) return auth.response;

  if (request.method === 'GET' && path === PREFIX) return overview(request, env);
  if (request.method === 'POST' && path === `${PREFIX}/transactions`) return createTransaction(request, env, auth.data);
  if (request.method === 'POST' && path === `${PREFIX}/import`) return importTransactions(request, env, auth.data);

  const match = path.match(/^\/api\/books\/admin\/finance\/transactions\/(\d+)$/);
  if (match && request.method === 'PUT') return updateTransaction(request, env, auth.data, Number(match[1]));
  if (match && request.method === 'DELETE') return deleteTransaction(request, env, auth.data, Number(match[1]));

  return json({ error: 'Books finance API endpoint not found' }, 404, request, env);
}
