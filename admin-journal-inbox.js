/* JOURNAL-EDITOR-ALERTS-20261113 — 최고관리자 화면 오른쪽 위 '저널 새 소식 n' (조용한 표시: 소리·푸시 없음). */
(() => {
'use strict';
if (window.__ekodiJournalInbox) return;
window.__ekodiJournalInbox = true;
const TOKEN_KEY = 'ekodi-auth-token';
const KIND = { letter: '독자 편지', submission: '원고 투고', essay: '에코디언 에세이' };
const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let pill = null, panel = null, data = null;

async function api(method = 'GET', body = null) {
  const t = token(); if (!t) return null;
  const r = await fetch('/api/control/journal-inbox', { method, cache: 'no-store', credentials: 'same-origin',
    headers: { authorization: `Bearer ${t}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.ok ? r.json() : null;
}
function ensurePill() {
  if (pill) return pill;
  pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'ekodi-journal-inbox-pill';
  pill.setAttribute('aria-haspopup', 'dialog');
  pill.style.cssText = 'position:fixed;top:12px;right:16px;z-index:9000;min-height:36px;padding:6px 14px;border:1px solid #7a1f1f;border-radius:999px;background:#fff;color:#7a1f1f;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.08);cursor:pointer';
  pill.addEventListener('click', toggle);
  document.body.appendChild(pill);
  return pill;
}
function render() {
  const n = Number(data?.newCount || 0);
  if (!n) { if (pill) pill.hidden = true; return; }
  ensurePill();
  pill.hidden = false;
  pill.textContent = `저널 새 소식 ${n}`;
  pill.setAttribute('aria-label', `에코디저널 새 소식 ${n}건 보기`);
}
function toggle() {
  if (panel) { panel.remove(); panel = null; return; }
  panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '에코디저널 새 소식');
  panel.style.cssText = 'position:fixed;top:56px;right:16px;z-index:9001;width:min(420px,calc(100vw - 32px));max-height:70vh;overflow:auto;padding:16px;background:#fff;border:1px solid #d9d4c7;border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.14);font:14px/1.6 system-ui,sans-serif;color:#121212';
  const items = (data?.items || []).map((i) => `<li style="padding:10px 0;border-bottom:1px solid #eee;${i.seen_at ? 'opacity:.6' : ''}">
    <strong style="color:#7a1f1f;font-size:12px">${esc(KIND[i.kind] || i.kind)}</strong>
    <div>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>` : esc(i.title)}</div>
    <div style="font-size:12px;color:#5d5850">${esc(i.sender_name || '')}${i.detail ? ' · ' + esc(i.detail) : ''} · ${esc(new Date(i.received_at).toLocaleString('ko-KR'))}</div></li>`).join('');
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <strong>에코디저널 새 소식</strong>
      <button type="button" data-seen style="min-height:36px;padding:4px 12px;border:1px solid #121212;background:#fff;border-radius:8px;cursor:pointer">모두 확인</button></div>
    <p style="margin:6px 0 0;font-size:12px;color:#5d5850">독자 편지·투고는 매일 저녁 6시 요약 메일로도 받습니다. 에코디언 에세이는 투고 메일 24시간 뒤 게재됩니다.</p>
    <ul style="list-style:none;margin:8px 0 0;padding:0">${items || '<li>새 소식이 없습니다.</li>'}</ul>`;
  panel.querySelector('[data-seen]').addEventListener('click', async () => {
    await api('POST', { action: 'seen' }).catch(() => null);
    await refresh();
    if (panel) { panel.remove(); panel = null; }
  });
  document.body.appendChild(panel);
}
async function refresh() {
  try { data = await api(); } catch { data = null; }
  render();
}
refresh();
setInterval(refresh, 10 * 60_000);   // 10분에 한 번 조용히 갱신
})();
