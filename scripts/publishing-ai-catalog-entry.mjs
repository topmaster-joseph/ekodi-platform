#!/usr/bin/env node
// PUBLISHING-AI-CATALOG-001 — 감수 완료된 AI 협업 원고를 에코디서점 목록(books/books.json)에 '판매 준비 중'으로 올린다.
// - 출판 관리자의 '서점 출판으로 넘기기'가 남긴 인계 기록(handoff outbox payload)을 입력으로 받는다.
// - 기존 책 항목은 절대 바꾸지 않는다(추가만). 같은 원고(workId)는 한 번만 올라간다.
// - 가격·판매 개시·직접 판매는 여기서 정하지 않는다(대표 승인 사항). 가격은 '결정 전'으로 둔다.
// 사용: node scripts/publishing-ai-catalog-entry.mjs --book-id <uuid> --digest <sha256> --payload payload.json [--toc "1장|2장"] [--write]
import { readFile, writeFile } from 'node:fs/promises';
import { GENRES } from '../publishing-ai-factory.js';

const pad = (n, w) => String(n).padStart(w, '0');
const clean = (v, max = 400) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function aiCatalogEntry(catalog, { bookId, digest, payload = {}, toc = [] } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(String(bookId || ''))) throw new Error('bookId must be the AI book uuid');
  if (!/^[a-f0-9]{64}$/.test(String(digest || ''))) throw new Error('digest must be the EPUB sha256');
  if (payload.kind !== 'ai_collab_ebook') throw new Error('payload is not an AI collaboration handoff');
  if (payload.saleActivation !== false) throw new Error('handoff must not activate sales');
  const title = clean(payload.title, 160); if (!title) throw new Error('title required');
  const books = Array.isArray(catalog?.books) ? catalog.books : [];
  const workId = 'ai:' + bookId;
  const existing = books.find(b => b.workId === workId);
  if (existing) return { entry: existing, added: false };
  const maxNo = books.reduce((m, b) => Math.max(m, Number(/BOOK-EKODI-(\d+)/.exec(b.id || '')?.[1] || 0)), 0);
  const id = `BOOK-EKODI-${pad(maxNo + 1, 6)}`;
  const seriesNumber = books.filter(b => b.series === 'EKODI AI 협업').length + 1;
  const author = clean(payload.author || '정찬균', 60);
  const subtitle = clean(payload.subtitle, 160);
  const disclosure = clean(payload.disclosure || 'AI 협업 초안 · 저자 감수', 80);
  const entry = {
    id, workId, catalogNo: `EB-AIC-${pad(seriesNumber, 3)}`, series: 'EKODI AI 협업', seriesNumber, publicationType: 'MONOGRAPH',
    status: '감수 완료 · 판매 준비 중', coverTitle: title,
    detailUrl: `/book/?id=${id}`, storeUrl: `/book/?id=${id}`, publishingUrl: '/publishing/admin/ai', adminUrl: `https://ekodi.kr/admin/books#${id}`,
    title, subtitle, author, discipline: GENRES.find(g => g.id === payload.genre)?.label || '', language: 'ko', languageLabel: '한국어', format: ['Digital Edition'], edition: '',
    listPrice: { currency: 'KRW', amount: null, label: '가격 결정 전' },
    abstract: clean([payload.pitch, `${disclosure} — ${author}이 감수한 EKODI AI 협업 도서입니다.`].filter(Boolean).join(' '), 600),
    citation: `${author}. 『${title}${subtitle ? ': ' + subtitle : ''}』. 에코디서점.`,
    identifiers: { googleBooks: '', isbnEbook: '', amazonAsin: '' },
    workflow: { manuscript: 'author_approved', editing: 'ai_assisted_author_reviewed', epub: 'built_private', cover: 'needs_verification',
      metadata: 'draft', distribution: 'not_started', storefront: 'catalog_listed' },
    distribution: { google: '준비 전', upaper: '준비 전', amazon: '준비 전' }, links: { amazon: '', google: '', upaper: '', korea: '' },
    audiobook: { freeWithEbook: true, status: 'production_pending', sourceEdition: '', rightsApproved: false },
    aiCollaboration: { disclosure, sourceBookId: bookId, epubSha256: digest, keywords: (payload.keywords || []).slice(0, 8).map(k => clean(k, 30)) },
    toc: toc.map(t => clean(t, 120)).filter(Boolean), tocSource: toc.length ? 'ai_factory_plan' : '',
  };
  return { entry, added: true };
}

async function main(argv) {
  const arg = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const path = new URL('../books/books.json', import.meta.url);
  const catalog = JSON.parse(await readFile(path, 'utf8'));
  const payload = JSON.parse(await readFile(arg('payload'), 'utf8'));
  const toc = (arg('toc') || '').split('|').map(s => s.trim()).filter(Boolean);
  const { entry, added } = aiCatalogEntry(catalog, { bookId: arg('book-id'), digest: arg('digest'), payload, toc });
  if (added && argv.includes('--write')) { catalog.books.push(entry); await writeFile(path, JSON.stringify(catalog, null, 2) + '\n'); }
  console.log(JSON.stringify({ added, written: added && argv.includes('--write'), id: entry.id, title: entry.title }));
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
