// 에코디교회 '함께 걷는 이들의 소식'(협력소식).
//
// 교회 홈 06 구역이 스스로 적어둔 약속이 이 모듈의 사양이다:
//   "에코디교회와 함께 섬기고 배우며 협력하는 기관·단체의 소식 가운데
//    확인·승인된 내용만 나눕니다."
//
// 그래서 세 가지를 코드로 못박는다.
//   1. 공개 응답에는 status='published' 만 담는다. 초안은 절대 새지 않는다.
//   2. 자동 초안은 이미 공개 승인된 출처에서만 만들고, 스스로 공개하지 않는다.
//   3. 공개·회수는 사이트관리자와 최고관리자가 누르고, 감사에 남는다.
//
// 2026-11-12 측정: 이 경로가 404 였고(교회 역량증명 실행 43225492451), 캐시 없는
// 방문자는 "잠시 후 다시 확인해 주세요" 를 봤다. 되지 않을 일을 기다리라는 안내였다.

const PUBLIC_PATH = '/api/partner-news/public';
const ADMIN_PREFIX = '/api/partner-news/admin';
const DEFAULT_TENANT = 'ekodi-church';
const MAX_LIMIT = 24;
const TITLE_MAX = 120;
const SUMMARY_MAX = 400;

// 협력 기관·단체. 관리자는 이 목록에서 고른다. 임의 문자열을 받지 않는다 —
// 교회 홈에 어느 단체 이름이든 띄울 수 있게 되면 그 자체가 사칭 통로가 된다.
export const PARTNER_ORGS = Object.freeze({
  'ekodi-mission': '에코디선교회',
  'cheonggye-merchants': '청계면상인회',
  'cheonggye-regeneration': '청계면 도시재생 주민협의체',
  'mokpo-presbytery': '목포노회 선교부',
  'korea-foreign-mission': '한국외국인선교회',
  'jubilee-coop': '희년세상협동조합',
  'open-coop': '열린유통협동조합',
  seonammedi: '서남권 국립의대 소통센터',
});

const ADMIN_ROLES = new Set([
  'platform_admin', 'tenant_admin', 'workspace_admin', 'client_admin',
  'hq_manager', 'store_owner', 'owner', 'admin', 'senior_pastor', 'manager',
]);

function json(body, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}

function adminJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

const missingTable = error => /no such table/i.test(String(error?.message || error || ''));
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

function trim(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isoDate(value) {
  const text = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  // 달력에 없는 날짜(2026-02-30)는 거부한다.
  const parsed = new Date(text + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
}

// 원문 링크는 https 만 받는다. javascript:·data: 같은 스킴이 교회 홈 카드에
// 걸리면 그 자체가 공격 통로가 된다.
export function safeSourceUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname || url.hostname.length > 253) return null;
  return url.toString().slice(0, 500);
}

function publicItem(row) {
  return {
    id: row.id,
    status: 'PUBLISHED',
    partnerName: row.org_name,
    partnerKey: row.org_key,
    title: row.title,
    summary: row.summary || '',
    publishedOn: row.news_date,
    publishedAt: row.published_at || null,
    sourceUrl: row.source_url || null,
    imageUrl: row.image_url || null,
  };
}

function adminItem(row) {
  return {
    id: row.id,
    status: row.status,
    origin: row.origin,
    orgKey: row.org_key,
    orgName: row.org_name,
    title: row.title,
    summary: row.summary || '',
    sourceUrl: row.source_url || null,
    imageUrl: row.image_url || null,
    newsDate: row.news_date,
    sourceRef: row.source_ref || null,
    editedByAdmin: row.edited_by_admin === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || '',
    publishedAt: row.published_at || null,
    publishedBy: row.published_by || '',
  };
}

const organizationList = () => Object.entries(PARTNER_ORGS).map(([key, name]) => ({ key, name }));

// ── 자동 초안 ────────────────────────────────────────────────────────────────
// 이미 공개 승인된 출처만 읽는다. 승인 경계를 새로 통과시키는 것이 아니라,
// 이미 통과한 내용을 협력소식 초안으로 옮겨 적는 것이다. 공개는 하지 않는다.
const DRAFT_SOURCES = [
  {
    key: 'ministry',
    orgKey: 'ekodi-mission',
    // org='church' 는 교회 자신의 소식이므로 협력소식이 아니다. 'shared' 도
    // 교회 몫이 섞여 있어 남의 소식으로 적을 수 없다. 선교회 것만 가져온다.
    sql: `SELECT id, title, summary, body, event_date FROM ministry_news_items
          WHERE org='mission' AND visibility='public' AND status='active'
          ORDER BY event_date DESC LIMIT 20`,
    map: row => ({
      sourceRef: 'ministry:' + row.id,
      title: trim(row.title, TITLE_MAX),
      summary: trim(row.summary || row.body, SUMMARY_MAX),
      newsDate: isoDate(row.event_date),
      sourceUrl: null,
    }),
  },
  {
    key: 'seonammedi',
    orgKey: 'seonammedi',
    sql: `SELECT id, title, body, published_at, updated_at FROM seonammedi_notices
          WHERE status='published'
          ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 20`,
    map: row => ({
      sourceRef: 'seonammedi:' + row.id,
      title: trim(row.title, TITLE_MAX),
      summary: trim(String(row.body || '').replace(/<[^>]*>/g, ' '), SUMMARY_MAX),
      newsDate: isoDate(row.published_at || row.updated_at),
      sourceUrl: 'https://seonammedi.kr/',
    }),
  },
];

