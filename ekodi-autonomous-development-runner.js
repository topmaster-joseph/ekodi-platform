import {claimNextEkodiCommandTask,settleEkodiCommandTask} from './ekodi-command-ledger.js';

// This adapter never executes shell commands or deploys code directly.
// The executor is injected by an isolated worker process.
export async function runAutonomousDevelopmentOnce(db, options = {}) {
  if (typeof options.execute !== 'function') throw new Error('isolated_executor_required');
  const task = await claimNextEkodiCommandTask(db,{leaseMs:options.leaseMs});
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
  // Do not treat an executor return as independent release verification.
  // Settlement failures propagate to the caller rather than being mistaken for
  // executor failures and causing a second settlement attempt.
  const settlement = await settleEkodiCommandTask(db,task,{
    state:'core_only',reason:'awaiting_independent_release_verification',
    evidence:{executionReceipt:result?.executionReceipt || null},
    result:result || null
  },{startedAt});
  return {status:settlement.state,taskId:task.id,provisional:true};
}
