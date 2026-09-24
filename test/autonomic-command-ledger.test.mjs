import test from 'node:test';
import assert from 'node:assert/strict';
import { claimEkodiCommandTask, ingestEkodiPulse } from '../ekodi-command-ledger.js';

function fakeDb() {
  const tasks = new Map();
  const events = new Map();
  return {
    tasks,
    events,
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() {
          if (/^CREATE |^CREATE INDEX/.test(sql.trim())) return { success:true, meta:{ changes:0 } };
          if (/INSERT OR IGNORE INTO ai_pulse_events/.test(sql)) {
            const [id,kind,source,summary,change_class,risk,actionable,requires_human,event_json,task_id,observed_at] = this.args;
            if (!events.has(id)) events.set(id, { id,kind,source,summary,change_class,risk,actionable,requires_human,event_json,state:'observed',task_id,observed_at,processed_at:null });
            return { success:true, meta:{ changes:1 } };
          }
          if (/INSERT OR IGNORE INTO ai_command_tasks/.test(sql)) {
            const [id,pulse_event_id,goal,risk,target_json,delegation_json,context_json,state,max_attempts,next_attempt_at,created_at,updated_at] = this.args;
            if (!tasks.has(id)) tasks.set(id, {
              id,pulse_event_id,goal,risk,target_json,delegation_json,context_json,state,
              attempt_count:0,max_attempts,next_attempt_at,lease_until:null,plan_json:'{}',result_json:'{}',
              evidence_json:'{}',last_error:'',created_at,updated_at,closed_at:null,
            });
            return { success:true, meta:{ changes:1 } };
          }
          if (/UPDATE ai_pulse_events SET state = 'human_gate'/.test(sql)) {
            const [processed_at,id] = this.args;
            const row = events.get(id);
            if (row) Object.assign(row,{ state:'human_gate', processed_at });
            return { success:true, meta:{ changes:row ? 1 : 0 } };
          }
          if (/UPDATE ai_pulse_events SET state = 'ignored'/.test(sql)) {
            const [processed_at,id] = this.args;
            const row = events.get(id);
            if (row) Object.assign(row,{ state:'ignored', processed_at });
            return { success:true, meta:{ changes:row ? 1 : 0 } };
          }
          if (/UPDATE ai_command_tasks\s+SET state = 'running'/.test(sql)) {
            const id = this.args[2];
            const row = tasks.get(id);
            if (!row || !['queued','retry'].includes(row.state)) return { success:true, meta:{ changes:0 } };
            row.state='running';
            row.attempt_count += 1;
            row.lease_until=this.args[0];
            row.updated_at=this.args[1];
            return { success:true, meta:{ changes:1 } };
          }
          return { success:true, meta:{ changes:0 } };
        },
        async first() {
          if (/SELECT \* FROM ai_command_tasks WHERE id = \?/.test(sql)) return tasks.get(this.args[0]) || null;
          if (/SELECT \* FROM ai_pulse_events WHERE id = \?/.test(sql)) return events.get(this.args[0]) || null;
          return null;
        },
        async all() { return { results:[] }; },
      };
      return stmt;
    },
    async batch(stmts) {
      for (const stmt of stmts) await stmt.run();
      return stmts.map(() => ({ success:true }));
    },
  };
}

test('human-gated autonomic event is persisted but never enters the executable queue', async () => {
  const DB=fakeDb();
  const task=await ingestEkodiPulse(DB,{
    taskId:'task_red_drift',
    goal:'Preserve evidence for sovereign review only.',
    risk:'high',
    target:{service:'core',capability:'desired_state_reconciliation'},
    delegation:{allowed:false,reversible:false,audited:true,preflightVerified:false,verificationDefined:true,directProductionMutation:false},
    event:{
      id:'red_drift',
      kind:'system_event',
      source:'ekodi-autonomic-control-plane',
      summary:'Direct autonomous production mutation invariant changed.',
      changeClass:'red',
      actionable:false,
      requiresHumanDecision:true,
    },
  });
  assert.equal(task.state,'human_gate');
  assert.equal(task.event.state,'human_gate');
  assert.equal(task.event.actionable,false);
  assert.equal(task.event.requiresHumanDecision,true);
  const claimed=await claimEkodiCommandTask(DB,task.id);
  assert.equal(claimed,null);
  assert.equal(DB.tasks.get(task.id).attempt_count,0);
});