export async function refreshPartnerNewsDrafts(env, { tenant = DEFAULT_TENANT } = {}) {
  if (!env?.DB) return { ok: false, error: 'database_unavailable', created: 0 };
  const result = { ok: true, created: 0, skipped: 0, sources: {}, unavailable: [] };
  for (const source of DRAFT_SOURCES) {
    let rows = [];
    try {
      rows = (await env.DB.prepare(source.sql).all())?.results || [];
    } catch (error) {
      // 출처 테이블이 아직 없는 환경도 있다. 그 출처만 건너뛰고 나머지는 진행한다.
      if (missingTable(error)) { result.unavailable.push(source.key); continue; }
      return { ok: false, error: 'draft_source_failed', source: source.key, created: result.created };
    }
    let created = 0;
    for (const row of rows) {
      const draft = source.map(row);
      if (!draft.title || !draft.newsDate) { result.skipped += 1; continue; }
      const id = 'cpn-' + String(draft.sourceRef).replace(/:/g, '-').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
      const stamp = nowIso();
      try {
        // 이미 그 출처의 항목이 있으면 아무것도 하지 않는다. 관리자가 고친 제목이나
        // 공개 상태를 자동 갱신이 되돌리는 일은 없어야 한다.
        const inserted = await env.DB.prepare(
          `INSERT INTO church_partner_news
             (id,tenant,org_key,org_name,title,summary,source_url,image_url,news_date,
              status,origin,source_ref,edited_by_admin,created_at,updated_at,updated_by)
           VALUES (?,?,?,?,?,?,?,NULL,?,'draft','auto',?,0,?,?,'ekodi-auto-draft')
           ON CONFLICT (tenant, source_ref) DO NOTHING`,
        ).bind(
          id, tenant, source.orgKey, PARTNER_ORGS[source.orgKey],
          draft.title, draft.summary, safeSourceUrl(draft.sourceUrl), draft.newsDate,
          draft.sourceRef, stamp, stamp,
        ).run();
        if (inserted?.meta?.changes) created += 1; else result.skipped += 1;
      } catch (error) {
        if (missingTable(error)) return { ok: false, error: 'partner_news_table_missing', created: result.created };
        result.skipped += 1;
      }
    }
    result.sources[source.key] = created;
    result.created += created;
  }
  return result;
}

// ── 공개 조회 ────────────────────────────────────────────────────────────────
export async function handlePartnerNewsPublic(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_PATH) return null;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!env?.DB) return json({ error: 'partner_news_unavailable' }, 503);

  const tenant = trim(url.searchParams.get('tenant') || DEFAULT_TENANT, 60) || DEFAULT_TENANT;
  const requested = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(requested) && requested >= 1 ? Math.min(Math.floor(requested), MAX_LIMIT) : 6;

  let rows = [];
  try {
    rows = (await env.DB.prepare(
      `SELECT id,org_key,org_name,title,summary,source_url,image_url,news_date,published_at
         FROM church_partner_news
        WHERE tenant=? AND status='published'
        ORDER BY news_date DESC, updated_at DESC
        LIMIT ?`,
    ).bind(tenant, limit).all())?.results || [];
  } catch (error) {
    // 저장소가 아직 만들어지지 않은 환경은 "공개된 소식이 없다" 와 같다. 그때
    // 교회 홈은 "준비되면 안내합니다" 를 보여준다 — 거짓 재시도 안내를 하지 않는다.
    // 그 밖의 장애는 숨기지 않고 503 으로 닫는다.
    if (!missingTable(error)) return json({ error: 'partner_news_unavailable' }, 503);
  }

  return json({
    schemaVersion: 1,
    tenant,
    contract: { publicState: 'PUBLISHED', approvalRequired: true, draftsExcluded: true },
    items: rows.map(publicItem),
  }, 200, 'public, max-age=60, stale-while-revalidate=300');
}

