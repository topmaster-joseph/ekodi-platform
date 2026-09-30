import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/pipeline';
const STAGES = ['MANUSCRIPT','EDITING','DESIGN','EPUB','ISBN','REVIEW','READY','PUBLISHED','ARCHIVED'];
const ACTIVE_DISTRIBUTION = new Set(['preparing','submitted','reviewing','action_required','approved','published','paused','rejected']);
const REVIEW_DISTRIBUTION = new Set(['submitted','reviewing','approved']);
const ATTENTION_DISTRIBUTION = new Set(['action_required','rejected']);
const STALE_DAYS = 14;

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

async function session(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, data: await response.clone().json() };
}

function daysSince(date) {
  if (!date) return Infinity;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time)) return Infinity;
  return Math.floor((Date.now() - time) / 86400000);
}

function overdue(date) {
  if (!date) return false;
  const due = Date.parse(`${date}T23:59:59Z`);
  return Number.isFinite(due) && due < Date.now();
}

function parseChecklist(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function financeImpact(row) {
  const sales = Number(row.gross_sales || 0);
  const refunds = Number(row.refunds || 0);
  const otherIncome = Number(row.other_income || 0);
  const costs = Number(row.costs || 0);
  const netRevenue = sales - refunds + otherIncome;
  return {
    channelCode: row.channel_code,
    grossSales: sales,
    refunds,
    otherIncome,
    costs,
    netRevenue,
    profit: netRevenue - costs,
    units: Number(row.units || 0),
    unsettled: Number(row.unsettled || 0),
  };
}

function emptyFinance() {
  return { grossSales: 0, refunds: 0, otherIncome: 0, costs: 0, netRevenue: 0, profit: 0, units: 0, unsettled: 0 };
}

function mergeFinance(target, item) {
  for (const key of ['grossSales','refunds','otherIncome','costs','netRevenue','profit','units','unsettled']) target[key] += Number(item[key] || 0);
  return target;
}

function stageProgress(stage) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
}

function nextStage(stage) {
  const index = STAGES.indexOf(stage);
  if (index < 0) return STAGES[0];
  return STAGES[Math.min(index + 1, STAGES.length - 1)];
}

function nextAction(publication) {
  if (publication.attentionCount > 0) return { code: 'distribution_attention', label: `배포 조치 ${publication.attentionCount}건 확인` };
  if (publication.stage !== 'PUBLISHED' && publication.stage !== 'ARCHIVED') return { code: 'advance_stage', label: `${nextStage(publication.stage)} 단계 진행` };
  if (publication.publishedChannels === 0) return { code: 'start_distribution', label: '판매 채널 등록 시작' };
  if (publication.finance.unsettled > 0) return { code: 'settlement', label: '미정산 내역 확인' };
  if (publication.staleCount > 0) return { code: 'verify_distribution', label: '채널 상태 재확인' };
  return { code: 'healthy', label: '정상 운영' };
}

