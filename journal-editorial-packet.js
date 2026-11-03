const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const MEDIA = /^\/journal\/media\/(?:[a-z0-9][a-z0-9_-]*\/){0,3}[a-z0-9][a-z0-9_-]*\.(?:jpe?g|png|webp|avif)$/;
function plain(value, max) {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
}
function validText(value, min, max) {
  const text = plain(value, max);
  if (text.length < min || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) throw new Error('invalid_editorial_text');
  return text;
}
export function journalBodyToText(blocks = []) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(block => {
    if (block?.type === 'heading') return '## ' + String(block.text || '');
    if (block?.type === 'quote') return '> ' + String(block.text || '');
    if (block?.type === 'list') return (block.items || []).map(item => '- ' + item).join('\n');
    if (block?.type === 'photo') return '[사진: 저작권과 대체텍스트 별도 검수 필요]';
    return String(block?.text || '');
  }).join('\n\n');
}
export function journalTextToBody(raw) {
  const text = validText(raw, 10, 16000);
  const blocks = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('## ')) blocks.push({ type: 'heading', text: validText(trimmed.slice(3), 1, 200) });
    else if (trimmed.startsWith('> ')) blocks.push({ type: 'quote', text: validText(trimmed.slice(2), 1, 2000) });
    else if (trimmed.split('\n').every(line => line.startsWith('- '))) blocks.push({ type: 'list', items: trimmed.split('\n').map(line => validText(line.slice(2), 1, 800)) });
    else blocks.push({ type: 'p', text: validText(trimmed, 1, 4000) });
  }
  if (!blocks.length || blocks.length > 100) throw new Error('invalid_editorial_body');
  return blocks;
}
export function createJournalReviewPacket(current, input, now = new Date().toISOString()) {
  if (!input || typeof input !== 'object') throw new Error('invalid_editorial_input');
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!SLUG.test(slug) || (current?.slug && current.slug !== slug)) throw new Error('invalid_editorial_slug');
  const title = validText(input.title, 3, 160);
  const excerpt = validText(input.excerpt, 5, 1000);
  const body = journalTextToBody(input.body);
  const mediaSource = plain(input.photoSrc, 240);
  let coverPhoto = null;
  if (mediaSource) {
    if (!MEDIA.test(mediaSource)) throw new Error('invalid_editorial_photo_path');
    coverPhoto = {
      src: mediaSource,
      alt: validText(input.photoAlt, 3, 200),
      caption: plain(input.photoCaption, 500),
      credit: plain(input.photoCredit, 150),
      rightsStatus: 'pending',
    };
  }
  return {
    schema: 'ekodi-journal-editorial-review-v1',
    sourceRevision: current?.updatedAt || null,
    sourceSlug: current?.slug || null,
    createdAt: now,
    state: 'review_required',
    publishApproved: false,
    visibility: 'private',
    article: {
      slug, title, excerpt, body, coverPhoto,
      category: String(current?.category || 'ekodi'),
      values: Array.isArray(current?.values) ? current.values : [],
    },
  };
}
