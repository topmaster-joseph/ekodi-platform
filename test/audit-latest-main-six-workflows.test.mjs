import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLatestMain, REQUIRED_WORKFLOWS } from '../scripts/audit-latest-main-six-workflows.mjs';

const SHA = 'a'.repeat(40);

function fixtures(change = () => {}) {
  const runs = REQUIRED_WORKFLOWS.map((wf, idx) => ({
    id: idx + 1000,
    name: wf.name,
    path: '.github/workflows/' + wf.file,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA,
    head_branch: 'main',
    html_url: 'https://github.com/topmaster-joseph/ekodi-platform/actions/runs/' + (idx + 1000),
  }));
  const jobs = new Map(REQUIRED_WORKFLOWS.map((wf, idx) => [idx + 1000, {
    total_count: wf.jobs.length,
    jobs: wf.jobs.map(name => ({ name, status: 'completed', conclusion: 'success' })),
  }]));
  let mainReads = 0;
  let urls = [];
  const fixture = {
    runs, jobs,
    requestJson: async path => {
      urls.push(path);
      if (path === '/git/ref/heads/main') {
        mainReads++;
        return { object: { sha: SHA } };
      }
      const file = path.match(/^\/actions\/workflows\/([^/]+)\/runs\?/);
      if (file) {
        const index = REQUIRED_WORKFLOWS.findIndex(w => w.file === decodeURIComponent(file[1]));
        if (!path.includes('head_sha=' + SHA) || !path.includes('branch=main')) {
          throw new Error('Missing exact-main query filter');
        }
        return { workflow_runs: index < 0 ? [] : [runs[index]] };
      }
      const id = path.match(/^\/actions\/runs\/([0-9]+)\/jobs\?per_page=100$/);
      if (id) return jobs.get(Number(id[1]));
      throw new Error('Unexpected API read: ' + path);
    },
    setMain: fn => {
      const original = fixture.requestJson;
      fixture.requestJson = path =>
        path === '/git/ref/heads/main' ? fn(++mainReads) : original(path);
    },
    get urls() { return urls; },
    get mainReads() { return mainReads; },
  };
  change(fixture);
  return fixture;
}

test('six real main runs with every mandatory job successful pass and recheck main SHA', async () => {
  const fixture = fixtures();
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, true);
  assert.equal(proof.passed, 6);
  assert.equal(proof.sha, SHA);
  assert.equal(fixture.mainReads, 2);
  assert.equal(fixture.urls.filter(x => x.includes('/actions/workflows/')).length, 6);
});

test('a success-labeled real-device run with skipped real-device job is not accepted', async () => {
  const fixture = fixtures(f => {
    f.jobs.get(1003).jobs.find(x => x.name === 'real-device').conclusion = 'skipped';
  });
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, false);
  assert.equal(proof.passed, 5);
  assert.match(proof.checks[3].reason, /required-job-not-success:real-device:skipped/);
});

test('scheduled shared-site release gate alone never counts as deployment', async () => {
  const fixture = fixtures(f => {
    f.runs[5].event = 'schedule';
    f.jobs.set(1005, { total_count: 7, jobs: [
      { name: 'scheduled_release_gate', status: 'completed', conclusion: 'success' },
      ...REQUIRED_WORKFLOWS[5].jobs.map(name => ({
        name, status: 'completed', conclusion: 'skipped',
      })),
    ] });
  });
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, false);
  assert.match(proof.checks[5].reason, /required-job-not-success:staging_gate:skipped/);
});

test('a successful deployment workflow with skipped production does not count', async () => {
  const fixture = fixtures(f => {
    f.jobs.get(1004).jobs.find(x => x.name === 'production').conclusion = 'skipped';
  });
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, false);
  assert.match(proof.checks[4].reason, /production:skipped/);
});

test('a successful workflow on a stale SHA is rejected', async () => {
  const fixture = fixtures(f => { f.runs[1].head_sha = 'b'.repeat(40); });
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, false);
  assert.equal(proof.checks[1].reason, 'no-successful-latest-main-run');
});

test('pull request run is not main execution, regardless of apparent success', async () => {
  const fixture = fixtures(f => { f.runs[2].event = 'pull_request'; });
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, false);
  assert.equal(proof.checks[2].reason, 'no-successful-latest-main-run');
});

test('a spoofed workflow name at a different workflow file is rejected', async () => {
  const fixture = fixtures(f => { f.runs[0].path = '.github/workflows/not-constitution.yml'; });
  const proof = await auditLatestMain({ requestJson: fixture.requestJson });
  assert.equal(proof.ok, false);
  assert.equal(proof.checks[0].reason, 'no-successful-latest-main-run');
});

test('a new main SHA during verification fails closed even after six passing jobs', async () => {
  const fixture = fixtures();
  const original = fixture.requestJson;
  let reads = 0;
  const proof = await auditLatestMain({ requestJson: path => {
    if (path === '/git/ref/heads/main') return { object: { sha: ++reads === 1 ? SHA : 'c'.repeat(40) } };
    return original(path);
  } });
  assert.equal(proof.ok, false);
  assert.equal(proof.stableMain, false);
  assert.equal(proof.reason, 'main-sha-changed-during-audit');
});

test('a malformed GitHub job response fails closed rather than claiming success', async () => {
  const fixture = fixtures(f => f.jobs.set(1000, { total_count: 101, jobs: [] }));
  await assert.rejects(() => auditLatestMain({ requestJson: fixture.requestJson }), /Incomplete job evidence/);
});
