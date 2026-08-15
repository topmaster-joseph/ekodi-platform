import os from 'node:os';
import path from 'node:path';
import { loadManifest } from './manifest.mjs';
import { createAudit } from './audit.mjs';

function args(argv) {
  const result = { dryRun: false, publish: false, manifest: '', profile: '', approveTitle: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--dry-run') result.dryRun = true;
    else if (value === '--publish') result.publish = true;
    else if (value === '--manifest') result.manifest = argv[++i] || '';
    else if (value === '--profile') result.profile = argv[++i] || '';
    else if (value === '--approve-title') result.approveTitle = argv[++i] || '';
    else if (value === '--help' || value === '-h') result.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  return result;
}

function help() {
  console.log(`EKODI BOOKS Google Publisher Agent\n\nUsage:\n  npm start -- --manifest ./books/ekodian.json\n  npm start -- --manifest ./books/ekodian.json --publish --approve-title "에코디언을 찾아서"\n\nOptions:\n  --manifest <path>       Book manifest JSON\n  --profile <path>        Separate Chrome automation profile\n  --dry-run               Validate only. No browser launch\n  --publish               Allow final Publish click\n  --approve-title <title> Required with --publish; must exactly match manifest title\n`);
}

const options = args(process.argv.slice(2));
if (options.help) {
  help();
  process.exit(0);
}
if (!options.manifest) throw new Error('--manifest is required.');
if (options.publish && !options.approveTitle) throw new Error('--publish requires --approve-title with the exact book title.');

const book = loadManifest(options.manifest);
const profileDir = path.resolve(options.profile || path.join(os.homedir(), '.ekodi', 'books-google-profile'));
const auditPath = path.join(os.homedir(), '.ekodi', 'books-publisher-audit.jsonl');
const audit = createAudit(auditPath);

audit('agent.start', { title: book.title, dryRun: options.dryRun, publishRequested: options.publish });
console.log(`\nEKODI BOOKS · Google Publisher Agent`);
console.log(`도서: ${book.title}`);
console.log(`저자: ${book.author}`);
console.log(`가격: ${book.price.toLocaleString()} ${book.currency}`);
console.log(`ID: ${book.bookId.mode === 'ggkey' ? 'Google GGKEY 생성' : book.bookId.isbn}`);
console.log(`EPUB: ${book.epubPath}`);
console.log(`표지: ${book.coverPath}`);

if (options.dryRun) {
  audit('agent.dry_run', { status: 'ok' });
  console.log('\nDry-run 검증 완료. Google에는 아무 것도 전송하지 않았습니다.');
  process.exit(0);
}

const { chromium } = await import('playwright');
const { publishGooglePlayBook } = await import('./google-play-books.mjs');
const result = await publishGooglePlayBook({
  chromium,
  book,
  profileDir,
  audit,
  publishApproval: options.publish ? options.approveTitle : '',
});
audit('agent.complete', result);
console.log(`\n완료 상태: ${result.status}`);
