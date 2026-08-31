import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const VERSION = '0.1.0';
const PORT = Number(process.env.PORT || 8788);
const TOKEN = String(process.env.EKODI_BROWSER_WORKER_TOKEN || '');
const DATA_DIR = path.resolve(process.env.EKODI_BROWSER_DATA_DIR || '/data');
const ALLOWED_HOSTS = String(process.env.EKODI_BROWSER_ALLOWED_HOSTS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (!TOKEN) throw new Error('EKODI_BROWSER_WORKER_TOKEN is required');
if (!ALLOWED_HOSTS.length) throw new Error('EKODI_BROWSER_ALLOWED_HOSTS is required');

await mkdir(path.join(DATA_DIR, 'profiles'), { recursive: true });
await mkdir(path.join(DATA_DIR, 'artifacts'), { recursive: true });

const jobs = new Map();
let queueTail = Promise.resolve();
let activeJobs = 0;

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function isAuthorized(req) {
  const value = String(req.headers.authorization || '');
  const expected = `Bearer ${TOKEN}`;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hostAllowed(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function assertAllowedUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http/https URLs are allowed');
  if (!hostAllowed(url.hostname)) throw new Error(`Host is not allowlisted: ${url.hostname}`);
  return url;
}

function safeProfileName(value) {
  const profile = String(value || 'default');
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(profile)) throw new Error('Invalid profile name');
  return profile;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function enqueue(fn) {
  const run = queueTail.then(fn, fn);
  queueTail = run.catch(() => {});
  return run;
}

function pruneJobs() {
  if (jobs.size <= 100) return;
  const completed = [...jobs.values()]
    .filter((job) => ['succeeded', 'failed'].includes(job.status))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const job of completed.slice(0, jobs.size - 100)) jobs.delete(job.id);
}

async function runNavigateSnapshot(job) {
  const input = job.input || {};
  const requestedUrl = assertAllowedUrl(String(input.url || ''));
  const profile = safeProfileName(input.profile);
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || 30000), 1000), 60000);
  const profileDir = path.join(DATA_DIR, 'profiles', profile);
  const artifactName = `${job.id}.png`;
  const artifactPath = path.join(DATA_DIR, 'artifacts', artifactName);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    const response = await page.goto(requestedUrl.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const finalUrl = assertAllowedUrl(page.url());
    await page.screenshot({ path: artifactPath, fullPage: true });
    const title = await page.title();
    const text = String(await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')).slice(0, 4000);

    return {
      adapter: 'navigate-snapshot',
      requestedUrl: requestedUrl.href,
      finalUrl: finalUrl.href,
      httpStatus: response?.status() ?? null,
      title,
      text,
      artifact: `/artifacts/${artifactName}`,
      profile
    };
  } finally {
    await context.close();
  }
}

async function executeJob(job) {
  activeJobs += 1;
  job.status = 'running';
  job.updatedAt = new Date().toISOString();
  try {
    if (job.adapter !== 'navigate-snapshot') throw new Error(`Unknown adapter: ${job.adapter}`);
    job.result = await runNavigateSnapshot(job);
    job.status = 'succeeded';
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    activeJobs -= 1;
    job.updatedAt = new Date().toISOString();
    pruneJobs();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json(res, 200, { ok: true, version: VERSION });
    }

    if (!isAuthorized(req)) return json(res, 401, { error: 'unauthorized' });

    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, {
        ok: true,
        version: VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        activeJobs,
        retainedJobs: jobs.size,
        allowedHosts: ALLOWED_HOSTS
      });
    }

    if (req.method === 'POST' && url.pathname === '/jobs') {
      const body = await readJsonBody(req);
      const job = {
        id: randomUUID(),
        adapter: String(body.adapter || ''),
        input: body.input || {},
        status: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: null,
        error: null
      };
      jobs.set(job.id, job);
      enqueue(() => executeJob(job));
      return json(res, 202, { id: job.id, status: job.status });
    }

    const jobMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: 'job_not_found' });
    }

    const artifactMatch = url.pathname.match(/^\/artifacts\/([0-9a-f-]{36}\.png)$/i);
    if (req.method === 'GET' && artifactMatch) {
      try {
        const bytes = await readFile(path.join(DATA_DIR, 'artifacts', artifactMatch[1]));
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': bytes.length,
          'cache-control': 'no-store'
        });
        return res.end(bytes);
      } catch {
        return json(res, 404, { error: 'artifact_not_found' });
      }
    }

    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`EKODI browser worker ${VERSION} listening on :${PORT}`);
});
