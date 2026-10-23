import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// 2026-10-24: Books and Publishing releases were rolled back because their
// manifests still expected /admin to redirect to the retired admin host, while
// the Workers correctly redirect to the canonical ekodi.kr/admin/<site> route.
const cases = [
  { manifest: 'deploy/manifests/books.worker.json', worker: 'books-worker.js', url: 'https://books.ekodi.kr/admin', location: 'https://ekodi.kr/admin/books#books', rollback: 'books#books' },
  { manifest: 'deploy/manifests/publishing.worker.json', worker: 'publishing-worker.js', url: 'https://publishing.ekodi.kr/admin', location: 'https://ekodi.kr/admin/publishing#publishing', rollback: 'publishing#publishing' },
];

for (const item of cases) {
  test(`${item.manifest} expects the canonical admin redirect and a version-neutral rollback`, () => {
    const manifest = JSON.parse(fs.readFileSync(item.manifest, 'utf8'));
    const admin = manifest.worker.requests.find(request => request.url === item.url);
    assert.ok(admin, 'admin check present');
    assert.deepEqual(admin.headerExpect, [`location: ${item.location}`]);
    assert.deepEqual(admin.rollbackHeaderExpect, [item.rollback]);
    // The rollback marker must hold for both the previous (retired host) and the new redirect.
    assert.ok(`location: ${item.location}`.includes(item.rollback));
    assert.ok(`location: https://admin.ekodi.kr/${item.rollback}`.includes(item.rollback));
  });

  test(`${item.worker} actually redirects /admin where its manifest expects`, async () => {
    const worker = (await import(pathToFileURL(path.resolve(item.worker)).href)).default;
    const response = await worker.fetch(new Request(item.url), {}, { waitUntil() {} });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), item.location);
  });
}

test('deploy workflows verify the same canonical admin location as their manifests', () => {
  assert.match(fs.readFileSync('.github/workflows/deploy-books.yml', 'utf8'), /location: https:\/\/ekodi\.kr\/admin\/books#books/);
  assert.match(fs.readFileSync('.github/workflows/deploy-publishing.yml', 'utf8'), /location: https:\/\/ekodi\.kr\/admin\/publishing#publishing/);
  const entry = fs.readFileSync('.github/workflows/deploy-service-admin-entry.yml', 'utf8');
  assert.match(entry, /startsWith\('https:\/\/ekodi\.kr\/admin\/'\)/);
  for (const file of ['deploy-books.yml', 'deploy-publishing.yml', 'deploy-service-admin-entry.yml']) {
    assert.doesNotMatch(fs.readFileSync(`.github/workflows/${file}`, 'utf8'), /admin\.ekodi\.kr/, file);
  }
});
