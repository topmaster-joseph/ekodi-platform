// BOOKS-AUDIOBOOK-REVIEW-001 — 운영자 오디오북 검토·승인 화면 (권한은 서버가 검사)
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  const bookId = (new URLSearchParams(location.search).get('book') || '').toUpperCase();
  const base = `admin/audiobook-review/${encodeURIComponent(bookId)}`;
  let state = null; const heard = new Set(); const urls = [];
  const authed = async (path, init = {}) => { const s = await C.session(); return fetch(`${C.BASE}/api/commerce/${path}`, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' }); };
  const allHeard = () => state?.tracks?.length > 0 && state.tracks.every(t => heard.has(t.number));
  function refresh() {
    $('arApprove').disabled = !(allHeard() && [...document.querySelectorAll('.ar-check')].every(c => c.checked));
    $('arListenNote').textContent = allHeard() ? '모든 장을 재생해 확인했습니다.' : `승인하려면 모든 장을 한 번 이상 재생해 주세요. (${heard.size}/${state?.tracks?.length || 0})`;
    $('arListenNote').className = allHeard() ? 'ok' : 'warn';
  }
  async function upload(n, file) {
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { alert('장별 파일은 32MB 이하로 나누어 주세요.'); return; }
    if (state?.approval && !confirm('파일을 바꾸면 현재 승인이 해제되어 다시 검토해야 합니다. 계속할까요?')) return;
    const r = await authed(`${base}/${n}`, { method: 'PUT', headers: { 'content-type': 'audio/mpeg' }, body: file });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || '올리지 못했습니다.'); return; }
    load();
  }
  function render() {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    $('arRoot').hidden = false;
    $('arTitle').textContent = `오디오북 검토·승인 · ${state.title}`;
    const list = $('arTracks'); list.replaceChildren();
    $('arEmpty').hidden = state.tracks.length > 0;
    for (const t of state.tracks) {
      const li = document.createElement('li'); li.className = 'ar-track';
      const name = document.createElement('b'); name.textContent = `${String(t.number).padStart(2, '0')} · ${t.title}`;
      const meta = document.createElement('small'); meta.textContent = `${(t.size / 1024 / 1024).toFixed(1)}MB${t.uploaded ? ' · ' + new Date(t.uploaded).toLocaleString('ko-KR') : ''}`;
      const play = document.createElement('button'); play.type = 'button'; play.className = 'op-btn ghost'; play.textContent = heard.has(t.number) ? '다시 듣기 ✓' : '듣기';
      const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.hidden = true;
      play.addEventListener('click', async () => {
        if (!audio.src) {
          play.textContent = '불러오는 중…';
          const r = await authed(`${base}/${t.number}/content`);
          if (!r.ok) { alert('오디오를 불러오지 못했습니다.'); play.textContent = '듣기'; return; }
          const u = URL.createObjectURL(await r.blob()); urls.push(u); audio.src = u;
        }
        audio.hidden = false; audio.play().catch(() => {}); heard.add(t.number); play.textContent = '다시 듣기 ✓'; refresh();
      });
      const replace = document.createElement('label'); replace.className = 'op-btn'; replace.textContent = '교체';
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.mp3,audio/mpeg'; input.hidden = true;
      input.addEventListener('change', () => upload(t.number, input.files?.[0])); replace.append(input);
      const row = document.createElement('div'); row.className = 'ar-row'; row.append(name, meta, play, replace);
      li.append(row, audio); list.append(li);
    }
    const a = state.approval;
    $('arState').className = a?.filesMatch ? 'ok' : 'warn';
    $('arState').textContent = a ? (a.filesMatch ? `승인됨 · ${a.tracks.length}개 장 · ${a.approved_by} · ${new Date(a.approved_at).toLocaleString('ko-KR')} — 구매자에게 열려 있습니다.` : '승인 이후 파일이 바뀌어 승인이 해제되었습니다. 다시 들어 보고 승인해 주세요.')
      : (state.delivery?.ready ? '서점 기록(카탈로그) 승인으로 이미 제공 중입니다.' : '아직 승인되지 않았습니다. 구매자에게는 "제작·검수 중"으로 보입니다.');
    $('arRevoke').hidden = !a;
    refresh();
  }
  async function load() {
    if (!bookId) { $('arStatus').textContent = '도서를 지정해 주세요.'; return; }
    try { state = await C.api(base); $('arLogin').hidden = true; $('arStatus').textContent = ''; render(); }
    catch (e) {
      if (e.status === 401) { $('arLogin').hidden = false; $('arStatus').textContent = '운영자 계정으로 로그인해 주세요.'; }
      else $('arStatus').textContent = e.status === 403 ? '운영자만 사용할 수 있는 화면입니다.' : e.message;
    }
  }
  $('arAdd').addEventListener('change', () => upload((state?.tracks?.length || 0) + 1, $('arAdd').files?.[0]));
  document.querySelectorAll('.ar-check').forEach(c => c.addEventListener('change', refresh));
  $('arApprove').addEventListener('click', async () => {
    if (!confirm(`${state.tracks.length}개 장을 승인하고 전자책 구매자에게 무료 오디오북을 엽니다. 계속할까요?`)) return;
    const r = await authed(`${base}/approval`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rightsApproved: $('arRights').checked, authorApproved: $('arAuthor').checked, voiceApproved: $('arVoice').checked, accessibilityReviewed: $('arAccess').checked, note: $('arNote').value, etags: state.tracks.map(t => t.etag) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || '승인하지 못했습니다.'); return; }
    alert('승인했습니다. 구매자 내 서재에서 오디오북이 열립니다.'); load();
  });
  $('arRevoke').addEventListener('click', async () => {
    if (!confirm('승인을 취소하면 구매자의 오디오북 듣기·받기가 즉시 중지됩니다. 계속할까요?')) return;
    const r = await authed(`${base}/approval`, { method: 'DELETE' }); if (!r.ok) { alert('취소하지 못했습니다.'); return; } load();
  });
  C.mountGoogle($('googleButton'), t => { $('accountStatus').textContent = t || ''; }, load);
  load();
})();
