// Isolated staging for 에코디 펀딩: same app, in-memory sample data, no D1, no payments, studio/admin APIs fail closed.
import { createApp, DEFAULT_REFUND_POLICY } from './funding-core.js';
import { createMemoryStore } from './funding-memory-store.js';

const SAMPLE = [{
  id: 'fund_sample', slug: 'sample-new-book', title: '[스테이징 예시] 신간 사전후원', summary: '스테이징 확인용 예시 펀딩입니다.',
  story: '스테이징 환경에서만 보이는 예시 펀딩입니다. 실제 결제와 데이터 저장은 일어나지 않습니다.', kind: 'reward', ownerOrg: 'publishing',
  organizerUserId: 'staging', organizerEmail: 'staging@example.invalid', organizerName: '에코디출판', contactEmail: 'staging@example.invalid',
  goalAmount: 3000000, raisedAmount: 120000, backerCount: 6, startsOn: '2026-01-01', endsOn: '2099-12-31', refundPolicy: DEFAULT_REFUND_POLICY,
  rewards: [{ id: 'r1', title: '마음으로 후원', description: '', amount: 10000, limit: 0, delivery: 'none', estimatedDelivery: '' }],
  status: 'live', reviewNote: '', createdAt: '2026-11-21T00:00:00.000Z', updatedAt: '2026-11-21T00:00:00.000Z',
}];

const HEADERS = { 'x-ekodi-data-mode': 'isolated-staging', 'x-ekodi-route': 'funding-staging' };
const app = createApp({
  store: createMemoryStore({ campaigns: SAMPLE }),
  authenticate: async () => ({ response: new Response(JSON.stringify({ error: 'staging_auth_required', dataMode: 'isolated-staging' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...HEADERS } }) }),
  pay: { async state() { return { ready: false, mode: 'none', clientKey: '', reason: 'isolated-staging' }; }, async confirm() { throw Object.assign(new Error('staging'), { status: 503 }); } },
  extraHeaders: HEADERS,
});

export default { fetch: request => app(request) };
