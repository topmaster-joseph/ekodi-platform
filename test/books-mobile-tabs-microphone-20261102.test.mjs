import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withVoiceMicrophonePolicy} from '../books-worker.js';

const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
const home = read('books/index.html');
const homeTabs = read('books/home-tabs.js');
const library = read('books/library/index.html');
const libraryTabs = read('books/buy/library-tabs.js');
const libraryScript = read('books/buy/library.js');
const voice = read('books/buy/voice-studio.js');
const css = read('books/styles.css');
const buyCss = read('books/buy/buy.css');

test('microphone policy is deliberately narrow: library HTML only',()=>{
  const page=()=>new Response('<html lang="ko"></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
  const libraryResponse=withVoiceMicrophonePolicy(page(),'/library/');
  assert.match(libraryResponse.headers.get('permissions-policy'),/microphone=\(self\)/);
  assert.equal(libraryResponse.headers.get('cache-control'),'private, no-store');
  for (const path of ['/','/buy/','/admin/','/library/extra','/library/library.js','/api/commerce/library']) {
    const r=withVoiceMicrophonePolicy(page(),path);
    assert.equal(r.headers.get('permissions-policy'),null,path);
  }
  const other=withVoiceMicrophonePolicy(new Response('ok',{headers:{'content-type':'text/javascript'}}),'/library/');
  assert.equal(other.headers.get('permissions-policy'),null);
});

test('mobile voice microphone retries with user interaction and actionable permission diagnostics',()=>{
  assert.match(voice,/rec\.addEventListener\('click', async/);
  assert.match(voice,/navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(voice,/NotAllowedError/);
  assert.match(voice,/NotFoundError/);
  assert.match(voice,/NotReadableError/);
  assert.match(voice,/MediaRecorder\.isTypeSupported/);
  assert.match(voice,/URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(voice,/stream\.getTracks\(\)\.forEach\(t => t\.stop\(\)\)/);
  assert.match(voice,/최소 1분/);
  assert.match(voice,/voice-mic-help/);
  assert.match(voice,/window\.EkodiLibraryTabs\?\.showOperator\(\)/);
  assert.doesNotMatch(voice,/getUserMedia\(\{ audio: \{ echoCancellation: false,/);
});

test('storefront has responsive tabbed panels while preserving existing catalog and search index',()=>{
  assert.match(home,/<script src="\/home-tabs\.js" defer><\/script>/);
  assert.match(homeTabs,/aria-selected/);
  assert.match(homeTabs,/role', 'tablist'/);
  assert.match(homeTabs,/querySelector\('#catalog'\)/);
  assert.match(homeTabs,/querySelector\('#fields'\)/);
  assert.match(homeTabs,/querySelector\('#about'\)/);
  assert.match(homeTabs,/querySelector\('#publishing-service-callout'\)/);
  assert.match(homeTabs,/ArrowRight/);
  assert.match(homeTabs,/hashchange/);
  assert.match(css,/BOOKS-UX-TABS-20261102/);
  assert.match(css,/\.book-home-panel\[hidden\]\{display:none!important\}/);
  assert.match(css,/max-width:640px/);
});

test('reader panels separate operator, audiobook and purchase records without widening rights',()=>{
  assert.match(library,/<script src="\/buy\/library-tabs\.js" defer><\/script>/);
  assert.ok(library.indexOf('library-tabs.js')<library.indexOf('library.js'));
  assert.match(libraryTabs,/role',\s*'tablist'/);
  assert.match(libraryTabs,/aria-selected/);
  assert.match(libraryTabs,/showOperator\(\)/);
  assert.match(libraryTabs,/Number\.isFinite\(amount\)/);
  assert.match(libraryTabs,/new URL\(book\.receiptUrl\)/);
  assert.match(libraryTabs,/url\.protocol === 'https:'/);
  assert.match(libraryTabs,/audio-bonus/);
  assert.match(libraryScript,/window\.EkodiLibraryTabs\?\.render\(items,libraryAccount\)/);
  assert.match(libraryScript,/window\.EkodiLibraryTabs\?\.showOperator\(\)/);
  assert.doesNotMatch(libraryScript,/operatorNote'\)\.textContent =/);
  assert.match(buyCss,/BOOKS-LIBRARY-TABS-20261102/);
  assert.match(buyCss,/\.library-tab-panel\[hidden\]/);
});
