import { CMS_SITE_IDS } from '@ekodi/cms-contracts';
import type { ValidationResult } from '@ekodi/cms-contracts';

export { CMS_DATA_CLASSIFICATIONS, CMS_SITE_IDS, CMS_STATUSES, publicPage, validateCmsPage } from '@ekodi/cms-contracts';

export const CMS_AUDIT_ACTIONS = Object.freeze({
  create: 'cms.create',
  save: 'cms.save',
  publish: 'cms.publish',
  mediaUpload: 'cms.media.upload',
  mediaDelete: 'cms.media.delete'
});

export const CMS_MEDIA_TYPES: readonly string[] = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
export const CMS_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export interface MediaMetadata {
  siteId: string;
  filename: string;
  contentType: string;
  size: number;
  visibility: 'private' | 'public';
}

export function validateMediaMetadata(input: unknown): ValidationResult<MediaMetadata> {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const siteId = String(source.siteId || '').trim().toLowerCase();
  const filename = String(source.filename || '').trim();
  const contentType = String(source.contentType || '').trim().toLowerCase();
  const size = Number(source.size);
  const visibility = source.visibility === 'public' ? 'public' : 'private';
  if (!CMS_SITE_IDS.includes(siteId)) return { error: '관리 대상 EKODI 사이트가 아닙니다.' };
  if (!filename || filename.length > 180) return { error: '파일 이름은 1~180자로 입력해 주세요.' };
  if (!CMS_MEDIA_TYPES.includes(contentType)) return { error: '지원하지 않는 미디어 형식입니다.' };
  if (!Number.isSafeInteger(size) || size < 1 || size > CMS_MEDIA_MAX_BYTES) return { error: '파일 크기는 10MB 이하여야 합니다.' };
  return { value: { siteId, filename, contentType, size, visibility } };
}

export function cmsResource(siteId: string, slug: string): string {
  return `${siteId}/${slug}`;
}
