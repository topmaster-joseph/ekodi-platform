import { isAllowedOrigin } from './auth-worker.js';
import { accessGrantManageable, resolveTenantAccessAuthority } from './tenant-access-authority.js';
import { canonicalCoreRole } from './ekodi-principal.js';
import { accessGrantExpired } from './access-governance.js';

const ROLE_LABELS = Object.freeze({
  owner: '사이트 책임관리자',
  admin: '사이트 관리자',
  manager: '운영책임자',
  marketer: '마케팅담당자',
  accountant: '회계담당자',
  staff: '실무담당자',
  member: '회원',
  viewer: '조회·검수자',
  store_owner: '점주/책임자',
  marketing_manager: '마케팅담당자',
  hq_manager: '본사담당자',
  accounting_manager: '회계담당자',
  senior_pastor: '담임목사/책임관리자',
  pastor: '목회자',
  care_staff: '돌봄담당자',
  external_developer: '외부개발자',
  client_admin: '점주/책임자 · 기존',
  client_editor: '마케팅담당자 · 기존',
  client_viewer: '조회·검수자 · 기존',
});

function cors(origin, env) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(request.headers.get('origin'), env),
    },
  });
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function accessStatus(row) {
  if (Number(row.enabled) !== 1) return 'disabled';
  if (accessGrantExpired(row)) return 'expired';
  return row.last_verified_at ? 'active' : 'pre_registered';
}

function displayNameHint(note='') {
  const value=String(note||'').trim();
  return value.startsWith('display-name:') ? value.slice('display-name:'.length).trim() : '';
}

function publicMember(row, authority) {
  const status = accessStatus(row);
  const coreRole = canonicalCoreRole(row.role);
  return {
    userId: row.user_id == null ? null : Number(row.user_id),
    email: row.email,
    displayName: row.display_name || displayNameHint(row.note) || '',
    userStatus: status === 'disabled' || status === 'expired' ? 'disabled' : (row.user_status || 'active'),
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
    coreRole,
    coreRoleLabel: ROLE_LABELS[coreRole] || coreRole,
    principalType: row.principal_type || 'member',
    githubUsername: row.github_username || '',
    expiresAt: row.expires_at || '',
    status,
    joinedAt: row.grant_created_at,
    lastLoginAt: row.last_verified_at || row.last_login_at || '',
    identityProvider: 'google',
    canManage: accessGrantManageable(authority, row),
    tenant: {
      slug: row.tenant_slug,
      name: row.tenant_name,
      domain: row.tenant_domain,
      status: row.tenant_status,
    },
  };
}

