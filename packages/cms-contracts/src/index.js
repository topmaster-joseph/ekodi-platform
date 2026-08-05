import { EKODI_SERVICES } from '@ekodi/ecosystem-catalog';
import { normalizeKey, normalizeText } from '@ekodi/shared';

export const CMS_SITE_IDS = Object.freeze(EKODI_SERVICES.map(service => service.id));
export const CMS_STATUSES = Object.freeze(['draft', 'published']);
export const CMS_DATA_CLASSIFICATIONS = Object.freeze(['public', 'internal', 'confidential', 'restricted']);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCmsPage(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') return { error: '콘텐츠 형식을 확인해 주세요.' };
  const value = {};

  if (!partial || input.siteId !== undefined) {
    value.siteId = normalizeKey(input.siteId);
    if (!CMS_SITE_IDS.includes(value.siteId)) return { error: '관리 대상 EKODI 사이트가 아닙니다.' };
  }
  if (!partial || input.slug !== undefined) {
    value.slug = normalizeKey(input.slug);
    if (!SLUG_PATTERN.test(value.slug) || value.slug.length > 80) return { error: '슬러그는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.' };
  }
  if (!partial || input.title !== undefined) {
    value.title = normalizeText(input.title);
    if (!value.title || value.title.length > 120) return { error: '제목은 1~120자로 입력해 주세요.' };
  }
  if (!partial || input.summary !== undefined) {
    value.summary = normalizeText(input.summary);
    if (value.summary.length > 300) return { error: '요약은 300자 이하여야 합니다.' };
  }
  if (!partial || input.content !== undefined) {
    value.content = String(input.content || '');
    if (value.content.length > 100000) return { error: '본문은 100,000자 이하여야 합니다.' };
  }
  if (!partial || input.classification !== undefined) {
    value.classification = normalizeKey(input.classification || 'internal');
    if (!CMS_DATA_CLASSIFICATIONS.includes(value.classification)) return { error: '콘텐츠 공개 등급을 확인해 주세요.' };
  }
  if (input.version !== undefined) {
    value.version = Math.trunc(Number(input.version));
    if (!Number.isInteger(value.version) || value.version < 1) return { error: '콘텐츠 버전을 확인해 주세요.' };
  }

  return { value };
}

export function publicPage(row) {
  return {
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary || '',
    content: row.published_content || '',
    publishedAt: row.published_at
  };
}
