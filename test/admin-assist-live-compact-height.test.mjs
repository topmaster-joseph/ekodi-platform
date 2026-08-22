import test from 'node:test';
import assert from 'node:assert/strict';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchTextWithRetry(url, expected, attempts = 18) {
  let lastStatus = 0;
  let lastText = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const bust = `${url}${url.includes('?') ? '&' : '?'}verify=${Date.now()}-${attempt}`;
    try {
      const response = await fetch(bust, { redirect: 'follow', cache: 'no-store' });
      lastStatus = response.status;
      lastText = await response.text();
      if (response.ok && expected.every(marker => lastText.includes(marker))) {
        return { status: response.status, text: lastText };
      }
    } catch {}
    if (attempt < attempts) await sleep(4000);
  }
  assert.fail(`Live Admin Assist compact CSS did not propagate. Last status=${lastStatus}; markers=${expected.join(', ')}; body=${lastText.slice(0, 400)}`);
}

test('live Admin serves compact EKODI Assist panel height', async () => {
  const root = await fetch('https://admin.ekodi.kr/?verify=assist-compact-height', { cache: 'no-store' });
  assert.equal(root.status, 200);

  const expected = [
    'height:min(500px,60vh)',
    'height:min(58vh,540px)',
    'max-height:calc(100vh - 132px)',
  ];
  const { text } = await fetchTextWithRetry('https://admin.ekodi.kr/ai-ops-admin.css?assist=compact-height', expected);
  assert.doesNotMatch(text, /height:min\(680px,calc\(100vh - 92px\)\)/);
  assert.doesNotMatch(text, /height:min\(78vh,720px\)/);
});
