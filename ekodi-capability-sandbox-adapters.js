const freeze = value => Object.freeze(value);
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

export const SANDBOX_ADAPTER_POLICY = freeze({
  version: '1.0.0',
  targetGeneration: 10,
  isolation: 'in-process-isolated-store-only',
  productionMutation: false,
  authorityExpansion: false,
  externalNetworkCalls: false,
  requiredSandboxSurface: 'sandbox',
  requiredWorkspacePrefix: 'sandbox_',
});

/**
 * A sandbox adapter must refuse to run anywhere except an isolated sandbox
 * workspace. This is the structural guarantee behind `sandboxSafe: true`:
 * safety does not depend on the caller passing the right target.
 */
function sandboxSurfaceRejection(context = {}) {
  const target = context.target || {};
  if (clean(target.surface, 40) !== SANDBOX_ADAPTER_POLICY.requiredSandboxSurface) {
    return 'sandbox_surface_required';
  }
  if (!clean(target.workspaceId, 160).startsWith(SANDBOX_ADAPTER_POLICY.requiredWorkspacePrefix)) {
    return 'sandbox_workspace_prefix_required';
  }
  if (clean(context.authority?.role, 120) !== 'sandbox-executor') {
    return 'sandbox_executor_role_required';
  }
  return '';
}

function recordKey(context = {}) {
  return `${clean(context.target?.workspaceId, 160)}::${clean(context.executionId, 160)}`;
}

/**
 * First functional-sandbox adapter: `community.site-board`.
 *
 * The capability is registered as `execute_reversible`, and a board post is the
 * cleanest reversible effect in the ecosystem — it is created, observed, and
 * removed without touching any production surface. All state lives in a store
 * owned by this adapter instance and is discarded with it.
 */
function buildSiteBoardSandboxAdapter() {
  const store = new Map();

  return freeze({
    id: 'sandbox-community-site-board',
    capabilityId: 'community.site-board',
    lane: 'in_process_sandbox',
    sandboxSafe: true,
    priority: 1,

    async preflight(context) {
      const rejection = sandboxSurfaceRejection(context);
      if (rejection) return freeze({ ok: false, reason: rejection });
      return freeze({ ok: true, reason: null });
    },

    async execute(context) {
      const rejection = sandboxSurfaceRejection(context);
      if (rejection) {
        const error = new Error(rejection);
        error.safeToFallback = false;
        throw error;
      }
      const key = recordKey(context);
      store.set(key, freeze({
        workspaceId: clean(context.target?.workspaceId, 160),
        executionId: clean(context.executionId, 160),
        title: clean(context.goal, 240) || 'sandbox board post',
        createdAt: new Date().toISOString(),
      }));
      return freeze({
        effectPerformed: true,
        rollbackTarget: `${key}:removed`,
        recordKey: key,
      });
    },

    async verify(context) {
      const key = recordKey(context);
      const record = store.get(key);
      return freeze({
        passed: Boolean(record) && record.executionId === clean(context.executionId, 160),
        method: 'isolated-store-readback',
        reason: record ? null : 'sandbox_record_not_found',
      });
    },

    async rollback(context) {
      const key = recordKey(context.receipt ? { ...context, ...context.receipt } : context);
      store.delete(key);
      return freeze({
        succeeded: store.has(key) === false,
        rollbackId: `sandbox_rollback_${key}`,
      });
    },

    /** Test and diagnostics only — proves the store was left clean. */
    residualRecordCount() {
      return store.size;
    },
  });
}

const ADAPTER_BUILDERS = freeze({
  'community.site-board': buildSiteBoardSandboxAdapter,
});

export function sandboxAdapterCapabilityIds() {
  return freeze(Object.keys(ADAPTER_BUILDERS));
}

export function hasSandboxAdapter(capabilityId) {
  return Object.prototype.hasOwnProperty.call(ADAPTER_BUILDERS, clean(capabilityId, 160));
}

/**
 * Build a fresh registry. Each call returns new adapter instances with their own
 * isolated stores, so concurrent sandbox runs can never observe each other.
 */
export function buildSandboxAdapterRegistry(options = {}) {
  const only = Array.isArray(options.capabilityIds) ? options.capabilityIds.map(id => clean(id, 160)) : null;
  const registry = {};
  for (const [capabilityId, build] of Object.entries(ADAPTER_BUILDERS)) {
    if (only && !only.includes(capabilityId)) continue;
    registry[capabilityId] = build();
  }
  return freeze(registry);
}
