import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BOOKS } from '../bible/books.js';
import { bibleCorePolicy, bibleProviderCatalog, parseScriptureReference } from '../bible-core.js';

const root = process.cwd();
const dataRoot = path.join(root, 'bible', 'data', 'krv');
const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, 'manifest.json'), 'utf8'));
const expected = { books:66, chapters:1189, verses:31102 };
const fail = message => { throw new Error(`[bible-core] ${message}`); };
const equal = (actual, wanted, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

if (BOOKS.length !== 66) fail(`book registry count ${BOOKS.length}`);
equal(manifest.counts, expected, 'manifest counts');
if (fs.existsSync(path.join(root, 'bible', 'data', 'nkrv'))) fail('protected NKRV text must not be vendored');

let chapters = 0;
let verses = 0;
for (const book of BOOKS) {
  const file = path.join(dataRoot, `${book.id}.json`);
  if (!fs.existsSync(file)) fail(`missing ${book.id}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const digest = manifest.files.find(item => item.bookId === book.id);
  const canonicalRaw = raw.replace(/\r\n/g, '\n');
  if (!digest || sha256(canonicalRaw) !== digest.sha256) fail(`integrity hash mismatch ${book.id}`);
  const data = JSON.parse(raw);
  if (data.provider !== 'KRV1961' || data.integrity !== 'verbatim') fail(`provider contract ${book.id}`);
  chapters += data.chapters.length;
  for (const chapter of data.chapters) {
    for (const verse of chapter.verses) {
      if (!Number.isInteger(verse.verse) || typeof verse.text !== 'string' || !verse.text.trim()) fail(`invalid verse ${book.id} ${chapter.chapter}`);
      verses += 1;
    }
  }
}
equal({ books:BOOKS.length, chapters, verses }, expected, 'computed counts');

const providers = bibleProviderCatalog();
const krv = providers.find(item => item.id === 'KRV1961');
const nkrv = providers.find(item => item.id === 'NKRV');
if (krv?.mode !== 'embedded-verbatim') fail('KRV1961 must be embedded-verbatim');
if (nkrv?.mode !== 'official-link-only' || nkrv?.rights?.storageAllowed !== false) fail('NKRV must be official-link-only and non-stored');
const policy = bibleCorePolicy();
if (policy.defaultProvider !== 'KRV1961' || policy.aiMayAlterScripture !== false) fail('Bible Core policy invariant failed');
const parsed = parseScriptureReference('신명기 17:14-20');
if (parsed?.bookId !== 'DEU' || parsed.chapter !== 17 || parsed.verseStart !== 14 || parsed.verseEnd !== 20) fail('Korean reference parser failed');
const genesis = JSON.parse(fs.readFileSync(path.join(dataRoot, 'GEN.json'), 'utf8'));
const firstVerse = genesis.chapters[0]?.verses[0];
if (firstVerse?.verse !== 1 || firstVerse?.text !== '태초에 하나님이 천지를 창조하시니라') fail('Genesis 1:1 canonical text mismatch');

const worker = fs.readFileSync(path.join(root, 'bible-worker.js'), 'utf8');
for (const marker of ['/api/bible/providers', '/api/bible/passage', '/api/bible/search', 'scripture: scripture?.ok', '제공된 본문은 KRV1961 원문이며 수정·교정·의역' ]) {
  if (!worker.includes(marker)) fail(`worker marker missing: ${marker}`);
}
const coreSource = fs.readFileSync(path.join(root, 'bible-core.js'), 'utf8');
if (!coreSource.includes('aiMayAlterScripture:false')) fail('AI Scripture mutation lock missing');
const notice = fs.readFileSync(path.join(dataRoot, 'NOTICE.txt'), 'utf8');
if (!notice.includes('대한성서공회') || !notice.includes('원문 그대로')) fail('attribution/integrity notice missing');

console.log(JSON.stringify({
  ok:true,
  contract:'EKODI Bible Core v1.0.0',
  counts:expected,
  providers:providers.map(({id,mode}) => ({id,mode})),
  sourceCommit:manifest.source?.commit,
}, null, 2));
