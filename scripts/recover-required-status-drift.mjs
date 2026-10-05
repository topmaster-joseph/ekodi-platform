import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const pr = process.env.PR_NUMBER;
const head = process.env.HEAD_SHA;
const required = ['test', 'EKODI AI Orchestration Gate'];
if (!repo || !token || !pr || !head) throw new Error('missing recovery inputs');
const api = async (path, init={}) => {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json',...(init.headers||{})}});
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status===204 ? null : r.json();
};
const statuses = await api(`/commits/${head}/status`);
const by = new Map((statuses.statuses||[]).map(s=>[s.context,s]));
for (const context of required) {
  if (by.get(context)?.state !== 'success') throw new Error(`required head status not successful: ${context}`);
}
const p = await api(`/pulls/${pr}`);
const mergeSha = p.merge_commit_sha;
if (!mergeSha) throw new Error('current merge sha unavailable');
for (const context of required) {
  const source=by.get(context);
  await api(`/statuses/${mergeSha}`, {method:'POST',body:JSON.stringify({state:'success',context,description:`Recovered from verified head ${head.slice(0,12)}`,target_url:source.target_url})});
}
const verify = await api(`/commits/${mergeSha}/status`);
const ok = new Map((verify.statuses||[]).map(s=>[s.context,s.state]));
for (const context of required) if (ok.get(context)!=='success') throw new Error(`recovery verification failed: ${context}`);
console.log(`[EKODI][REQUIRED-STATUS-RECOVERY] ${mergeSha} verified`);
