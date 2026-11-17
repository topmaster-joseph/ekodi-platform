// Offline source proof for the cooperative document print and signature-link flow (2026-11-17).
// Uses only the source runner's intercepted browser and disposable SQLite/in-memory bucket.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { routeCooperative } from '../cooperative-control.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n% EKODI source QA signed copy\n'), Buffer.alloc(400, 32), Buffer.from('\n%%EOF\n')]);

export async function verifyCooperativeSignatureFlow({ contextFor, fixture: f, cooperatives, checks, screenshot }) {
  const objects = new Map();
  f.env.COOP_SIGNATURE_FILES = {
    async put(key, value) { objects.set(key, Buffer.from(value)); },
    async get(key) { return objects.has(key) ? { body: objects.get(key) } : null; },
    async delete(key) { objects.delete(key); },
  };
  const scan = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'coop-sign-')), 'signed.pdf');
  await fs.writeFile(scan, PDF);
  for (const [index, coop] of cooperatives.entries()) {
    const token = index === 0 ? 'admin-jub' : 'admin-open';
    const root = 'https://ekodi.kr/' + coop.publicSlug;
    for (const width of [1440, 390]) {
      const owner = await contextFor(width, token);
      const admin = await owner.newPage();
      await admin.goto(root + '/admin');
      await admin.waitForSelector('#workspace:not([hidden])');
      await admin.getByRole('tab', { name: '설립서류', exact: true }).click();
      await admin.waitForSelector('#signatureDesk [data-doc-view="charter"]');
      await admin.waitForFunction(() => !document.querySelector('#signatureDesk').textContent.includes('불러오고 있습니다'));
      assert.equal(await admin.locator('#signatureDesk [data-doc-view]').count(), 9, 'nine printable documents');
      await admin.locator('#signatureDesk [data-doc-view="minutes"]').click();
      await admin.waitForSelector('#printArea:not([hidden]) .print-doc[data-print-doc="minutes"]');
      assert.ok((await admin.locator('#printArea').innerText()).includes('창립총회 의사록'));
      assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal overflow');
      await screenshot(admin, `${coop.publicSlug}-documents-preview-${width}`);
      await admin.locator('[data-preview-close]').click();
      await admin.locator('#signatureDesk [data-sig-open="consent"]').click();
      await admin.waitForSelector('#sigRequestForm');
      assert.equal(await admin.locator('#sigRequestForm input[name="founder"]:checked').count(), await admin.locator('#sigRequestForm input[name="founder"]').count(), 'consent defaults to every founder');
      await admin.locator('#sigRequestForm input[name="founder"]').evaluateAll(inputs => inputs.forEach((input, i) => { input.checked = i === 1; }));
      await admin.locator('#sigRequestForm button[type="submit"]').click();
      await admin.waitForSelector('#sigIssued input[readonly]');
      const link = await admin.locator('#sigIssued input[readonly]').first().inputValue();
      assert.match(link, new RegExp('^' + root.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '/sign#[A-Za-z0-9_-]{43}$'));
      await screenshot(admin, `${coop.publicSlug}-signature-links-${width}`);

      const signerContext = await contextFor(width);
      const signer = await signerContext.newPage();
      await signer.goto(link);
      await signer.waitForSelector('#signRequest:not([hidden])');
      assert.ok((await signer.locator('#printArea').innerText()).includes('설립동의서'));
      assert.equal(await signer.locator('#gate').count(), 0, 'no login gate on the signing page');
      await signer.locator('#signUpload input[type="file"]').setInputFiles(scan);
      assert.equal(await signer.locator('#signUpload input[type="file"]').evaluate(input => input.files[0]?.size), PDF.length, 'the browser accepts the scan for upload');
      // Playwright request interception drops multipart file bytes, so the binary POST is sent through
      // the same Worker route directly; the page is then reloaded to prove the submitted state is shown.
      const form = new FormData();
      form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'signed.pdf');
      const uploaded = await routeCooperative(new Request(root + '/api/sign/upload', { method: 'POST', headers: { origin: 'https://ekodi.kr', 'x-ekodi-sign-token': link.split('#')[1] }, body: form }), f.env);
      assert.equal(uploaded.status, 201);
      await signer.reload();
      await signer.waitForSelector('#signRequest:not([hidden])');
      await signer.waitForFunction(() => document.querySelector('#status').textContent.startsWith('이미 제출한 파일이 있습니다.'));
      assert.equal(await signer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await screenshot(signer, `${coop.publicSlug}-sign-page-submitted-${width}`);
      await signerContext.close();

      await admin.reload();
      await admin.waitForSelector('#workspace:not([hidden])');
      await admin.getByRole('tab', { name: '설립서류', exact: true }).click();
      await admin.waitForSelector('#signatureDesk .sig-status.uploaded');
      const pending = admin.waitForEvent('download');
      await admin.locator('#signatureDesk [data-sig-file]').first().click();
      const file = await pending;
      assert.deepEqual(await fs.readFile(await file.path()), PDF, 'the admin downloads exactly the uploaded copy');
      admin.once('dialog', dialog => dialog.accept());
      await admin.locator('#signatureDesk [data-sig-accept]').first().click();
      await admin.waitForSelector('#signatureDesk .sig-status.accepted');
      await screenshot(admin, `${coop.publicSlug}-signature-accepted-${width}`);
      await owner.close();
      checks.push({ surface: 'signature-flow', slug: coop.slug, width, evidenceScope: 'offline-source-synthetic', passed: true });
    }
  }
}
