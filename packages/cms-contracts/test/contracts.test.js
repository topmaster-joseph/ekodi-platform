import assert from 'node:assert/strict';
import test from 'node:test';
import { CMS_DATA_CLASSIFICATIONS, CMS_SITE_IDS, validateCmsPage } from '../src/index.js';

test('CMS covers every EKODI service', () => {
  assert.deepEqual(CMS_SITE_IDS, ['platform', 'mall', 'biz', 'publishing', 'church', 'lab', 'mission', 'trade', 'marketing', 'consulting', 'media', 'education', 'solution', 'erp', 'community']);
});

test('CMS content classification is explicit and defaults to internal', () => {
  assert.deepEqual(CMS_DATA_CLASSIFICATIONS, ['public', 'internal', 'confidential', 'restricted']);
  const validated = validateCmsPage({ siteId: 'mall', slug: 'about', title: '소개', summary: '', content: '' });
  assert.equal(validated.value.classification, 'internal');
  assert.match(validateCmsPage({ siteId: 'mall', slug: 'about', title: '소개', summary: '', content: '', classification: 'secret' }).error, /공개 등급/);
});

test('page validation normalizes safe content', () => {
  assert.deepEqual(validateCmsPage({
    siteId: 'MALL', slug: 'About-Us', title: ' 회사 소개 ', summary: '', content: '# 소개'
  }), {
    value: { siteId: 'mall', slug: 'about-us', title: '회사 소개', summary: '', content: '# 소개', classification: 'internal' }
  });
});

test('page validation rejects unknown sites and unsafe slugs', () => {
  assert.match(validateCmsPage({ siteId: 'unknown', slug: 'home', title: 'x', summary: '', content: '' }).error, /관리 대상/);
  assert.match(validateCmsPage({ siteId: 'mall', slug: '../home', title: 'x', summary: '', content: '' }).error, /슬러그/);
});
