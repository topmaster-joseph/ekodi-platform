import { CMS_SITE_IDS } from '@ekodi/cms-contracts';

export { CMS_DATA_CLASSIFICATIONS, CMS_SITE_IDS, CMS_STATUSES, publicPage, validateCmsPage } from '@ekodi/cms-contracts';

export const CMS_AUDIT_ACTIONS = Object.freeze({
  create: 'cms.create',
  save: 'cms.save',
  publish: 'cms.publish',
  mediaUpload: 'cms.media.upload',
  mediaDelete: 'cms.media.delete'
});

export const CMS_MEDIA_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
export const CMS_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export function validateMediaMetadata(input) {
  const siteId = String(input?.siteId || '').trim().toLowerCase();
  const filename = String(input?.filename || '').trim();
  const contentType = String(input?.contentType || '').trim().toLowerCase();
  const size = Number(input?.size);
  const visibility = input?.visibility === 'public' ? 'public' : 'private';
  if (!CMS_SITE_IDS.includes(siteId)) return { error: '관리 대상 EKODI 사이트가 아닙니다.' };
  if (!filename || filename.length > 180) return { error: '파일 이름은 1~180자로 입력해 주세요.' };
  if (!CMS_MEDIA_TYPES.includes(contentType)) return { error: '지원하지 않는 미디어 형식입니다.' };
  if (!Number.isSafeInteger(size) || size < 1 || size > CMS_MEDIA_MAX_BYTES) return { error: '파일 크기는 10MB 이하여야 합니다.' };
  return { value: { siteId, filename, contentType, size, visibility } };
}

export function cmsResource(siteId, slug) {
  return `${siteId}/${slug}`;
}
