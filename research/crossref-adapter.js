import { normalizeDoi } from './literature-core.js';

/** Resolve a DOI against Crossref only when explicitly requested.
 * A DOI string alone is never evidence that a publication exists.
 * Inject fetch for tests and local EKODI provider routing.
 */
export async function verifyCrossrefDoi(doiInput, { fetcher = fetch, signal } = {}) {
  const doi = normalizeDoi(doiInput);
  if (!doi) return { status: 'invalid_doi', doi: null };
  const url = 'https://api.crossref.org/works/' + encodeURIComponent(doi);
  try {
    const response = await fetcher(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
    if (response.status === 404) return { status: 'not_found', doi };
    if (!response.ok) return { status: 'provider_unavailable', doi };
    const data = await response.json();
    const work = data?.message;
    if (!work || normalizeDoi(work.DOI) !== doi) return { status: 'provider_mismatch', doi };
    const title = Array.isArray(work.title) ? work.title.find(x => typeof x === 'string' && x.trim()) : null;
    const year = work.published?.['date-parts']?.[0]?.[0] ?? work.issued?.['date-parts']?.[0]?.[0];
    return {
      status: 'verified_metadata', doi, source: 'crossref',
      title: title || null, year: Number.isInteger(year) ? year : null,
      publisher: typeof work.publisher === 'string' ? work.publisher : null,
    };
  } catch {
    return { status: 'provider_unavailable', doi };
  }
}