function filterMembers(members, url) {
  const tenant = normalize(url.searchParams.get('tenant'));
  const status = normalize(url.searchParams.get('status'));
  const role = normalize(url.searchParams.get('role'));
  const q = normalize(url.searchParams.get('q'));
  return members.filter(member => {
    if (tenant && member.tenant.slug !== tenant) return false;
    if (status && member.status !== status) return false;
    if (role && member.role !== role && member.coreRole !== role) return false;
    if (q) {
      const haystack = normalize(`${member.displayName} ${member.email} ${member.githubUsername} ${member.tenant.name} ${member.tenant.domain} ${member.roleLabel} ${member.coreRoleLabel}`);
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function directorySummary(allMembers, tenants) {
  const uniqueEmails = new Set(allMembers.map(member => normalize(member.email)).filter(Boolean));
  const active = allMembers.filter(member => member.status === 'active').length;
  const pending = allMembers.filter(member => member.status === 'pre_registered').length;
  const disabled = allMembers.filter(member => member.status === 'disabled').length;
  const expired = allMembers.filter(member => member.status === 'expired').length;
  const externalCollaborators = allMembers.filter(member => member.principalType === 'external_collaborator').length;
  return {
    tenants: tenants.length,
    memberships: allMembers.length,
    uniqueGoogleAccounts: uniqueEmails.size,
    active,
    pending,
    disabled,
    expired,
    externalCollaborators,
  };
}

function tenantDirectory(rows, members) {
  return rows.map(row => {
    const siteMembers = members.filter(member => member.tenant.slug === row.slug);
    return {
      slug: row.slug,
      name: row.name,
      domain: row.domain,
      status: row.status,
      members: siteMembers.length,
      activeUsers: siteMembers.filter(member => member.status === 'active').length,
      googlePending: siteMembers.filter(member => member.status === 'pre_registered').length,
      externalCollaborators: siteMembers.filter(member => member.principalType === 'external_collaborator').length,
    };
  });
}

function roleDirectory(members) {
  const counts = new Map();
  for (const member of members) counts.set(member.role, (counts.get(member.role) || 0) + 1);
  return [...counts.entries()]
    .map(([role, count]) => ({ role, coreRole: canonicalCoreRole(role), label: ROLE_LABELS[role] || role, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

function coreRoleDirectory(members) {
  const counts = new Map();
  for (const member of members) counts.set(member.coreRole, (counts.get(member.coreRole) || 0) + 1);
  return [...counts.entries()]
    .map(([role, count]) => ({ role, label: ROLE_LABELS[role] || role, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

export async function handleCustomerMemberDirectory(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/customers/directory') return null;
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error: '허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
  if (request.method !== 'GET') return json({ error: '지원하지 않는 요청 방식입니다.' }, 405, request, env);

  const requestedTenant = normalize(url.searchParams.get('tenant'));
  const authority = await resolveTenantAccessAuthority(request, env, { tenantSlug: requestedTenant });
  if (!authority.ok) {
    const messages = {
      ACCESS_AUTH_REQUIRED: 'EKODI 관리자 또는 운영공간 인증이 필요합니다.',
      TENANT_CONTEXT_REQUIRED: '사이트 관리자는 관리할 사이트 범위가 필요합니다.',
      TENANT_ACCESS_MANAGE_FORBIDDEN: '이 사이트의 사용자·권한 관리 권한이 없습니다.',
      TENANT_NOT_FOUND: '등록된 사이트가 아닙니다.',
    };
    return json({ error: messages[authority.code] || '사용자·권한 접근이 허용되지 않았습니다.', code: authority.code }, authority.status || 403, request, env);
  }
  const tenantScope = authority.scope === 'tenant' ? authority.tenantSlug : requestedTenant;
  const tenantFilter = tenantScope ? ' WHERE slug = ?' : '';
  const memberFilter = tenantScope ? ' WHERE t.slug = ?' : '';
  const tenantStatement = env.DB.prepare(`SELECT slug, name, domain, status FROM customer_tenants${tenantFilter} ORDER BY name`);
  const memberStatement = env.DB.prepare(`SELECT
        a.email,
        a.role,
        a.enabled,
        a.created_at AS grant_created_at,
        a.last_verified_at,
        a.principal_type,
        a.github_username,
        a.expires_at,
        a.note,
        u.id AS user_id,
        COALESCE(u.display_name, '') AS display_name,
        u.status AS user_status,
        COALESCE(u.last_login_at, '') AS last_login_at,
        t.slug AS tenant_slug,
        t.name AS tenant_name,
        t.domain AS tenant_domain,
        t.status AS tenant_status
      FROM customer_access_grants a
      JOIN customer_tenants t ON t.id = a.tenant_id
      LEFT JOIN customer_users u ON lower(trim(u.email)) = a.email
      ${memberFilter}
      ORDER BY t.name, COALESCE(NULLIF(u.display_name, ''), a.email), a.email`);
  const [tenantRows, memberRows] = await Promise.all([
    tenantScope ? tenantStatement.bind(tenantScope).all() : tenantStatement.all(),
    tenantScope ? memberStatement.bind(tenantScope).all() : memberStatement.all(),
  ]);

  const allMembers = memberRows.results.map(row => publicMember(row, authority));
  const tenants = tenantDirectory(tenantRows.results, allMembers);
  const members = filterMembers(allMembers, url);

  return json({
    schemaVersion: 4,
    authority: { scope: authority.scope, tenant: authority.tenantSlug || '', role: authority.role, canManageAllTenants: authority.canManageAllTenants },
    generatedAt: new Date().toISOString(),
    summary: directorySummary(allMembers, tenants),
    tenants,
    roles: roleDirectory(allMembers),
    coreRoles: coreRoleDirectory(allMembers),
    members,
  }, 200, request, env);
}
