import { cooperativeInitialState, COOP_DOCUMENTS } from './cooperative-registry.js';

const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const fail = code => { throw Object.assign(new Error(code), { code, status: 400 }); };
const choice = (value, values) => values.includes(value) ? value : fail('COOP_INVALID_STATUS');
const date = value => {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('COOP_INVALID_DATE');
  return value;
};
const integer = (value, min, max, nullable = false) => {
  if (nullable && (value === null || value === '')) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('COOP_INVALID_NUMBER');
  return value;
};

export function normalizeCooperativeState(input, coop, previous = cooperativeInitialState(coop)) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('COOP_INVALID_STATE');
  // Reject tenant/identity fields rather than allowing a client to move a record.
  for (const key of ['workspaceId', 'workspace_id', 'slug', 'tenant', 'tenantId', 'role', 'grants']) if (key in input) fail('COOP_IMMUTABLE_IDENTITY');
  const state = structuredClone(previous);
  if (input.profile) {
    const p = input.profile;
    if (p.status && p.status !== 'formation') fail('COOP_FORMATION_STATUS_ONLY');
    for (const key of ['name', 'legalName', 'chair', 'purpose', 'industries', 'businesses', 'office', 'businessArea', 'jurisdiction']) {
      if (key in p) state.profile[key] = text(p[key], ['purpose', 'industries', 'businesses'].includes(key) ? 4000 : 180);
    }
    if (!state.profile.name || !state.profile.legalName.includes('협동조합')) fail('COOP_LEGAL_NAME_REQUIRED');
    if ('legalNameStatus' in p) state.profile.legalNameStatus = choice(p.legalNameStatus, ['draft', 'checking', 'confirmed']);
    if ('officeConfirmed' in p) state.profile.officeConfirmed = p.officeConfirmed === true;
    if ('shareUnit' in p) state.profile.shareUnit = integer(p.shareUnit, 1, 1000000000);
    if ('firstYearBudget' in p) state.profile.firstYearBudget = integer(p.firstYearBudget, 0, 1000000000000, true);
  }
  if ('founders' in input) {
    if (!Array.isArray(input.founders) || input.founders.length !== previous.founders.length) fail('COOP_FOUNDER_IDENTITY_REQUIRED');
    const ids = new Set();
    state.founders = input.founders.map(f => {
      const old = previous.founders.find(row => row.id === f.id);
      if (!old || ids.has(old.id)) fail('COOP_FOUNDER_IDENTITY_REQUIRED');
      ids.add(old.id);
      const email = text(f.accountEmail, 254).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('COOP_INVALID_EMAIL');
      return { ...old, representative: text(f.representative, 80) || fail('COOP_REPRESENTATIVE_REQUIRED'),
        business: text(f.business, 160) || null, industry: text(f.industry, 160) || null,
        shares: integer(f.shares ?? null, 1, 100000000, true),
        consent: choice(f.consent || 'pending', ['pending', 'confirmed']), accountEmail: email || null };
    });
    const linked = state.founders.map(f => f.accountEmail).filter(Boolean);
    if (new Set(linked).size !== linked.length) fail('COOP_DUPLICATE_ACCOUNT');
    const total = state.founders.reduce((n, f) => n + (f.shares || 0), 0);
    if (state.founders.every(f => f.shares) && state.founders.some(f => f.shares > total * 0.3)) fail('COOP_CAPITAL_LIMIT');
  }
  if ('documents' in input) {
    state.documents = Object.fromEntries(COOP_DOCUMENTS.map(([key]) => {
      const d = input.documents?.[key] || previous.documents[key];
      return [key, { status: choice(d.status, ['pending', 'draft', 'prepared', 'reviewed']), note: text(d.note, 1000) }];
    }));
  }
  if (input.dates) for (const key of Object.keys(previous.dates)) if (key in input.dates) state.dates[key] = date(text(input.dates[key], 10));
  for (const key of ['notices', 'meetings', 'supports']) {
    if (!(key in input)) continue;
    if (!Array.isArray(input[key]) || input[key].length > 200) fail('COOP_RECORD_LIMIT');
    const ids = new Set();
    state[key] = input[key].map(row => {
      const id = text(row.id, 100);
      if (!/^[a-z0-9_-]{1,100}$/i.test(id) || ids.has(id)) fail('COOP_INVALID_RECORD_ID');
      ids.add(id);
      const title = text(row.title, 180) || fail('COOP_TITLE_REQUIRED');
      if (key === 'supports') return { id, title, agency: text(row.agency, 180), deadline: date(text(row.deadline, 10)),
        status: choice(row.status || '관심', ['관심', '검토중', '준비중', '신청', '선정', '종료']), memo: text(row.memo, 2000) };
      return { id, title, body: text(row.body, 8000),
        visibility: key === 'meetings' ? 'members' : choice(row.visibility || 'members', ['members', 'public']),
        status: choice(row.status || 'draft', ['draft', 'published']),
        date: date(text(row.date, 10)), createdAt: previous[key].find(r => r.id === id)?.createdAt || new Date().toISOString() };
    });
  }
  return state;
}

export async function loadCooperativeProject(db, coop) {
  const row = await db.prepare('SELECT snapshot_json, revision, updated_at FROM cooperative_projects WHERE workspace_id = ? LIMIT 1').bind(coop.workspaceId).first();
  if (!row) throw Object.assign(new Error('COOP_PROJECT_NOT_PROVISIONED'), { status: 503, code: 'COOP_PROJECT_NOT_PROVISIONED' });
  return { state: JSON.parse(row.snapshot_json), revision: Number(row.revision), updatedAt: row.updated_at };
}

export async function saveCooperativeProject(db, coop, state, revision, access) {
  if (!Number.isSafeInteger(revision) || revision < 1) fail('COOP_REVISION_REQUIRED');
  const mutationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`UPDATE cooperative_projects SET snapshot_json = ?, revision = revision + 1, last_change_id = ?, updated_at = ?
      WHERE workspace_id = ? AND revision = ?`).bind(JSON.stringify(state), mutationId, timestamp, coop.workspaceId, revision),
    db.prepare(`INSERT INTO cooperative_audit (workspace_id, actor_id, authority_scope, action, revision, created_at)
      SELECT workspace_id, ?, ?, 'project.update', revision, ? FROM cooperative_projects
      WHERE workspace_id = ? AND last_change_id = ?`).bind(access.identity.id, access.scope, timestamp, coop.workspaceId, mutationId),
  ]);
  if (Number(results[0]?.meta?.changes || 0) !== 1) throw Object.assign(new Error('COOP_REVISION_CONFLICT'), { code: 'COOP_REVISION_CONFLICT', status: 409 });
  return { state, revision: revision + 1, updatedAt: timestamp };
}

export function cooperativeMemberProjection(coop, project, access) {
  const { state, revision, updatedAt } = project;
  const ownFounder = state.founders.find(f => f.accountEmail === access.identity.email);
  return {
    workspaceId: coop.workspaceId, revision, updatedAt, profile: state.profile,
    authority: { scope: 'tenant', role: access.role, canAdmin: access.canAdmin === true },
    me: { email: access.identity.email, founder: ownFounder || null },
    founders: state.founders.map(({ id, representative, business, industry, position }) => ({ id, representative, business, industry, position })),
    documents: state.documents, dates: state.dates,
    notices: state.notices.filter(n => n.status === 'published'),
    meetings: state.meetings.filter(n => n.status === 'published'), supports: state.supports,
  };
}
