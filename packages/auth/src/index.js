export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export const AUTH_ROLES = Object.freeze(['super_admin', 'content_admin', 'operations_admin', 'viewer']);
export const AUTH_PERMISSIONS = Object.freeze({
  CMS_READ: 'cms:read',
  CMS_WRITE: 'cms:write',
  CMS_PUBLISH: 'cms:publish',
  MEDIA_READ: 'media:read',
  MEDIA_WRITE: 'media:write',
  DOMAINS_READ: 'domains:read',
  DOMAINS_WRITE: 'domains:write',
  DNS_READ: 'dns:read',
  DNS_WRITE: 'dns:write',
  AUDIT_READ: 'audit:read'
});

const allPermissions = Object.freeze(Object.values(AUTH_PERMISSIONS));
export const ROLE_PERMISSIONS = Object.freeze({
  super_admin: allPermissions,
  content_admin: Object.freeze([AUTH_PERMISSIONS.CMS_READ, AUTH_PERMISSIONS.CMS_WRITE, AUTH_PERMISSIONS.CMS_PUBLISH, AUTH_PERMISSIONS.MEDIA_READ, AUTH_PERMISSIONS.MEDIA_WRITE]),
  operations_admin: Object.freeze([AUTH_PERMISSIONS.DOMAINS_READ, AUTH_PERMISSIONS.DOMAINS_WRITE, AUTH_PERMISSIONS.DNS_READ, AUTH_PERMISSIONS.DNS_WRITE, AUTH_PERMISSIONS.AUDIT_READ]),
  viewer: Object.freeze([AUTH_PERMISSIONS.CMS_READ, AUTH_PERMISSIONS.MEDIA_READ, AUTH_PERMISSIONS.DOMAINS_READ, AUTH_PERMISSIONS.DNS_READ, AUTH_PERMISSIONS.AUDIT_READ])
});

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
}

export function readBearerToken(headers) {
  const authorization = headers?.get?.('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

export function validateAdminPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_ADMIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  }
  return { value: password };
}
