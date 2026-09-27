const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const SELLER_RESOURCES = Object.freeze([
  'catalog',
  'listings',
  'pricing',
  'inventory',
  'orders',
  'fulfillment',
  'reports'
]);

function configured(env) {
  return Boolean(
    clean(env?.AMAZON_SP_API_CLIENT_ID, 300) &&
    clean(env?.AMAZON_SP_API_CLIENT_SECRET, 300) &&
    clean(env?.AMAZON_SP_API_REFRESH_TOKEN, 1200)
  );
}

function awsConfigured(env) {
  return Boolean(
    clean(env?.AWS_REGION, 100) &&
    clean(env?.AWS_ACCESS_KEY_ID, 300) &&
    clean(env?.AWS_SECRET_ACCESS_KEY, 300)
  );
}

export function amazonConnectorStatus(env = {}) {
  const seller = configured(env);
  const aws = awsConfigured(env);
  return {
    provider: 'amazon',
    mode: seller ? 'configured' : 'setup-required',
    sellerCentral: {
      configured: seller,
      marketplaceId: clean(env.AMAZON_MARKETPLACE_ID, 80) || null,
      sellerId: clean(env.AMAZON_SELLER_ID, 120) || null,
      endpoint: clean(env.AMAZON_SP_API_ENDPOINT, 300) || 'https://sellingpartnerapi-fe.amazon.com',
      resources: SELLER_RESOURCES
    },
    aws: {
      configured: aws,
      region: clean(env.AWS_REGION, 100) || null,
      optional: true
    },
    amazonPay: {
      configured: Boolean(clean(env.AMAZON_PAY_PUBLIC_KEY_ID, 300) && clean(env.AMAZON_PAY_PRIVATE_KEY, 2000)),
      optional: true
    },
    policy: {
      canonicalAdminPath: '/ekodimall/admin/amazon',
      sharedConnector: true,
      tenantScoped: true,
      secretsNeverReturned: true,
      mutationsRequireExplicitCredentialSetup: true
    }
  };
}

export async function handleAmazonRequest(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/amazon/')) return null;

  if (request.method === 'GET' && url.pathname === '/api/amazon/status') {
    return { status: 200, body: amazonConnectorStatus(env) };
  }

  if (request.method === 'GET' && url.pathname === '/api/amazon/capabilities') {
    return {
      status: 200,
      body: {
        provider: 'amazon',
        resources: SELLER_RESOURCES,
        syncDirections: ['ekodi-to-amazon','amazon-to-ekodi'],
        fulfillment: ['merchant','fba'],
        readiness: amazonConnectorStatus(env)
      }
    };
  }

  if (request.method === 'POST' && url.pathname === '/api/amazon/sync') {
    if (!configured(env)) {
      return {
        status: 409,
        body: {
          error: 'AMAZON_SETUP_REQUIRED',
          message: 'Seller Central 자격정보를 먼저 등록해야 동기화를 실행할 수 있습니다.',
          adminPath: '/ekodimall/admin/amazon'
        }
      };
    }
    return {
      status: 501,
      body: {
        error: 'AMAZON_LIVE_SYNC_NOT_ENABLED',
        message: '자격정보는 준비되었지만 운영 동기화는 검증된 SP-API 실행 어댑터가 활성화된 뒤에만 실행됩니다.'
      }
    };
  }

  return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
}