async function overview(request, env) {
  const [publicationsResult, channelsResult, statusesResult, financeResult] = await Promise.all([
    env.DB.prepare(`SELECT id, catalog_no, title, author, stage, status, is_public, google_books_id, isbn_ebook, amazon_asin, updated_at
      FROM books_publications ORDER BY sort_order, title`).all(),
    env.DB.prepare(`SELECT code, name, scope, portal_url, account_status, enabled, sort_order
      FROM books_distribution_channels WHERE enabled = 1 ORDER BY sort_order, name`).all(),
    env.DB.prepare(`SELECT publication_id, channel_code, status, external_id, product_url, submitted_at, published_at, last_checked_at,
      note, source_status, assignee, due_at, checklist_json, sync_mode, synced_at, updated_at
      FROM books_distribution_status ORDER BY updated_at DESC, id DESC`).all(),
    env.DB.prepare(`SELECT publication_id, channel_code,
      SUM(CASE WHEN transaction_type='sale' THEN amount_krw ELSE 0 END) AS gross_sales,
      SUM(CASE WHEN transaction_type='refund' THEN amount_krw ELSE 0 END) AS refunds,
      SUM(CASE WHEN transaction_type='other_income' THEN amount_krw ELSE 0 END) AS other_income,
      SUM(CASE WHEN transaction_type NOT IN ('sale','refund','other_income') THEN amount_krw ELSE 0 END) AS costs,
      SUM(CASE WHEN transaction_type='sale' THEN quantity WHEN transaction_type='refund' THEN -quantity ELSE 0 END) AS units,
      SUM(CASE WHEN settlement_status='pending' THEN
        CASE WHEN transaction_type IN ('sale','other_income') THEN amount_krw
             WHEN transaction_type='refund' THEN -amount_krw ELSE -amount_krw END
        ELSE 0 END) AS unsettled
      FROM books_finance_transactions
      WHERE publication_id <> ''
      GROUP BY publication_id, channel_code`).all(),
  ]);

  const channels = channelsResult.results.map(row => ({
    code: row.code, name: row.name, scope: row.scope, portalUrl: row.portal_url,
    accountStatus: row.account_status, enabled: Boolean(row.enabled), sortOrder: Number(row.sort_order || 0),
  }));

  const statusMap = new Map();
  for (const row of statusesResult.results) {
    const item = {
      publicationId: row.publication_id,
      channelCode: row.channel_code,
      status: row.status,
      externalId: row.external_id,
      productUrl: row.product_url,
      submittedAt: row.submitted_at,
      publishedAt: row.published_at,
      lastCheckedAt: row.last_checked_at,
      note: row.note,
      sourceStatus: row.source_status || '',
      assignee: row.assignee || '',
      dueAt: row.due_at || '',
      checklist: parseChecklist(row.checklist_json),
      syncMode: row.sync_mode || 'manual',
      syncedAt: row.synced_at || '',
      updatedAt: row.updated_at,
    };
    item.stale = ACTIVE_DISTRIBUTION.has(item.status) && daysSince(item.lastCheckedAt) >= STALE_DAYS;
    item.overdue = overdue(item.dueAt) && item.status !== 'published' && item.status !== 'paused';
    item.needsAttention = ATTENTION_DISTRIBUTION.has(item.status) || item.stale || item.overdue;
    statusMap.set(`${item.publicationId}:${item.channelCode}`, item);
  }

  const financeMap = new Map();
  const financeByChannel = [];
  for (const row of financeResult.results) {
    const item = financeImpact(row);
    financeByChannel.push({ publicationId: row.publication_id, ...item });
    if (!financeMap.has(row.publication_id)) financeMap.set(row.publication_id, emptyFinance());
    mergeFinance(financeMap.get(row.publication_id), item);
  }

  const publications = publicationsResult.results.map(row => {
    const distribution = channels.map(channel => statusMap.get(`${row.id}:${channel.code}`) || {
      publicationId: row.id, channelCode: channel.code, status: 'not_started', externalId: '', productUrl: '',
      submittedAt: '', publishedAt: '', lastCheckedAt: '', note: '', sourceStatus: '', assignee: '', dueAt: '', checklist: {},
      syncMode: 'manual', syncedAt: '', updatedAt: '', stale: false, overdue: false, needsAttention: false,
    });
    const trackedChannels = distribution.filter(item => ACTIVE_DISTRIBUTION.has(item.status)).length;
    const publishedChannels = distribution.filter(item => item.status === 'published').length;
    const reviewingChannels = distribution.filter(item => REVIEW_DISTRIBUTION.has(item.status)).length;
    const attentionCount = distribution.filter(item => item.needsAttention).length;
    const staleCount = distribution.filter(item => item.stale).length;
    const overdueCount = distribution.filter(item => item.overdue).length;
    const finance = financeMap.get(row.id) || emptyFinance();
    const publication = {
      id: row.id,
      catalogNo: row.catalog_no,
      title: row.title,
      author: row.author,
      stage: row.stage || 'MANUSCRIPT',
      status: row.status,
      isPublic: Boolean(row.is_public),
      identifiers: { googleBooks: row.google_books_id || '', isbnEbook: row.isbn_ebook || '', amazonAsin: row.amazon_asin || '' },
      updatedAt: row.updated_at,
      stageProgress: stageProgress(row.stage || 'MANUSCRIPT'),
      trackedChannels,
      publishedChannels,
      reviewingChannels,
      attentionCount,
      staleCount,
      overdueCount,
      distribution,
      finance,
    };
    publication.nextAction = nextAction(publication);
    return publication;
  });

  const totals = publications.reduce((acc, item) => {
    acc.publications += 1;
    acc.publishedPlacements += item.publishedChannels;
    acc.reviewingPlacements += item.reviewingChannels;
    acc.attention += item.attentionCount;
    acc.stale += item.staleCount;
    acc.overdue += item.overdueCount;
    mergeFinance(acc.finance, item.finance);
    return acc;
  }, { publications: 0, publishedPlacements: 0, reviewingPlacements: 0, attention: 0, stale: 0, overdue: 0, finance: emptyFinance() });

  return json({ stages: STAGES, channels, publications, financeByChannel, totals, staleDays: STALE_DAYS }, 200, request, env);
}

export async function handleBooksPipelineRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const auth = await session(request, env);
  if (!auth.response.ok) return auth.response;
  if (!auth.data?.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);
  if (request.method === 'GET' && url.pathname === PREFIX) return overview(request, env);
  return json({ error: 'Books pipeline API 경로를 찾을 수 없습니다.' }, 404, request, env);
}
