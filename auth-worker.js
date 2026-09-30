import authCore from './auth-worker-core.js';
import { handleAuthProviderPolicy } from './auth-provider-policy.js';

export * from './auth-worker-core.js';

export default {
  async fetch(request, env, ctx) {
    const policyResponse = await handleAuthProviderPolicy(request, env, ctx, authCore);
    if (policyResponse) return policyResponse;
    return authCore.fetch(request, env, ctx);
  }
};
