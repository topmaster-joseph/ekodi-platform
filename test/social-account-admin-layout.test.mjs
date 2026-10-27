import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const script = read('social-account-admin.js');
const css = read('social-account-admin.css');

test('social inventory client module compiles and retains a read-only secured API flow', () => {
  assert.doesNotThrow(() => new Script(script));
  assert.match(script, /async function authenticatedSuperAdmin\(\)/);
  assert.match(script, /session\.role==='super_admin'/);
  assert.match(script, /scope=all/);
  assert.match(script, /data-social-refresh/);
  assert.doesNotMatch(script, /method:\s*['"]POST['"]/);
  assert.doesNotMatch(script, /localStorage\.setItem/);
});

test('social registry is a full-width dashboard rather than the inherited single-column list', () => {
  assert.match(script, /panel\.dataset\.adminListLayout='dashboard'/);
  assert.match(css, /content\s*>\s*#ekodiSocialAccountRegistry/);
  assert.match(css, /max-width:none!important/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  for (const size of [1280, 990, 760, 460]) {
    assert.ok(css.includes('max-width:' + size + 'px'), 'responsive breakpoint ' + size + ' missing');
  }
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('search, filter and empty state are connected to actual controls and results', () => {
  for (const marker of ['data-social-search','data-social-filter','data-social-result-count','data-social-empty','data-social-provider-card']) {
    assert.ok(script.includes(marker), marker + ' missing');
  }
  assert.match(script, /addEventListener\('input',\(\)=>filterProviders\(panel\)\)/);
  assert.match(script, /addEventListener\('change',\(\)=>filterProviders\(panel\)\)/);
  assert.match(script, /renderRows\(panel\.querySelector\('\[data-social-existing\]'\),legacy,'existing'\)/);
  assert.match(script, /filterProviders\(panel\);\s*\}/);
});

test('filter function keeps status truth separate from registered and legacy counts', () => {
  const begin = script.indexOf('  function filterProviders(panel){');
  const end = script.indexOf('  function render(panel,data){', begin);
  assert.ok(begin >= 0 && end > begin);
  const snippet = script.slice(begin, end);
  const getFilter = new Function(snippet + '\nreturn filterProviders;');
  const filterProviders = getFilter();
  const cards = [
    {dataset:{searchText:'youtube',registered:'0',existing:'1'},hidden:false},
    {dataset:{searchText:'instagram',registered:'1',existing:'0'},hidden:false},
    {dataset:{searchText:'naver',registered:'0',existing:'0'},hidden:false}
  ];
  const search = {value:''};
  const select = {value:'all'};
  const count = {textContent:''};
  const empty = {hidden:true};
  const panel = {
    querySelector(selector) {
      return {'[data-social-search]':search,'[data-social-filter]':select,
        '[data-social-result-count]':count,'[data-social-empty]':empty}[selector];
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-social-provider-card]');
      return cards;
    }
  };
  filterProviders(panel);
  assert.equal(count.textContent, '표시 3 / 전체 3');
  select.value = 'existing';
  filterProviders(panel);
  assert.deepEqual(cards.map(x => x.hidden), [false,true,true]);
  select.value = 'registered';
  filterProviders(panel);
  assert.deepEqual(cards.map(x => x.hidden), [true,false,true]);
  select.value = 'unregistered';
  filterProviders(panel);
  assert.deepEqual(cards.map(x => x.hidden), [true,true,false]);
  select.value = 'all';
  search.value = 'does-not-exist';
  filterProviders(panel);
  assert.equal(count.textContent, '표시 0 / 전체 3');
  assert.equal(empty.hidden, false);
});
