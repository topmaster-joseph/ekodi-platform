import {claimNextEkodiCommandTask,settleEkodiCommandTask} from './ekodi-command-ledger.js';

// Adapts the existing durable D1 queue to a supplied isolated executor.
// No shell execution, repository mutation, or production deployment occurs here.
export async function runAutonomousDevelopmentOnce(db, options = {}) {
  if (typeof options.execute !== 'function') throw new Error('isolated_executor_required');
  const task = await claimNextEkodiCommandTask(db,{leaseMs:options.leaseMs});
  if (!task) return {status:'idle'};
  const startedAt = new Date().toISOString();
  try {
    const result = await options.execute(Object.freeze({
      id:task.id,goal:task.goal,target:task.target,risk:task.risk,
      attempt:task.attemptCount
    }));
    // A successful executor return is not evidence of a production deployment.
    // The existing ledger's completion guard determines verified status.
    const settlement = await settleEkodiCommandTask(db,task,{
      state:'core_only',reason:'awaiting_independent_release_verification',
      evidence:{executionReceipt:result?.executionReceipt || null},
      result:result || null
    },{startedAt});
    return {status:settlement.state,taskId:task.id,provisional:true};
  } catch(error) {
    const settlement = await settleEkodiCommandTask(db,task,{
      state:'failed',reason:'isolated_executor_failed',
      error:String(error?.message||error)
    },{startedAt});
    return {status:settlement.state,taskId:task.id};
  }
}
