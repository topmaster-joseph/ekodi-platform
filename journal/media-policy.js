// Approved, first-party visual media only. Drafts and external URLs are never public assets.
const SAFE_PATH = /^\/journal\/media\/(?:[a-z0-9][a-z0-9_-]*\/){0,3}[a-z0-9][a-z0-9_-]*\.(?:jpe?g|png|webp|avif)$/;
const RIGHTS = 'verified';

function shortText(value, max) {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
}

export function approvedJournalPhoto(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.rightsStatus !== RIGHTS) return null;
  const src = shortText(input.src, 220);
  const alt = shortText(input.alt, 200);
  if (!SAFE_PATH.test(src) || !alt) return null;
  return Object.freeze({
    src,
    alt,
    caption: shortText(input.caption, 500),
    credit: shortText(input.credit, 150),
  });
}
