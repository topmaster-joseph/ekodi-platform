import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BOOKS } from '../bible/books.js';

const sourceRoot = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('usage: node scripts/vendor-krv-data.mjs <Korean-Bible-1961-KRV>');
const outputRoot = path.resolve('bible/data/krv');
const EXPECTED = { books:66, chapters:1189, verses:31102 };
const SOURCE_REPO = 'https://github.com/bluesaurel/Korean-Bible-1961-KRV';
const OFFICIAL_RIGHTS = 'https://bskorea.or.kr/bbs/board.php?bo_table=copyright_faq&wr_id=5';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

await fs.rm(outputRoot, { recursive:true, force:true });
await fs.mkdir(outputRoot, { recursive:true });
const files = [];
const search = [];
let chapterCount = 0;
let verseCount = 0;

for (const book of BOOKS) {
  const sourcePath = path.join(sourceRoot, 'data', `${book.source}.json`);
  const raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  if (raw.book !== book.source || !Array.isArray(raw.chapters)) throw new Error(`invalid source: ${book.id}`);
  chapterCount += raw.chapters.length;  for (const chapter of raw.chapters) {
    if (!Number.isInteger(chapter.chapter) || !Array.isArray(chapter.verses)) throw new Error(`invalid chapter: ${book.id}`);
    for (const verse of chapter.verses) {
      if (!Number.isInteger(verse.verse) || typeof verse.text !== 'string' || !verse.text.trim()) throw new Error(`invalid verse: ${book.id} ${chapter.chapter}:${verse.verse}`);
      verseCount += 1;
      search.push({ b:book.id, k:book.ko, c:chapter.chapter, v:verse.verse, t:verse.text });
    }
  }
  const payload = {
    provider:'KRV1961',
    bookId:book.id,
    bookNameKo:book.ko,
    bookNameEn:book.en,
    sourceTitle:'성경전서 개역한글판',
    integrity:'verbatim',
    chapters:raw.chapters,
  };
  const text = `${JSON.stringify(payload)}\n`;
  await fs.writeFile(path.join(outputRoot, `${book.id}.json`), text, 'utf8');
  files.push({ bookId:book.id, sha256:sha256(text), bytes:Buffer.byteLength(text) });
}

const counts = { books:BOOKS.length, chapters:chapterCount, verses:verseCount };
if (JSON.stringify(counts) !== JSON.stringify(EXPECTED)) throw new Error(`count mismatch ${JSON.stringify(counts)}`);
const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding:'utf8' }).trim();const manifest = {
  id:'KRV1961',
  title:'성경전서 개역한글판',
  language:'ko',
  mode:'embedded-verbatim',
  attribution:'대한성서공회 · 성경전서 개역한글판(1961)',
  rights:{ propertyRights:'expired', moralRights:['attribution','integrity'], officialNotice:OFFICIAL_RIGHTS },
  source:{ repository:SOURCE_REPO, commit:sourceCommit },
  counts,
  files,
};
await fs.writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(outputRoot, 'search-index.json'), `${JSON.stringify({provider:'KRV1961',counts,verses:search})}\n`, 'utf8');
await fs.writeFile(path.join(outputRoot, 'NOTICE.txt'), [
  '성경전서 개역한글판 (1961)',
  '표시: 대한성서공회 · 성경전서 개역한글판(1961)',
  '정책: 본문은 원문 그대로 제공하며 EKODI 또는 AI가 수정·교정·의역하지 않습니다.',
  `대한성서공회 저작권 안내: ${OFFICIAL_RIGHTS}`,
  `디지털 데이터 검증 출처: ${SOURCE_REPO}@${sourceCommit}`,
  '',
].join('\n'), 'utf8');
console.log(JSON.stringify({ ok:true, counts, sourceCommit, searchEntries:search.length }, null, 2));