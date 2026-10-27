// Production deploy entry for ekodi-mall-api: the Mall HTTP worker (entry.js) plus the
// EKODI Pay RPC gateway (EKODIPAY-GATEWAY-001). The mall worker holds the live Toss keys for
// MID q_ekodib62hb (profile 'mall'), so other EKODI services (에코디서점) pay through it over a
// service binding instead of copying secrets. RPC-only: never reachable over HTTP.
import { WorkerEntrypoint } from 'cloudflare:workers';
import worker, { MallCatalog } from './entry.js';
import { gatewayReadiness, gatewayClientKey, gatewayConfirm, gatewayGetPayment, settle } from '../../../ekodipay-gateway.js';

export default worker;
export { MallCatalog };

const MALL_PROFILE = 'mall';
const pinned = (input = {}) => ({ ...input, profileId: MALL_PROFILE });

export class EkodiPayGateway extends WorkerEntrypoint {
  async readiness(input) { return settle(Promise.resolve().then(() => gatewayReadiness(this.env, pinned(input)))); }
  async clientKey(input) { return settle(Promise.resolve().then(() => gatewayClientKey(this.env, pinned(input)))); }
  async confirm(input) { return settle(gatewayConfirm(this.env, pinned(input))); }
  async getPayment(input) { return settle(gatewayGetPayment(this.env, pinned(input))); }
}
