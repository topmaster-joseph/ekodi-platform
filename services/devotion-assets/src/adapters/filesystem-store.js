import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const safeSegment = value => {
  const text = String(value ?? '').trim();
  const cleaned = text.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new Error('invalid path segment');
  return cleaned;
};

const safePath = (workspaceId, assetKey) => {
  const workspaceSegment = safeSegment(workspaceId);
  const keySegments = String(assetKey ?? '').split('/').map(segment => safeSegment(segment));
  return [workspaceSegment, ...keySegments];
};

export function createFilesystemStore({ baseDir }) {
  const root = resolve(String(baseDir || '').trim() || './data/devotion-assets');

  function dataPath(workspaceId, assetKey) {
    return join(root, ...safePath(workspaceId, assetKey)) + '.bin';
  }
  function metaPath(workspaceId, assetKey) {
    return join(root, ...safePath(workspaceId, assetKey)) + '.json';
  }

  return {
    ready() { return true; },
    async put({ workspace_id, asset_key, data, mime_type, metadata }) {
      const file = dataPath(workspace_id, asset_key);
      const meta = metaPath(workspace_id, asset_key);
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      await mkdir(dirname(file), { recursive: true });
      const stored_at = new Date().toISOString();
      const record = { workspace_id, asset_key, mime_type, size: buffer.length, metadata, stored_at };
      await writeFile(file, buffer);
      await writeFile(meta, JSON.stringify(record));
      return record;
    },
    async get({ workspace_id, asset_key }) {
      const file = dataPath(workspace_id, asset_key);
      const meta = metaPath(workspace_id, asset_key);
      try {
        await stat(file);
      } catch {
        return null;
      }
      const [data, metaRaw] = await Promise.all([readFile(file), readFile(meta, 'utf8').catch(() => '{}')]);
      const record = JSON.parse(metaRaw || '{}');
      return { workspace_id, asset_key, data, mime_type: record.mime_type || 'application/octet-stream', metadata: record.metadata || {}, stored_at: record.stored_at || '' };
    }
  };
}
