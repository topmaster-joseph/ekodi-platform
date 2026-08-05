import { EKODI_SERVICES } from '@ekodi/ecosystem-catalog';
import { normalizeKey, normalizeText } from '@ekodi/shared';

export const CMS_SITE_IDS: readonly string[] = Object.freeze(EKODI_SERVICES.map(service => service.id));
export const CMS_STATUSES = ['draft', 'published'] as const;
export const CMS_DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type CmsDataClassification = typeof CMS_DATA_CLASSIFICATIONS[number];

export interface CmsPageInput {
  siteId: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  classification: CmsDataClassification;
  version?: number;
}

export type CmsPageUpdate = Partial<CmsPageInput> & { version?: number };
export type ValidationResult<T> = { value: T; error?: never } | { error: string; value?: never };

interface CmsPageRow {
  site_id: string;
  slug: string;
  title: string;
  summary?: string | null;
  published_content?: string | null;
  published_at?: string | null;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCmsPage(input: unknown, options?: { partial?: false }): ValidationResult<CmsPageInput>;
export function validateCmsPage(input: unknown, options: { partial: true }): ValidationResult<CmsPageUpdate>;
export function validateCmsPage(input: unknown, { partial = false }: { partial?: boolean } = {}): ValidationResult<CmsPageInput | CmsPageUpdate> {
  if (!input || typeof input !== 'object') return { error: '콘텐츠 형식을 확인해 주세요.' };
  const source = input as Record<string, unknown>;
  const value: CmsPageUpdate = {};

  if (!partial || source.siteId !== undefined) {
    value.siteId = normalizeKey(source.siteId);
    if (!CMS_SITE_IDS.includes(value.siteId)) return { error: '관리 대상 EKODI 사이트가 아닙니다.' };
  }
  if (!partial || source.slug !== undefined) {
    value.slug = normalizeKey(source.slug);
    if (!SLUG_PATTERN.test(value.slug) || value.slug.length > 80) return { error: '슬러그는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.' };
  }
  if (!partial || source.title !== undefined) {
    value.title = normalizeText(source.title);
    if (!value.title || value.title.length > 120) return { error: '제목은 1~120자로 입력해 주세요.' };
  }
  if (!partial || source.summary !== undefined) {
    value.summary = normalizeText(source.summary);
    if (value.summary.length > 300) return { error: '요약은 300자 이하여야 합니다.' };
  }
  if (!partial || source.content !== undefined) {
    value.content = String(source.content || '');
    if (value.content.length > 100000) return { error: '본문은 100,000자 이하여야 합니다.' };
  }
  if (!partial || source.classification !== undefined) {
    const classification = normalizeKey(source.classification || 'internal');
    if (!CMS_DATA_CLASSIFICATIONS.includes(classification as CmsDataClassification)) return { error: '콘텐츠 공개 등급을 확인해 주세요.' };
    value.classification = classification as CmsDataClassification;
  }
  if (source.version !== undefined) {
    value.version = Math.trunc(Number(source.version));
    if (!Number.isInteger(value.version) || value.version < 1) return { error: '콘텐츠 버전을 확인해 주세요.' };
  }

  return { value: value as CmsPageInput | CmsPageUpdate };
}

export function publicPage(row: CmsPageRow) {
  return {
    siteId: row.site_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary || '',
    content: row.published_content || '',
    publishedAt: row.published_at || null
  };
}
