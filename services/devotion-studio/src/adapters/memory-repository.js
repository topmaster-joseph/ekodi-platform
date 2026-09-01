const keyOf = (workspaceId, batchKey) => `${workspaceId}::${batchKey}`;
const clone = value => value == null ? value : structuredClone(value);

export function createMemoryRepository() {
  const batches = new Map();
  const jobs = new Map();
  const publications = new Map();

  return {
    async upsertBatch(batch) {
      const key = keyOf(batch.workspace_id, batch.batch_key);
      const current = batches.get(key) || {};
      batches.set(key, {
        ...current,
        ...clone(batch),
        render_status: current.render_status || 'draft',
        publications: current.publications || []
      });
    },
    async getSnapshot(workspaceId, batchKey) {
      const value = batches.get(keyOf(workspaceId, batchKey));
      return clone(value || null);
    },
    async enqueueJob(job) {
      jobs.set(job.id, clone(job));
    },
    async markBatchRenderState(workspaceId, batchKey, status, updatedAt) {
      const key = keyOf(workspaceId, batchKey);
      const batch = batches.get(key);
      if (!batch) return;
      batch.render_status = status;
      batch.updated_at = updatedAt;
    },
    async savePublication(publication) {
      publications.set(publication.id, clone(publication));
      const batch = batches.get(keyOf(publication.workspace_id, publication.batch_key));
      if (batch) batch.publications = [...(batch.publications || []).filter(item => item.id !== publication.id), clone(publication)];
    },
    inspect() {
      return {
        batches: clone([...batches.values()]),
        jobs: clone([...jobs.values()]),
        publications: clone([...publications.values()])
      };
    }
  };
}
