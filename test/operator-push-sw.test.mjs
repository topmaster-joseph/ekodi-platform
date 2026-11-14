import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function runPush(payload) {
  const src = await readFile(new URL('../notifications/sw.js', import.meta.url), 'utf8');
  const handlers = {}; const shown = [];
  const self = { location: { origin: 'https://ekodi.kr' }, addEventListener: (t, f) => { handlers[t] = f; },
    registration: { showNotification: async (title, opts) => { shown.push({ title, opts }); } } };
  new Function('self', 'clients', src)(self, {});
  for (const p of payload) {
    let done; handlers.push({ data: { json: () => p }, waitUntil: (pr) => { done = pr; } }); await done;
  }
  return shown;
}

test('operator pushes each get their own notification instead of silently replacing the last', async () => {
  const shown = await runPush([
    { title: '새 메일 1', body: 'a', targetPath: '/mail/?a=1', service: 'operator' },
    { title: '새 메일 2', body: 'b', targetPath: '/mail/?a=2', service: 'operator' },
  ]);
  assert.equal(shown.length, 2);
  assert.notEqual(shown[0].opts.tag, shown[1].opts.tag);
  assert.equal(shown[1].opts.data.targetPath, '/mail/?a=2');
});

test('news pushes keep one grouped notification but alert again', async () => {
  const shown = await runPush([{ title: '소식', targetPath: '/', service: 'news' }]);
  assert.equal(shown[0].opts.tag, 'ekodi-news');
  assert.equal(shown[0].opts.renotify, true);
});
