export const REGIONAL_COMMERCE_PROGRAM_MODES=Object.freeze(['native','external','hybrid']);

export const REGIONAL_COMMERCE_PROGRAM_CAPABILITIES=Object.freeze([
  'catalog',
  'merchant-enrollment',
  'merchant-status',
  'benefit-rules',
  'coupon',
  'points',
  'voucher',
  'transaction-summary',
  'settlement-summary',
  'webhook-events',
  'health',
]);

const DEFAULT_DATA_BOUNDARY=Object.freeze({
  regionalPlatformOwns:Object.freeze([
    'program-identity',
    'public-branding',
    'regional-operator-assignments',
    'merchant-public-projection',
    'public-benefit-description',
    'integration-audit-metadata',
  ]),
  providerOwns:Object.freeze([
    'provider-runtime',
    'provider-ledger',
    'provider-transaction-processing',
    'provider-settlement-processing',
  ]),
  forbiddenCoupling:Object.freeze([
    'direct-private-database-access',
    'shared-provider-admin-credential',
    'provider-owned-ekodi-identity',
    'provider-owned-regional-authorization',
  ]),
});

function clean(value){return String(value??'').trim()}

export function normalizeRegionalCommerceProgramContract(input={}){
  const mode=clean(input.mode).toLowerCase();
  if(!REGIONAL_COMMERCE_PROGRAM_MODES.includes(mode))throw new TypeError('regional commerce program mode must be native, external or hybrid');
  const providerId=clean(input.providerId)||null;
  const capabilities=Array.isArray(input.capabilities)?[...new Set(input.capabilities.map(clean).filter(Boolean))]:[];
  const unsupported=capabilities.filter(capability=>!REGIONAL_COMMERCE_PROGRAM_CAPABILITIES.includes(capability));
  if(unsupported.length)throw new TypeError(`unsupported regional commerce capability: ${unsupported.join(',')}`);
  return Object.freeze({
    id:clean(input.id),
    regionId:clean(input.regionId),
    publicName:clean(input.publicName),
    mode,
    providerId,
    providerStatus:clean(input.providerStatus)||'unassigned',
    adapterVersion:clean(input.adapterVersion)||'v1',
    capabilities:Object.freeze(capabilities),
    dataBoundary:DEFAULT_DATA_BOUNDARY,
    credentials:'server-side-vault-only',
    apiAccess:'capability-scoped',
    directDatabaseAccess:false,
    providerReplaceable:true,
    publicPath:clean(input.publicPath),
    adminPath:clean(input.adminPath),
    providerHandoff:Object.freeze({
      discovery:'contract-first',
      activation:'explicit-admin-approval',
      replacement:'adapter-only',
      auditRequired:true,
      financialAuthorityTransfer:'separate-contract-required',
    }),
  });
}

export function regionalCommerceProgramAdapterRequirements(contract){
  if(!contract?.id)throw new TypeError('program contract required');
  return Object.freeze({
    required:Object.freeze([
      'health',
      'merchant-sync',
      'benefit-sync',
      'transaction-summary-read',
      'settlement-summary-read',
      'signed-webhook-verification',
    ]),
    optional:Object.freeze([
      'coupon-issue',
      'points-accrual',
      'voucher-issue',
      'single-sign-on',
    ]),
    security:Object.freeze([
      'server-side-credentials',
      'request-signing-or-oauth',
      'least-privilege-scopes',
      'idempotency-for-mutations',
      'audit-correlation-id',
      'no-direct-ekodi-database-access',
    ]),
  });
}
