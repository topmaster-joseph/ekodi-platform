import {ensureEkodiCommandLedger,getEkodiCommandTask,settleEkodiCommandTask,recoverExpiredEkodiCommandTasks} from './ekodi-command-ledger.js';

// Scoped claim: unrelated command tasks remain untouched in the shared queue.
export async function claimAutonomousDevelopmentTask(input, options = {}) {
  const db = await ensureEkodiCommandLedger(input);
  await recoverExpiredEkodiCommandTasks(db,options);
  const now = new Date(options.now || Date.now()).toISOString();
  const leaseMs = Math.min(300000,Math.max(30000,Number(options.leaseMs)||120000));
  const until = new Date(Date.parse(now)+leaseMs).toISOString();
  const row = await db.prepare(`SELECT id FROM ai_command_tasks
    WHERE state IN ('queued','retry') AND risk != 'critical'
    AND json_valid(target_json) AND json_extract(target_json,'$.autonomousDevelopment') = 1
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    AND (lease_until IS NULL OR lease_until <= ?)
    ORDER BY created_at ASC LIMIT 1`).bind(now,now).first();
  if (!row?.id) return null;
  const updated = await db.prepare(`UPDATE ai_command_tasks
    SET state='running', attempt_count=attempt_count+1, lease_until=?, updated_at=?
    WHERE id=? AND state IN ('queued','retry') AND risk != 'critical'
    AND json_valid(target_json) AND json_extract(target_json,'$.autonomousDevelopment') = 1
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    AND (lease_until IS NULL OR lease_until <= ?)`).bind(until,now,row.id,now,now).run();
  if (Number(updated?.meta?.changes ?? updated?.changes ?? 0)!==1) return null;
  return getEkodiCommandTask(db,row.id);
}

// Execution happens only in an injected isolated worker, never inside this module.
export async function runAutonomousDevelopmentOnce(db, options = {}) {
  if (typeof options.execute !== 'function') throw new Error('isolated_executor_required');
  const task = await claimAutonomousDevelopmentTask(db,{leaseMs:options.leaseMs});
  if (!task) return {status:'idle'};
  const startedAt = new Date().toISOString();
  let result;
  try {
    result = await options.execute(Object.freeze({
      id:task.id,goal:task.goal,target:task.target,risk:task.risk,
      attempt:task.attemptCount
    }));
  } catch(error) {
    const settlement = await settleEkodiCommandTask(db,task,{
      state:'failed',reason:'isolated_executor_failed',
      error:String(error?.message||error)
    },{startedAt});
    return {status:settlement.state,taskId:task.id};
  }
  const settlement = await settleEkodiCommandTask(db,task,{
    state:'core_only',reason:'awaiting_independent_release_verification',
    evidence:{executionReceipt:result?.executionReceipt || null},
    result:result || null
  },{startedAt});
  return {status:settlement.state,taskId:task.id,provisional:true};
}
