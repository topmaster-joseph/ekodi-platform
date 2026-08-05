import assert from 'node:assert/strict';
import test from 'node:test';
import { CMS_AUDIT_ACTIONS, CMS_SITE_IDS, cmsResource, validateMediaMetadata } from '../src/index.js';

test('EKCMS exposes stable audit actions and resource names', () => {
  assert.equal(CMS_AUDIT_ACTIONS.publish, 'cms.publish');
  assert.equal(cmsResource('mall', 'about-us'), 'mall/about-us');
  assert.equal(CMS_SITE_IDS.includes('platform'), true);
});

test('media metadata is private by default and size limited', () => {
  assert.deepEqual(validateMediaMetadata({ siteId: 'mall', filename: '상품.jpg', contentType: 'image/jpeg', size: 1024 }), {
    value: { siteId: 'mall', filename: '상품.jpg', contentType: 'image/jpeg', size: 1024, visibility: 'private' }
  });
  assert.match(validateMediaMetadata({ siteId: 'mall', filename: 'x.exe', contentType: 'application/octet-stream', size: 10 }).error, /지원하지/);
});
