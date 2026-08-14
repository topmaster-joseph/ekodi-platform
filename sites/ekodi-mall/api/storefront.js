const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const STORE_SLUG = /^[a-z0-9-]{2,80}$/;

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

export function normalizeStoreSlug(value) {
  const slug = clean(value, 80).toLowerCase();
  return STORE_SLUG.test(slug) ? slug : '';
}

function publicStoreUrl(env, slug) {
  const base = clean(env.MALL_BASE_URL || 'https://mall.ekodi.kr', 300).replace(/\/$/, '');
  return `${base}/store/${encodeURIComponent(slug)}`;
}

async function publicStore(env, slug) {
  const store = await env.DB.prepare(`SELECT s.id,s.slug,s.name,s.verification_status AS verificationStatus,
    sp.display_name AS sellerDisplayName,sp.seller_type AS sellerType
    FROM stores s JOIN seller_profiles sp ON sp.user_id=s.seller_id
    WHERE s.slug=?`).bind(slug).first();
  if (!store) return null;

  const productsResult = await env.DB.prepare(`SELECT p.share_code AS shareCode,p.public_url AS publicUrl,p.name,p.one_line AS oneLine,p.category,
    p.sale_type AS saleType,p.price,p.published_at AS publishedAt
    FROM products p WHERE p.store_id=? AND p.status='published'
    ORDER BY p.published_at DESC LIMIT 100`).bind(store.id).all();
  const products = productsResult.results || [];
  if (!products.length) return null;

  return {
    slug: store.slug,
    name: store.name,
    seller: { displayName: store.sellerDisplayName || '', type: store.sellerType || 'individual' },
    verificationStatus: store.verificationStatus || 'unverified',
    publicUrl: publicStoreUrl(env, store.slug),
    attributionNotice: 'Storefront 탐색은 Mall 경로로 분류됩니다. 판매자의 상품별 Direct 링크는 별도 7% first-touch 규칙을 사용합니다.',
    products: products.map((product) => ({
      shareCode: product.shareCode,
      publicUrl: product.publicUrl,
      name: product.name,
      oneLine: product.oneLine || '',
      category: product.category,
      saleType: product.saleType,
      price: product.price === null || product.price === undefined ? null : Number(product.price),
      publishedAt: product.publishedAt || null
    }))
  };
}

async function ownerStorefronts(env, sellerId) {
  const rows = await env.DB.prepare(`SELECT s.id,s.slug,s.name,s.status,s.verification_status AS verificationStatus,s.updated_at AS updatedAt,
    COUNT(p.id) AS productCount,
    SUM(CASE WHEN p.status='published' THEN 1 ELSE 0 END) AS publishedCount
    FROM stores s LEFT JOIN products p ON p.store_id=s.id
    WHERE s.seller_id=?
    GROUP BY s.id,s.slug,s.name,s.status,s.verification_status,s.updated_at
    ORDER BY s.updated_at DESC LIMIT 100`).bind(sellerId).all();
  return (rows.results || []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    verificationStatus: row.verificationStatus || 'unverified',
    productCount: Number(row.productCount || 0),
    publishedCount: Number(row.publishedCount || 0),
    publicEnabled: Number(row.publishedCount || 0) > 0,
    publicUrl: publicStoreUrl(env, row.slug),
    updatedAt: row.updatedAt || null
  }));
}

export async function handleStorefrontRequest(request, env) {
  const url = new URL(request.url);
  const publicMatch = url.pathname.match(/^\/api\/public\/stores\/([^/]+)$/);
  const ownerRoute = url.pathname === '/api/storefronts';
  if (!publicMatch && !ownerRoute) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };

  if (publicMatch) {
    if (request.method !== 'GET') return { status: 405, body: { error: 'Method not allowed' } };
    const slug = normalizeStoreSlug(decodeURIComponent(publicMatch[1]));
    if (!slug) return { status: 400, body: { error: '올바른 Store slug가 아닙니다.' } };
    const store = await publicStore(env, slug);
    if (!store) return { status: 404, body: { error: '공개 상품이 있는 Store를 찾을 수 없습니다.' } };
    return { status: 200, body: { store } };
  }

  if (request.method !== 'GET') return { status: 405, body: { error: 'Method not allowed' } };
  const user = await authenticate(request, env);
  if (!user) return { status: 401, body: { error: 'Google 판매자 로그인이 필요합니다.' } };
  return { status: 200, body: { storefronts: await ownerStorefronts(env, user.id) } };
}
