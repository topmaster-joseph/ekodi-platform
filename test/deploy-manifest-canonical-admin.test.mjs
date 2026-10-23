import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// 2026-10-24: Books and Publishing releases were rolled back because their
// manifests still expected /admin to redirect to the retired admin host, while
// the Workers correctly redirect to the canonical ekodi.kr/admin/<site> route.
const cases = [
  { manifest: 'deploy/manifests/books.worker.json', worker: 'books-worker.js', location: 'https://ekodi.kr/admin/books#books', rollback: 'books#books' },
  { manifest: 'deploy/manifests/publishing.worker.json', worker: 'publishing-worker.js', location: 'https://ekodi.kr/admin/publishing#publishing', rollback: 'publishing#publishing' },
];

const adminCheck = manifestPath => JSON.parse(fs.readFileSync(manifestPath, 'utf8')).worker.requests
  .find(request => new URL(request.url).pathname === '/admin');

for (const item of cases) {
  test(`${item.manifest} expects the canonical admin redirect and a version-neutral rollback`, () => {
    const admin = adminCheck(item.manifest);
    assert.ok(admin, 'admin check present');
    assert.deepEqual(admin.headerExpect, [`location: ${item.location}`]);
    assert.deepEqual(admin.rollbackHeaderExpect, [item.rollback]);
    // The previous version redirects to the same /<site>#<site> fragment on the retired
    // host, so the rollback marker is the shared suffix of both locations.
    assert.ok(item.location.endsWith(`/${item.rollback}`));
  });

  test(`${item.worker} actually redirects /admin where its manifest expects`, async () => {
    const worker = (await import(pathToFileURL(path.resolve(item.worker)).href)).default;
    const response = await worker.fetch(new Request(adminCheck(item.manifest).url), {}, { waitUntil() {} });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), item.location);
  });
}

test('deploy workflows verify the same canonical admin location as their manifests', () => {
  assert.match(fs.readFileSync('.github/workflows/deploy-books.yml', 'utf8'), /location: https:\/\/ekodi\.kr\/admin\/books#books/);
  assert.match(fs.readFileSync('.github/workflows/deploy-publishing.yml', 'utf8'), /location: https:\/\/ekodi\.kr\/admin\/publishing#publishing/);
  assert.match(fs.readFileSync('.github/workflows/deploy-service-admin-entry.yml', 'utf8'), /startsWith\('https:\/\/ekodi\.kr\/admin\/'\)/);
});
