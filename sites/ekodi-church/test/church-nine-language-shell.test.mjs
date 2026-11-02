import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const core=await readFile(new URL('../church-i18n.js',import.meta.url),'utf8');
const extended=await readFile(new URL('../church-i18n-extended.js',import.meta.url),'utf8');
const shell=await readFile(new URL('../church-shell-i18n.js',import.meta.url),'utf8');
const canonical=[
  "['ko-KR','한국어']","['en','English']","['zh-CN','中文']","['ja','日本語']",
  "['my','မြန်မာ']","['kac','Jinghpaw']","['vi','Tiếng Việt']","['mn','Монгол']","['id','Bahasa']"
];

test('church exposes the canonical nine-language selector contract',()=>{
  for(const pair of canonical){
    assert.ok(extended.includes(pair),`extended i18n missing language option ${pair}`);
    assert.ok(shell.includes(pair),`shell control missing language option ${pair}`);
  }
  assert.match(shell,/document\.querySelector\('\[data-ekodi-language-control\]'\)/);
  assert.match(shell,/document\.createElement\('select'\)/);
  assert.match(shell,/control\.dataset\.ekodiLanguageControl='v1'/);
  assert.match(shell,/nav\.insertBefore\(control,my\|\|null\)/);
  assert.match(shell,/select\.replaceChildren\(fragment\)/);
});

test('language selector preserves a visible, reload-safe locale change path',()=>{
  assert.match(shell,/new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(shell,/select\.addEventListener\('change'/);
  assert.match(shell,/url\.searchParams\.set\('lang',next\)/);
  assert.match(shell,/location\.assign\(url\.toString\(\)\)/);
  assert.match(extended,/window\.EKODIUserLanguage\?\.getLocale/);
  assert.match(extended,/new MutationObserver\(schedule\)/);
});

test('core and extended locale layers eliminate late residual Korean copy', () => {
  assert.match(core, /'마이페이지':\{en:'My Page'/);
  assert.match(core, /'협력소식':\{en:'Partner news'/);
  assert.match(core, /'함께 걷는 이들의 소식':\{en:'News from those walking with us'/);
  assert.match(core, /'공개된 협력 소식이 준비되면 이곳에 안내합니다\.'/);
  assert.match(core, /translate:\(source,targetLocale,vars\)=>translateForLocale/);
  assert.match(extended, /EKODIChurchI18n\?\.translate\?\.\(source,'en'\)/);
});
