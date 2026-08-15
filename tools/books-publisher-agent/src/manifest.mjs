import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_TEXT = ['title', 'author', 'publisher', 'language', 'publicationDate', 'currency'];

function requiredText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Missing required book field: ${field}`);
  return text;
}

function resolveFile(baseDir, value, field) {
  const text = requiredText(value, field);
  const resolved = path.resolve(baseDir, text);
  if (!fs.existsSync(resolved)) throw new Error(`${field} file not found: ${resolved}`);
  return resolved;
}

export function normalizeManifest(raw, manifestPath = process.cwd(), { verifyFiles = true } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Book manifest must be a JSON object.');
  for (const field of REQUIRED_TEXT) requiredText(raw[field], field);

  const baseDir = path.dirname(path.resolve(manifestPath));
  const idMode = String(raw.bookId?.mode || 'ggkey').toLowerCase();
  if (!['ggkey', 'isbn'].includes(idMode)) throw new Error('bookId.mode must be "ggkey" or "isbn".');
  const isbn = String(raw.bookId?.isbn || '').replace(/[-\s]/g, '');
  if (idMode === 'isbn' && !/^\d{10}(\d{3})?$/.test(isbn)) throw new Error('A 10- or 13-digit ISBN is required when bookId.mode is "isbn".');

  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('price must be a positive number.');

  const publicationDate = requiredText(raw.publicationDate, 'publicationDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate)) throw new Error('publicationDate must use YYYY-MM-DD.');

  const normalized = {
    title: requiredText(raw.title, 'title'),
    subtitle: String(raw.subtitle || '').trim(),
    description: String(raw.description || '').trim(),
    author: requiredText(raw.author, 'author'),
    publisher: requiredText(raw.publisher, 'publisher'),
    language: requiredText(raw.language, 'language'),
    publicationDate,
    currency: requiredText(raw.currency, 'currency').toUpperCase(),
    price,
    territory: String(raw.territory || 'WORLD').trim().toUpperCase(),
    bookId: { mode: idMode, isbn },
    epubPath: verifyFiles ? resolveFile(baseDir, raw.epubPath, 'epubPath') : path.resolve(baseDir, requiredText(raw.epubPath, 'epubPath')),
    coverPath: verifyFiles ? resolveFile(baseDir, raw.coverPath, 'coverPath') : path.resolve(baseDir, requiredText(raw.coverPath, 'coverPath')),
  };

  if (!/\.epub$/i.test(normalized.epubPath)) throw new Error('epubPath must point to an .epub file.');
  if (!/\.(jpe?g|png|tiff?|pdf)$/i.test(normalized.coverPath)) throw new Error('coverPath must point to a supported cover file.');
  return normalized;
}

export function loadManifest(manifestPath, options = {}) {
  const resolved = path.resolve(manifestPath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return normalizeManifest(raw, resolved, options);
}
