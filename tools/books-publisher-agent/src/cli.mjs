import os from 'node:os';
import path from 'node:path';
import { loadManifest } from './manifest.mjs';
import { createAudit } from './audit.mjs';

function args(argv) {
  const result = { dryRun: false, publish: false, manifest: '', profile: '', approveTitle: '', platform: 'google' };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--dry-run') result.dryRun = true;
    else if (value === '--publish') result.publish = true;
    else if (value === '--manifest') result.manifest = argv[++i] || '';
    else if (value === '--profile') result.profile = argv[++i] || '';
    else if (value === '--platform') result.platform = String(argv[++i] || '').toLowerCase();
    else if (value === '--approve-title') result.approveTitle = argv[++i] || '';
    else if (value === '--help' || value === '-h') result.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  return result;
}

function help() {
  console.log(`EKODI BOOKS Publisher Agent\n\nUsage:\n  npm start -- --platform google --manifest ./examples/ekodian.json\n  npm start -- --platform kdp --manifest ./examples/ekodian-kdp.json\n  npm start -- --platform upaper --manifest ./examples/ekodian.json\n\nOptions:\n  --platform <google|kdp|upaper> Publishing platform\n  --manifest <path>              Book manifest JSON\n  --profile <path>               Separate Chrome automation profile\n  --dry-run                      Validate only. No browser launch\n  --publish                      Allow final Google Publish click\n  --approve-title <title>        Required with Google --publish; exact title match\n`);
}

const options = args(process.argv.slice(2));
if (options.help) {
  help();
  process.exit(0);
}
if (!options.manifest) throw new Error('--manifest is required.');
if (!['google', 'kdp', 'upaper'].includes(options.platform)) throw new Error('--platform must be google, kdp, or upaper.');
if (options.platform !== 'google' && options.publish) throw new Error('--publish is currently enabled only for Google. KDP/UPaper stop before legal/final submission gates.');
if (options.publish && !options.approveTitle) throw new Error('--publish requires --approve-title with the exact book title.');

const book = loadManifest(options.manifest);
const profileDir = path.resolve(options.profile || path.join(os.homedir(), '.ekodi', `books-${options.platform}-profile`));
const auditPath = path.join(os.homedir(), '.ekodi', 'books-publisher-audit.jsonl');
const audit = createAudit(auditPath);

audit('agent.start', { platform: options.platform, title: book.title, dryRun: options.dryRun, publishRequested: options.publish });
console.log(`\nEKODI BOOKS · Publisher Agent · ${options.platform.toUpperCase()}`);
console.log(`도서: ${book.title}`);
console.log(`저자: ${book.author}`);
console.log(`가격: ${book.price.toLocaleString()} ${book.currency}`);
console.log(`EPUB: ${book.epubPath}`);
console.log(`표지: ${book.coverPath}`);

if (options.dryRun) {
  audit('agent.dry_run', { platform: options.platform, status: 'ok' });
  console.log('\nDry-run 검증 완료. 외부 출판 사이트에는 아무 것도 전송하지 않았습니다.');
  process.exit(0);
}

const { chromium } = await import('playwright');
let result;
if (options.platform === 'google') {
  const { publishGooglePlayBook } = await import('./google-play-books.mjs');
  result = await publishGooglePlayBook({ chromium, book, profileDir, audit, publishApproval: options.publish ? options.approveTitle : '' });
} else if (options.platform === 'kdp') {
  const { publishAmazonKdpBook } = await import('./amazon-kdp.mjs');
  result = await publishAmazonKdpBook({ chromium, book, profileDir, audit });
} else {
  const { publishUpaperBook } = await import('./upaper.mjs');
  result = await publishUpaperBook({ chromium, book, profileDir, audit });
}

audit('agent.complete', { platform: options.platform, ...result });
console.log(`\n완료 상태: ${result.status}`);
