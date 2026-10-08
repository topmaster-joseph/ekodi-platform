import {claimNextEkodiCommandTask,getEkodiCommandTask} from './ekodi-command-ledger.js';

// Adapts the existing durable D1 queue to an externally supplied, isolated runner.
// Deliberately does not execute shell commands or deploy code itself.
export async function runAutonomousDevelopmentOnce(db, options = {}) {
  if (typeof options.execute !== 'function') throw new Error('isolated_executor_required');
  const task = await claimNextEkodiCommandTask(db,{leaseMs:options.leaseMs});
  if (!task) return {status:'idle'};
  const id=task.id;
  try {
    const result=await options.execute(Object.freeze({
      id,goal:task.goal,target:task.target,risk:task.risk,attempt:task.attemptCount
    }));
    // Executor results are provisional until the existing ledger records
    // independently verified evidence and release provenance.
    return {status:'execution_returned',taskId:id,provisional:true,result};
  } catch(error) {
    return {status:'execution_error',taskId:id,error:String(error?.message||error)};
  }
}
