export const SITE_OPERATING_MODELS = Object.freeze({
  PLATFORM_CORE: 'platform-core',
  SHARED_SERVICE: 'shared-service',
  CUSTOMER_SITE: 'customer-site',
});

const OWNED_CUSTOMER_SITE_DEFINITIONS = [
  {
    id: 'church',
    slug: 'ekodi-church',
    name: '에코디교회',
    domain: 'church.ekodi.kr',
    workspaceKind: 'church',
    defaultActivityRole: 'pastor',
    defaultActivityRoleLabel: '목사',
  },
  {
    id: 'biz',
    slug: 'ekodi-biz',
    name: '에코디비즈',
    domain: 'biz.ekodi.kr',
    workspaceKind: 'business',
    defaultActivityRole: 'representative',
    defaultActivityRoleLabel: '대표',
  },
  {
    id: 'lab',
    slug: 'ekodi-lab',
    name: '에코디연구소',
    domain: 'lab.ekodi.kr',
    workspaceKind: 'organization',
    defaultActivityRole: 'director',
    defaultActivityRoleLabel: '연구소장',
  },
  {
    id: 'cafe',
    slug: 'ekodi-cafe',
    name: '에코디 카페',
    domain: 'cafe.ekodi.kr',
    workspaceKind: 'business',
    defaultActivityRole: 'representative',
    defaultActivityRoleLabel: '대표',
  },
];

export const EKODI_OWNED_CUSTOMER_SITES = Object.freeze(
  OWNED_CUSTOMER_SITE_DEFINITIONS.map(site => Object.freeze({ ...site, operatingModel: SITE_OPERATING_MODELS.CUSTOMER_SITE }))
);

const OWNED_BY_ID = new Map(EKODI_OWNED_CUSTOMER_SITES.map(site => [site.id, site]));
const OWNED_BY_SLUG = new Map(EKODI_OWNED_CUSTOMER_SITES.map(site => [site.slug, site]));
const OWNED_BY_DOMAIN = new Map(EKODI_OWNED_CUSTOMER_SITES.map(site => [site.domain, site]));
const PLATFORM_CORE_IDS = new Set(['my','management']);

export function ownedCustomerSiteFor(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return OWNED_BY_ID.get(normalized) || OWNED_BY_SLUG.get(normalized) || OWNED_BY_DOMAIN.get(normalized) || null;
}

export function operatingModelForService(serviceId = '') {
  const site = ownedCustomerSiteFor(serviceId);
  if (site) return SITE_OPERATING_MODELS.CUSTOMER_SITE;
  const id = String(serviceId || '').trim().toLowerCase();
  if (PLATFORM_CORE_IDS.has(id)) return SITE_OPERATING_MODELS.PLATFORM_CORE;
  return SITE_OPERATING_MODELS.SHARED_SERVICE;
}

export function activityRoleFor(serviceId = '', authorizationRole = 'member') {
  const site = ownedCustomerSiteFor(serviceId);
  const role = String(authorizationRole || 'member').trim().toLowerCase();
  if (!site) return Object.freeze({ role, label: role, authorizationRole: role });

  const privileged = new Set(['owner', 'admin', 'tenant_admin', 'client_admin', 'platform_admin']);
  if (privileged.has(role)) {
    return Object.freeze({
      role: site.defaultActivityRole,
      label: site.defaultActivityRoleLabel,
      authorizationRole: role,
    });
  }

  if (role === 'manager') return Object.freeze({ role: 'manager', label: '운영책임자', authorizationRole: role });
  if (role === 'staff' || role === 'client_editor') return Object.freeze({ role: 'staff', label: '실무자', authorizationRole: role });
  if (role === 'viewer' || role === 'client_viewer') return Object.freeze({ role: 'viewer', label: '조회자', authorizationRole: role });
  return Object.freeze({ role: 'member', label: '구성원', authorizationRole: role });
}

export function siteActivityContext({ serviceId = '', authorizationRole = 'member', platformAdmin = false } = {}) {
  const site = ownedCustomerSiteFor(serviceId);
  const activity = activityRoleFor(serviceId, authorizationRole);
  return Object.freeze({
    serviceId: String(serviceId || '').trim().toLowerCase(),
    operatingModel: operatingModelForService(serviceId),
    tenantSlug: site?.slug || null,
    activityRole: activity.role,
    activityRoleLabel: activity.label,
    authorizationRole: activity.authorizationRole,
    authorityScope: site ? 'tenant' : 'service',
    platformAdmin: Boolean(platformAdmin),
    platformAdminActive: false,
  });
}
