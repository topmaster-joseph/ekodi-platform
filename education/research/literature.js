// Public bibliographic metadata only. No AI, manuscript uploads or private research data.
const MAX_QUERY_LENGTH = 160;
const MAX_RESPONSE_LENGTH = 250_000;
const DOI = /^10\.\d{4,9}\/[^\s<>"'`]+$/i;
const problem = (status, code) => Object.assign(new Error(code), { status });
const plain = (value, max = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeResearchQuery(value) {
  if (typeof value !== 'string') throw problem(400, 'literature_query_required');
  const query = value.trim().normalize('NFKC');
  if (query.length < 3 || query.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(query)) {
    throw problem(400, 'literature_query_invalid');
  }
  const candidate = query.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').trim();
  if (/^10\./i.test(candidate)) {
    if (!DOI.test(candidate)) throw problem(400, 'literature_doi_invalid');
    return { query: candidate, doi: candidate };
  }
  if (/^(?:https?:\/\/|doi:)/i.test(query)) throw problem(400, 'literature_query_invalid');
  return { query, doi: null };
}

export function normalizeCrossrefRecord(item) {
  const doi = plain(item?.DOI, 220);
  if (!DOI.test(doi)) return null;
  const first = value => Array.isArray(value) ? value[0] : value;
  const authors = Array.isArray(item.author) ? item.author.slice(0, 6).map(author =>
    plain([author?.given, author?.family].filter(Boolean).join(' '), 100)
  ).filter(Boolean) : [];
  const rawYear = Number(first(item.published?.['date-parts'])?.[0] ?? first(item.issued?.['date-parts'])?.[0]);
  const year = Number.isInteger(rawYear) && rawYear >= 1500 && rawYear <= 2100 ? rawYear : null;
  const doiUrl = 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
  return {
    doi,
    doiUrl,
    title: plain(first(item.title), 300) || '제목 정보 없음',
    authors,
    year,
    journal: plain(first(item['container-title']), 180),
    type: plain(item.type, 60),
    publisher: plain(item.publisher, 120)
  };
}

export async function lookupCrossref(raw, fetcher = fetch) {
  const { query, doi } = normalizeResearchQuery(raw);
  const endpoint = new URL('https://api.crossref.org/works' + (doi ? '/' + doi.split('/').map(encodeURIComponent).join('/') : ''));
  if (!doi) {
    endpoint.searchParams.set('query.bibliographic', query);
    endpoint.searchParams.set('rows', '8');
    endpoint.searchParams.set('select', 'DOI,title,author,published,issued,container-title,type,publisher');
  }
  let response;
  try {
    response = await fetcher(endpoint.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(7000)
    });
  } catch {
    throw problem(503, 'literature_provider_unavailable');
  }
  if (doi && response.status === 404) {
    return { source: 'Crossref', query, mode: 'doi', records: [], metadataFound: false };
  }
  if (response.status === 429) throw problem(503, 'literature_provider_rate_limited');
  if (!response.ok) throw problem(502, 'literature_provider_error');
  let payload;
  try {
    const body = await response.text();
    if (body.length > MAX_RESPONSE_LENGTH) throw new Error('oversized');
    payload = JSON.parse(body);
  } catch {
    throw problem(502, 'literature_metadata_invalid');
  }
  const rawItems = doi ? [payload?.message] : payload?.message?.items;
  if (!Array.isArray(rawItems)) throw problem(502, 'literature_metadata_invalid');
  const records = rawItems.map(normalizeCrossrefRecord).filter(Boolean);
  return { source: 'Crossref', query, mode: doi ? 'doi' : 'search', records, metadataFound: records.length > 0 };
}
