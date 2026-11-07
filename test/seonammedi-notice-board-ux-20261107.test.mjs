import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../services/independent-board/worker.js';

const html = await (await worker.fetch(new Request('https://xn--3e0b8b58jw4co4mnpll3k.kr/board/notices'), {})).text();

test('admins get an immediate 중요공지 checkbox per notice that saves without opening the editor', () => {
  assert.match(html, /class="pin-quick"><input type="checkbox" data-pin=/);
  assert.match(html, /list\.onchange=async e=>\{const pin=e\.target\.closest\("\[data-pin\]"\)/);
  assert.match(html, /body:JSON\.stringify\(\{title:x\.title\|\|"",body:x\.body\|\|"",pinned:pin\.checked,images:\[\]\}\)/);
});

test('수정 opens the form inside the selected notice and returns it home afterwards', () => {
  assert.match(html, /row\.querySelector\("\.admin-actions"\)\.before\(form\)/);
  assert.match(html, /function formBack\(\)/);
  assert.match(html, /\.board-panel\.inline-edit\{/);
});

test('opening one notice collapses the others to title-only', () => {
  assert.match(html, /list\.addEventListener\("toggle",[\s\S]*?querySelectorAll\("details\[open\]"\)[\s\S]*?o\.open=false/);
});
