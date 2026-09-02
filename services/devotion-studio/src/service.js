const nowIso = clock => clock().toISOString();
const required = (value, name) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
};
const normalizeItems = items => {
  if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
  return items.map((item, index) => ({
    id: required(item.id ?? String(index + 1).padStart(2, '0'), 'item.id'),
    passage: required(item.passage, 'item.passage'),
    script: String(item.script ?? ''),
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {}
  }));
};
const normalizeTargets = targets => (Array.isArray(targets) ? targets : []).map(target => ({
  id: required(target.id, 'publication target id'),
  kind: required(target.kind ?? 'youtube', 'publication target kind'),
  config_ref: String(target.config_ref ?? ''),
  metadata: target.metadata && typeof target.metadata === 'object' ? target.metadata : {}
}));

export function createDevotionStudio({ repository, renderer, publisher, clock = () => new Date(), idFactory = () => crypto.randomUUID() }) {
  if (!repository) throw new Error('repository adapter is required');

  function decorateSnapshot(snapshot) {
    if (!snapshot) return null;
    const targets = snapshot.publication_targets || [];
    return {
      ...snapshot,
      capabilities: {
        renderer: Boolean(renderer?.ready?.()),
        publication_targets: Object.fromEntries(targets.map(target => [target.id, Boolean(publisher?.ready?.(target))]))
      }
    };
  }

  async function putBatch(input) {
    const workspaceId = required(input.workspace_id, 'workspace_id');
    const batchKey = required(input.batch_key, 'batch_key');
    const batch = {
      workspace_id: workspaceId,
      batch_key: batchKey,
      title: String(input.title ?? ''),
      items: normalizeItems(input.items),
      publication_targets: normalizeTargets(input.publication_targets),
      updated_at: nowIso(clock)
    };
    await repository.upsertBatch(batch);
    return decorateSnapshot(await repository.getSnapshot(workspaceId, batchKey));
  }

  async function getBatch({ workspace_id, batch_key }) {
    return decorateSnapshot(await repository.getSnapshot(required(workspace_id, 'workspace_id'), required(batch_key, 'batch_key')));
  }

  async function queueRender({ workspace_id, batch_key, format = {}, render_version = 'v1' }) {
    const workspaceId = required(workspace_id, 'workspace_id');
    const batchKey = required(batch_key, 'batch_key');
    const snapshot = await repository.getSnapshot(workspaceId, batchKey);
    if (!snapshot) throw new Error('batch not found');
    if (!renderer?.ready?.()) {
      const error = new Error('render adapter is not connected');
      error.code = 'RENDERER_NOT_CONNECTED';
      throw error;
    }
    const job = {
      id: idFactory(),
      workspace_id: workspaceId,
      batch_key: batchKey,
      kind: 'render',
      status: 'queued',
      payload: {
        render_version: required(render_version, 'render_version'),
        format: {
          width: Number(format.width || 1080),
          height: Number(format.height || 1920),
          fps: Number(format.fps || 30),
          codec: String(format.codec || 'h264')
        }
      },
      created_at: nowIso(clock),
      updated_at: nowIso(clock)
    };
    await repository.enqueueJob(job);
    await repository.markBatchRenderState(workspaceId, batchKey, 'queued', job.updated_at);
    try {
      const result = await renderer.dispatch({ job, snapshot });
      const completedAt = nowIso(clock);
      await repository.markBatchRenderState(workspaceId, batchKey, 'ready', completedAt);
      return { ...job, status: 'completed', updated_at: completedAt, result };
    } catch (error) {
      await repository.markBatchRenderState(workspaceId, batchKey, 'error', nowIso(clock));
      throw error;
    }
  }

  async function schedulePublication({ workspace_id, batch_key, target_id, publish_at, item_ids }) {
    const workspaceId = required(workspace_id, 'workspace_id');
    const batchKey = required(batch_key, 'batch_key');
    const targetId = required(target_id, 'target_id');
    const snapshot = await repository.getSnapshot(workspaceId, batchKey);
    if (!snapshot) throw new Error('batch not found');
    const target = snapshot.publication_targets?.find(entry => entry.id === targetId);
    if (!target) throw new Error('publication target not found');
    if (!publisher?.ready?.(target)) {
      const error = new Error('publisher adapter is not connected');
      error.code = 'PUBLISHER_NOT_CONNECTED';
      throw error;
    }
    const publication = {
      id: idFactory(),
      workspace_id: workspaceId,
      batch_key: batchKey,
      target_id: targetId,
      publish_at: required(publish_at, 'publish_at'),
      item_ids: Array.isArray(item_ids) && item_ids.length ? item_ids.map(String) : snapshot.items.map(item => item.id),
      status: 'scheduled',
      updated_at: nowIso(clock)
    };
    const result = await publisher.schedule({ publication, target, snapshot });
    await repository.savePublication({ ...publication, external_ref: String(result?.external_ref ?? '') });
    return publication;
  }

  return { putBatch, getBatch, queueRender, schedulePublication };
}