// ── 관리자 ───────────────────────────────────────────────────────────────────
// 사이트관리자와 최고관리자 둘 다 통과한다. 역할 허용목록에 platform_admin 이
// 들어 있고, 그것이 최고관리자다.
async function partnerNewsAuthority(request, env) {
  const authorization = String(request.headers.get('authorization') || '');
  if (!authorization.startsWith('Bearer ')) return { ok: false, status: 401, error: 'login_required' };
  const base = String(env.MY_SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.MY_SUPABASE_PUBLISHABLE_KEY || '');
  if (!base || !key) return { ok: false, status: 503, error: 'site_admin_authority_unconfigured' };
  const endpoint = new URL(base + '/functions/v1/access-api/me');
  endpoint.searchParams.set('site', 'ekodi-church');
  const response = await fetch(endpoint, {
    headers: { authorization, apikey: key, accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const data = (await response?.json().catch(() => ({}))) || {};
  const role = String(data.role || '').trim().toLowerCase();
  if (!response?.ok || data.authenticated !== true ||
      !['active', 'pre_registered'].includes(String(data.status || '')) || !ADMIN_ROLES.has(role))
    return { ok: false, status: response?.status === 401 ? 401 : 403, error: 'site_admin_required' };
  return {
    ok: true,
    role,
    authority: role === 'platform_admin' ? 'super_admin' : 'site_admin',
    actor: String(data.email || data.user || role).slice(0, 160),
  };
}

export async function handlePartnerNewsAdmin(request, env = {}, options = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ADMIN_PREFIX)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  if (!env?.DB) return adminJson({ error: 'database_unavailable' }, 503);

  const access = await partnerNewsAuthority(request, env);
  if (!access.ok) return adminJson({ error: access.error }, access.status);
  const tenant = trim(url.searchParams.get('tenant') || DEFAULT_TENANT, 60) || DEFAULT_TENANT;
  const audit = typeof options.onAudit === 'function' ? options.onAudit : null;

  // 목록: 초안과 공개본을 함께 보여 관리자가 확인·수정할 수 있게 한다.
  if (request.method === 'GET' && url.pathname === ADMIN_PREFIX + '/items') {
    try {
      const rows = (await env.DB.prepare(
        `SELECT * FROM church_partner_news WHERE tenant=? ORDER BY
           CASE status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END,
           news_date DESC, updated_at DESC
         LIMIT 200`,
      ).bind(tenant).all())?.results || [];
      return adminJson({ tenant, authority: access.authority, organizations: organizationList(), items: rows.map(adminItem) });
    } catch (error) {
      if (missingTable(error)) return adminJson({ tenant, authority: access.authority, organizations: organizationList(), items: [] });
      return adminJson({ error: 'partner_news_unavailable' }, 503);
    }
  }

  // 자동 초안 갱신을 관리자가 직접 돌릴 수 있게 한다. 공개는 하지 않는다.
  if (request.method === 'POST' && url.pathname === ADMIN_PREFIX + '/refresh-drafts') {
    const result = await refreshPartnerNewsDrafts(env, { tenant });
    if (!result.ok) return adminJson(result, result.error === 'database_unavailable' ? 503 : 500);
    if (audit) await audit({ action: 'partner_news.refresh_drafts', actor: access.actor, authority: access.authority, resource: tenant, detail: JSON.stringify({ created: result.created }) });
    return adminJson(result);
  }

  const itemMatch = url.pathname.match(/^\/api\/partner-news\/admin\/items\/([A-Za-z0-9_-]{1,80})$/);

  // 새 소식을 관리자가 직접 적는다. 항상 초안으로 만들어진다.
  if (request.method === 'POST' && url.pathname === ADMIN_PREFIX + '/items') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return adminJson({ error: 'invalid_json' }, 400);
    const orgKey = String(body.orgKey || '');
    if (!Object.prototype.hasOwnProperty.call(PARTNER_ORGS, orgKey)) return adminJson({ error: 'unknown_organization' }, 400);
    const title = trim(body.title, TITLE_MAX);
    if (!title) return adminJson({ error: 'title_required' }, 400);
    const newsDate = isoDate(body.newsDate) || today();
    const id = 'cpn-manual-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const stamp = nowIso();
    try {
      await env.DB.prepare(
        `INSERT INTO church_partner_news
           (id,tenant,org_key,org_name,title,summary,source_url,image_url,news_date,
            status,origin,source_ref,edited_by_admin,created_at,updated_at,updated_by)
         VALUES (?,?,?,?,?,?,?,NULL,?,'draft','manual',NULL,1,?,?,?)`,
      ).bind(id, tenant, orgKey, PARTNER_ORGS[orgKey], title, trim(body.summary, SUMMARY_MAX),
        safeSourceUrl(body.sourceUrl), newsDate, stamp, stamp, access.actor).run();
    } catch (error) {
      if (missingTable(error)) return adminJson({ error: 'partner_news_table_missing' }, 503);
      return adminJson({ error: 'partner_news_write_failed' }, 500);
    }
    if (audit) await audit({ action: 'partner_news.create', actor: access.actor, authority: access.authority, resource: id, detail: JSON.stringify({ orgKey, title }) });
    return adminJson({ ok: true, id, status: 'draft' }, 201);
  }

  // 확인·수정. 공개 상태는 이 경로로 바꿀 수 없다 — 공개는 별도 동작이다.
  if (request.method === 'PUT' && itemMatch) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return adminJson({ error: 'invalid_json' }, 400);
    const fields = [];
    const values = [];
    if (body.orgKey !== undefined) {
      const orgKey = String(body.orgKey || '');
      if (!Object.prototype.hasOwnProperty.call(PARTNER_ORGS, orgKey)) return adminJson({ error: 'unknown_organization' }, 400);
      fields.push('org_key=?', 'org_name=?');
      values.push(orgKey, PARTNER_ORGS[orgKey]);
    }
    if (body.title !== undefined) {
      const title = trim(body.title, TITLE_MAX);
      if (!title) return adminJson({ error: 'title_required' }, 400);
      fields.push('title=?');
      values.push(title);
    }
    if (body.summary !== undefined) { fields.push('summary=?'); values.push(trim(body.summary, SUMMARY_MAX)); }
    if (body.sourceUrl !== undefined) { fields.push('source_url=?'); values.push(safeSourceUrl(body.sourceUrl)); }
    if (body.newsDate !== undefined) {
      const newsDate = isoDate(body.newsDate);
      if (!newsDate) return adminJson({ error: 'invalid_news_date' }, 400);
      fields.push('news_date=?');
      values.push(newsDate);
    }
    if (!fields.length) return adminJson({ error: 'nothing_to_update' }, 400);
    const changedColumns = fields.map(f => f.slice(0, -2));
    // 관리자가 손댄 항목은 표시해 둔다. 자동 갱신이 되돌리지 않는 근거가 된다.
    fields.push('edited_by_admin=1', 'updated_at=?', 'updated_by=?');
    values.push(nowIso(), access.actor, tenant, itemMatch[1]);
    let changed = 0;
    try {
      changed = (await env.DB.prepare(
        `UPDATE church_partner_news SET ${fields.join(',')} WHERE tenant=? AND id=?`,
      ).bind(...values).run())?.meta?.changes || 0;
    } catch (error) {
      if (missingTable(error)) return adminJson({ error: 'partner_news_table_missing' }, 503);
      return adminJson({ error: 'partner_news_write_failed' }, 500);
    }
    if (!changed) return adminJson({ error: 'item_not_found' }, 404);
    if (audit) await audit({ action: 'partner_news.update', actor: access.actor, authority: access.authority, resource: itemMatch[1], detail: JSON.stringify({ fields: changedColumns }) });
    return adminJson({ ok: true, id: itemMatch[1] });
  }

  // 공개 / 공개 회수 / 보관. 사이트관리자와 최고관리자 둘 다 할 수 있고 감사에 남는다.
  const stateMatch = url.pathname.match(/^\/api\/partner-news\/admin\/items\/([A-Za-z0-9_-]{1,80})\/(publish|unpublish|archive)$/);
  if (request.method === 'POST' && stateMatch) {
    const [, id, action] = stateMatch;
    const stamp = nowIso();
    const next = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : 'archived';
    let changed = 0;
    try {
      const statement = action === 'publish'
        ? env.DB.prepare(
          `UPDATE church_partner_news SET status='published', published_at=?, published_by=?, updated_at=?, updated_by=?
             WHERE tenant=? AND id=? AND status<>'published'`,
        ).bind(stamp, access.actor, stamp, access.actor, tenant, id)
        : env.DB.prepare(
          `UPDATE church_partner_news SET status=?, published_at=NULL, published_by='', updated_at=?, updated_by=?
             WHERE tenant=? AND id=? AND status<>?`,
        ).bind(next, stamp, access.actor, tenant, id, next);
      changed = (await statement.run())?.meta?.changes || 0;
    } catch (error) {
      if (missingTable(error)) return adminJson({ error: 'partner_news_table_missing' }, 503);
      return adminJson({ error: 'partner_news_write_failed' }, 500);
    }
    if (!changed) return adminJson({ error: 'item_not_found_or_unchanged' }, 404);
    if (audit) await audit({ action: 'partner_news.' + action, actor: access.actor, authority: access.authority, resource: id, detail: JSON.stringify({ status: next }) });
    return adminJson({ ok: true, id, status: next });
  }

  return adminJson({ error: 'not_found' }, 404);
}
