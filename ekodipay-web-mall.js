// Read only: the existing Mall API authenticates the bearer and owns seller scope.
// Routing source 'mall' is never a workspace identifier or an authority claim.
const API = 'https://ekodi.kr/ekodimall/api';
const problem = (code, status = 502) => { throw Object.assign(new Error(code), { code, status, webPayError: true }); };
const amount = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
export const mallReportsEnabled = env => env.EKODIPAY_MALL_REPORTS_ENABLED === 'true';

async function read(request, path, network) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [^\s]{1,8192}$/i.test(authorization)) problem('LOGIN_REQUIRED', 401);
  const response = await network(API + path, {
    method: 'GET', headers: { authorization, accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store',
  });
  if (response.status === 401) problem('LOGIN_REQUIRED', 401);
  if (response.status === 403) problem('SELLER_FORBIDDEN', 403);
  if (!response.ok || response.redirected) problem('REPORT_SOURCE_UNAVAILABLE', 503);
  if (!response.headers.get('content-type')?.includes('application/json')) problem('REPORT_INVALID');
  const raw = await response.text();
  if (raw.length > 262144) problem('REPORT_INVALID');
  try { return JSON.parse(raw); } catch { problem('REPORT_INVALID'); }
}
export async function mallSellerAccount(request, userId, network = fetch) {
  const data = await read(request, '/me', network);
  if (typeof data?.user?.id !== 'string' || userId !== 'person:' + data.user.id) problem('SELLER_FORBIDDEN', 403);
  return { source: { id: 'mall', name: '에코디몰 내 판매내역', scope: 'seller-account' } };
}
function koreanDate(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 10);
}
export async function mallSellerReport(request, userId, start, end, network = fetch) {
  await mallSellerAccount(request, userId, network);
  const data = await read(request, '/orders?limit=100', network);
  if (!Array.isArray(data?.orders) || data.orders.length > 100) problem('REPORT_INVALID');
  const rows = [], seen = new Set();
  let missingDates = false;
  for (const order of data.orders) {
    if (!['paid', 'refunded', 'partially_refunded'].includes(order.status)) continue;
    if (typeof order.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(order.id) || seen.has(order.id) || order.currency !== 'KRW') problem('REPORT_INVALID');
    seen.add(order.id);
    // paidAt is customer payment approval, NEVER a merchant bank deposit.
    const soldDate = koreanDate(order.paidAt);
    if (!soldDate) { missingDates = true; continue; }
    if (soldDate < start || soldDate > end) continue;
    const unchanged = order.status === 'paid';
    rows.push({
      orderId: order.id, soldDate, gross: amount(order.grossAmount), refunds: null,
      fees: unchanged ? amount(order.platformFeeAmount) : null,
      net: unchanged ? amount(order.sellerSettlementAmount) : null,
      scheduledDate: null, paidAt: null, status: unchanged ? 'unconfirmed' : order.status,
    });
  }
  return {
    rows, source: '에코디몰 본인 판매주문 API', fetchedAt: new Date().toISOString(),
    complete: data.orders.length < 100 && !missingDates, nextCursor: null,
    settlementTerms: '최근 주문 최대 100건 중 선택 기간의 결제 승인일 기준입니다. 순정산은 주문 당시 예상액이며, 환불액·정산 예정일·통장 입금은 별도 확인이 필요합니다.',
  };
}
