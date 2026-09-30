import { DataPlaneBoundaryError, ProviderNotConfiguredError, assertWorkspaceId, workspaceScopedKey } from './data-plane.js';

function requiredBinding(binding, providerId) {
  if (!binding) throw new ProviderNotConfiguredError(providerId, 'binding');
  return binding;
}

export function createD1DatabaseAdapter(binding, { providerId = 'd1' } = {}) {
  const db = requiredBinding(binding, providerId);
  return Object.freeze({
    async read({ sql, params = [] }) {
      if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('sql is required');
      const stmt = db.prepare(sql);
      const bound = params.length ? stmt.bind(...params) : stmt;
      return bound.all();
    },
    async write({ sql, params = [] }) {
      if (typeof sql !== 'string' || !sql.trim()) throw new TypeError('sql is required');
      const stmt = db.prepare(sql);
      const bound = params.length ? stmt.bind(...params) : stmt;
      return bound.run();
    },
  });
}

export function createKvCacheAdapter(binding, { providerId = 'kv', prefix = 'ekodi' } = {}) {
  const kv = requiredBinding(binding, providerId);
  return Object.freeze({
    async get(key) {
      return kv.get(`${prefix}:${key}`, { type: 'json' });
    },
    async set(key, value, { ttlSeconds = 300 } = {}) {
      const options = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? { expirationTtl: Math.floor(ttlSeconds) } : undefined;
      return kv.put(`${prefix}:${key}`, JSON.stringify(value), options);
    },
    async delete(key) {
      return kv.delete(`${prefix}:${key}`);
    },
  });
}

export function createR2FileStorageAdapter(binding, { providerId = 'r2-public', prefix = 'public' } = {}) {
  const bucket = requiredBinding(binding, providerId);
  const objectKey = key => `${prefix}/${String(key).replace(/^\/+/, '')}`;
  return Object.freeze({
    async get(key) {
      return bucket.get(objectKey(key));
    },
    async put(key, value, options = undefined) {
      return bucket.put(objectKey(key), value, options);
    },
    async delete(key) {
      return bucket.delete(objectKey(key));
    },
  });
}

export function createWorkspaceFileStorageAdapter({ providerId, transport, namespace = 'files' }) {
  if (!transport || typeof transport !== 'object') {
    throw new ProviderNotConfiguredError(providerId || 'workspace-file-provider', 'file');
  }
  for (const method of ['get', 'put', 'delete']) {
    if (typeof transport[method] !== 'function') {
      throw new ProviderNotConfiguredError(providerId || 'workspace-file-provider', 'file');
    }
  }

  function keyFor(workspaceId, fileId) {
    assertWorkspaceId(workspaceId);
    if (typeof fileId !== 'string' || !fileId) throw new DataPlaneBoundaryError('fileId is required', 'invalid_file_id');
    return workspaceScopedKey(workspaceId, namespace, fileId);
  }

  return Object.freeze({
    get(key) {
      if (!key || typeof key !== 'object') throw new DataPlaneBoundaryError('workspace file key object is required');
      return transport.get(keyFor(key.workspaceId, key.fileId), key);
    },
    put(key, value, options = undefined) {
      if (!key || typeof key !== 'object') throw new DataPlaneBoundaryError('workspace file key object is required');
      return transport.put(keyFor(key.workspaceId, key.fileId), value, { ...options, workspaceId: key.workspaceId, fileId: key.fileId });
    },
    delete(key) {
      if (!key || typeof key !== 'object') throw new DataPlaneBoundaryError('workspace file key object is required');
      return transport.delete(keyFor(key.workspaceId, key.fileId), key);
    },
  });
}

export function createGoogleDriveFileStorageAdapter({ transport } = {}) {
  return createWorkspaceFileStorageAdapter({
    providerId: 'google-drive-workspace',
    namespace: 'drive',
    transport,
  });
}

export function createPostgresDatabaseAdapter({ query } = {}) {
  if (typeof query !== 'function') throw new ProviderNotConfiguredError('postgres-workspace', 'database');
  return Object.freeze({
    async read({ text, values = [] }) {
      if (typeof text !== 'string' || !text.trim()) throw new TypeError('text is required');
      return query(text, values, { mode: 'read' });
    },
    async write({ text, values = [] }) {
      if (typeof text !== 'string' || !text.trim()) throw new TypeError('text is required');
      return query(text, values, { mode: 'write' });
    },
  });
}
