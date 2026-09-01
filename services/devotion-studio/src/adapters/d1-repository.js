const parseJson = (value, fallback) => {
  try { return JSON.parse(String(value ?? '')); } catch { return fallback; }
};

export function createD1Repository(db) {
  if (!db) throw new Error('D1 binding is required');

  return {
    async upsertBatch(batch) {
      const statements = [
        db.prepare(`INSERT INTO devotion_batches(workspace_id,batch_key,title,render_status,updated_at)
          VALUES(?,?,?,?,?)
          ON CONFLICT(workspace_id,batch_key) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at`)
          .bind(batch.workspace_id, batch.batch_key, batch.title || '', 'draft', batch.updated_at),
        db.prepare('DELETE FROM devotion_items WHERE workspace_id=? AND batch_key=?').bind(batch.workspace_id, batch.batch_key),
        db.prepare('DELETE FROM devotion_targets WHERE workspace_id=? AND batch_key=?').bind(batch.workspace_id, batch.batch_key)
      ];
      batch.items.forEach((item, index) => {
        statements.push(db.prepare(`INSERT INTO devotion_items(workspace_id,batch_key,item_id,position,passage,script,metadata_json)
          VALUES(?,?,?,?,?,?,?)`).bind(batch.workspace_id, batch.batch_key, item.id, index + 1, item.passage, item.script || '', JSON.stringify(item.metadata || {})));
      });
      batch.publication_targets.forEach(target => {
        statements.push(db.prepare(`INSERT INTO devotion_targets(workspace_id,batch_key,target_id,kind,config_ref,metadata_json)
          VALUES(?,?,?,?,?,?)`).bind(batch.workspace_id, batch.batch_key, target.id, target.kind, target.config_ref || '', JSON.stringify(target.metadata || {})));
      });
      await db.batch(statements);
    },

    async getSnapshot(workspaceId, batchKey) {
      const batch = await db.prepare('SELECT workspace_id,batch_key,title,render_status,updated_at FROM devotion_batches WHERE workspace_id=? AND batch_key=?')
        .bind(workspaceId, batchKey).first();
      if (!batch) return null;
      const [items, targets, publications] = await Promise.all([
        db.prepare(`SELECT item_id,passage,script,metadata_json FROM devotion_items
          WHERE workspace_id=? AND batch_key=? ORDER BY position`).bind(workspaceId, batchKey).all(),
        db.prepare(`SELECT target_id,kind,config_ref,metadata_json FROM devotion_targets
          WHERE workspace_id=? AND batch_key=? ORDER BY target_id`).bind(workspaceId, batchKey).all(),
        db.prepare(`SELECT id,target_id,publish_at,item_ids_json,status,external_ref,updated_at FROM devotion_publications
          WHERE workspace_id=? AND batch_key=? ORDER BY publish_at,id`).bind(workspaceId, batchKey).all()
      ]);
      return {
        ...batch,
        items: (items.results || []).map(row => ({ id: row.item_id, passage: row.passage, script: row.script, metadata: parseJson(row.metadata_json, {}) })),
        publication_targets: (targets.results || []).map(row => ({ id: row.target_id, kind: row.kind, config_ref: row.config_ref, metadata: parseJson(row.metadata_json, {}) })),
        publications: (publications.results || []).map(row => ({
          id: row.id,
          target_id: row.target_id,
          publish_at: row.publish_at,
          item_ids: parseJson(row.item_ids_json, []),
          status: row.status,
          external_ref: row.external_ref,
          updated_at: row.updated_at
        }))
      };
    },

    async enqueueJob(job) {
      await db.prepare(`INSERT INTO devotion_jobs(id,workspace_id,batch_key,kind,status,payload_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)`).bind(job.id, job.workspace_id, job.batch_key, job.kind, job.status, JSON.stringify(job.payload || {}), job.created_at, job.updated_at).run();
    },

    async markBatchRenderState(workspaceId, batchKey, status, updatedAt) {
      await db.prepare('UPDATE devotion_batches SET render_status=?,updated_at=? WHERE workspace_id=? AND batch_key=?')
        .bind(status, updatedAt, workspaceId, batchKey).run();
    },

    async savePublication(publication) {
      await db.prepare(`INSERT INTO devotion_publications(id,workspace_id,batch_key,target_id,publish_at,item_ids_json,status,external_ref,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,external_ref=excluded.external_ref,updated_at=excluded.updated_at`)
        .bind(publication.id, publication.workspace_id, publication.batch_key, publication.target_id, publication.publish_at,
          JSON.stringify(publication.item_ids || []), publication.status, publication.external_ref || '', publication.updated_at).run();
    }
  };
}
