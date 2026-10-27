// Deploy entry for ekodi-qtin-order: the QTIN HTTP worker plus the EKODI Pay RPC gateway.
// The gateway is an RPC-only named entrypoint: reachable through service bindings, never over HTTP.
import { WorkerEntrypoint } from 'cloudflare:workers';
import worker from './qtin-order-worker.js';
import { gatewayReadiness, gatewayClientKey, gatewayConfirm, gatewayGetPayment, settle } from './ekodipay-gateway.js';

export default worker;

export class EkodiPayGateway extends WorkerEntrypoint {
  async readiness(input) { return settle(Promise.resolve().then(() => gatewayReadiness(this.env, input))); }
  async clientKey(input) { return settle(Promise.resolve().then(() => gatewayClientKey(this.env, input))); }
  async confirm(input) { return settle(gatewayConfirm(this.env, input)); }
  async getPayment(input) { return settle(gatewayGetPayment(this.env, input)); }
}
