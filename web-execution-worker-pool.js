const freeze = value => Object.freeze(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createWebExecutionWorkerPool(options = {}) {
  const concurrency = Math.max(1, Math.min(16, Number(options.concurrency) || 2));
  const timeoutMs = Math.max(250, Number(options.timeoutMs) || 20_000);
  const failureThreshold = Math.max(1, Number(options.failureThreshold) || 3);
  const cooldownMs = Math.max(1000, Number(options.cooldownMs) || 60_000);
  const now = options.now || Date.now;
  const circuits = new Map();
  let active = 0;
  const queue = [];

  function circuitOpen(id) {
    const s = circuits.get(id);
    if (!s) return false;
    if (s.openUntil <= now()) { circuits.delete(id); return false; }
    return s.failures >= failureThreshold;
  }
  function fail(id) {
    const s = circuits.get(id) || { failures: 0, openUntil: 0 };
    const failures = s.failures + 1;
    circuits.set(id, { failures, openUntil: failures >= failureThreshold ? now() + cooldownMs : 0 });
  }
  function success(id) { circuits.delete(id); }
  function withTimeout(promise) {
    return Promise.race([
      promise,
      sleep(timeoutMs).then(() => { const e = new Error('WEB_EXECUTION_TIMEOUT'); e.code='WEB_EXECUTION_TIMEOUT'; throw e; }),
    ]);
  }
  function drain() {
    while (active < concurrency && queue.length) {
      const item = queue.shift(); active += 1;
      Promise.resolve().then(item.run).then(item.resolve, item.reject).finally(() => { active -= 1; drain(); });
    }
  }
  async function execute(adapter, task) {
    if (!adapter?.id || typeof adapter.invoke !== 'function') throw new TypeError('valid adapter required');
    if (circuitOpen(adapter.id)) { const e = new Error('WEB_EXECUTION_CIRCUIT_OPEN'); e.code='WEB_EXECUTION_CIRCUIT_OPEN'; throw e; }
    try {
      const result = await withTimeout(adapter.invoke(task));
      success(adapter.id); return result;
    } catch (error) { fail(adapter.id); throw error; }
  }
  return freeze({
    run(adapter, task) { return new Promise((resolve,reject)=>{ queue.push({run:()=>execute(adapter,task),resolve,reject}); drain(); }); },
    status() { return freeze({ concurrency, active, queued: queue.length, circuits: freeze([...circuits].map(([id,s])=>freeze({id,...s,open:circuitOpen(id)}))) }); },
  });
}
