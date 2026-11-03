// BOOKS-AUDIOBOOK-PLAYER-001 — 구매자용 무료 보너스 오디오북 플레이어
// 장 목록·재생/일시정지·이전/다음·다음 장 자동 재생·속도·이어 듣기(장과 위치 기억).
// 오디오는 소유권을 검증하는 기존 다운로드 API(Bearer)로 받아 blob: URL로 재생한다(CSP media-src blob:).
(() => {
  'use strict';
  const CSS = `:host{all:initial;position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(10,20,40,.45);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}
  .sheet{width:min(560px,100%);max-height:88vh;display:flex;flex-direction:column;background:#faf7f0;border-radius:16px 16px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.2)}
  .head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #e3dccd}.head b{flex:1;font-size:15px;color:#14305f}
  .head button{font:inherit;font-size:13px;border:1px solid #cfc6b4;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}
  ol{list-style:none;margin:0;padding:6px 0;overflow:auto;flex:1}
  li button{all:unset;box-sizing:border-box;display:flex;gap:10px;width:100%;padding:11px 16px;font-size:14px;cursor:pointer;color:#222}
  li button[aria-current="true"]{background:#e8eef8;color:#14305f;font-weight:700}li .n{width:26px;color:#8a8f99}
  .ctl{padding:12px 16px 18px;border-top:1px solid #e3dccd;background:#fff}
  .ctl .now{font-size:13px;color:#14305f;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ctl audio{width:100%}.row{display:flex;gap:8px;margin-top:8px;align-items:center}
  .row button,.row select{font:inherit;font-size:13px;border:1px solid #14305f;color:#14305f;background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}
  .row .msg{flex:1;font-size:12px;color:#8a5a12}`;

  async function open({ item, fetchTrack }) {
    const tracks = item.audiobook?.tracks || [];
    if (!tracks.length) throw new Error('들을 수 있는 오디오북이 아직 없습니다.');
    const host = document.createElement('div');
    host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', `${item.title} 오디오북`);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="sheet"><div class="head"><b></b><button class="close">✕ 닫기</button></div><ol></ol>
      <div class="ctl"><div class="now"></div><audio controls preload="none"></audio>
      <div class="row"><button class="prev">⏮ 이전 장</button><button class="next">다음 장 ⏭</button><select class="voice" aria-label="낭독 목소리" hidden></select><select class="rate" aria-label="재생 속도"><option value="0.75">0.75×</option><option value="0.9">0.9×</option><option value="1" selected>1.0×</option><option value="1.15">1.15×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2.0×</option></select><span class="msg"></span></div></div></div>`;
    const $ = s => root.querySelector(s);
    const audio = $('audio');
    const key = `ekodi-audiobook:${item.id}`;
    let pos = { n: tracks[0].number, t: 0, rate: 1 };
    try { pos = { ...pos, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch {}
    const save = () => { try { localStorage.setItem(key, JSON.stringify(pos)); } catch {} };
    $('.head b').textContent = `${item.title} · 오디오북`;
    const cache = new Map();
    let current = -1, loading = false;
    tracks.forEach((t, i) => { const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('span'); n.className = 'n'; n.textContent = String(t.number).padStart(2, '0'); const s = document.createElement('span'); s.textContent = t.title;
      b.append(n, s); b.onclick = () => play(i, 0); li.append(b); $('ol').append(li); });
    async function play(i, at = 0) {
      if (loading || i < 0 || i >= tracks.length) return;
      loading = true; $('.row .msg').textContent = '불러오는 중…';
      try {
        const t = tracks[i];
        const ck = `${pos.voice || ''}:${t.number}`;
        if (!cache.has(ck)) cache.set(ck, URL.createObjectURL(await fetchTrack(t.number, pos.voice || '')));
        current = i; audio.src = cache.get(ck); audio.playbackRate = Number(pos.rate) || 1;
        audio.addEventListener('loadedmetadata', () => { if (at > 0 && at < audio.duration - 2) audio.currentTime = at; }, { once: true });
        await audio.play().catch(() => {});
        $('.now').textContent = `${String(t.number).padStart(2, '0')} · ${t.title}`;
        root.querySelectorAll('li button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
        $('.prev').disabled = i === 0; $('.next').disabled = i === tracks.length - 1;
        pos.n = t.number; pos.t = at; save(); $('.row .msg').textContent = '';
      } catch (e) { $('.row .msg').textContent = e.message || '재생하지 못했습니다.'; }
      finally { loading = false; }
    }
    let last = 0;
    audio.addEventListener('timeupdate', () => { if (Date.now() - last > 5000) { last = Date.now(); pos.t = Math.floor(audio.currentTime); save(); } });
    audio.addEventListener('ended', () => { if (current < tracks.length - 1) play(current + 1, 0); else { pos.t = 0; save(); } });
    $('.prev').onclick = () => play(current - 1, 0);
    $('.next').onclick = () => play(current + 1, 0);
    // EKODI-VOICE-002: 남·여 × 어린이·청소년·중장년·노년 목소리 선택(바꿔도 같은 장·위치에서 이어 듣기)
    const voices = Array.isArray(item.audiobook?.voices) ? item.audiobook.voices : [];
    if (voices.length) {
      const sel = $('.voice'); sel.hidden = false;
      for (const v of voices) { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; sel.append(o); }
      if (!voices.some(v => v.id === pos.voice)) pos.voice = voices.find(v => v.id.endsWith('-adult'))?.id || voices[0].id;
      sel.value = pos.voice;
      sel.onchange = () => { pos.voice = sel.value; save(); if (current >= 0) play(current, Math.floor(audio.currentTime || 0)); };
    }
    $('.rate').value = String(pos.rate || 1);
    $('.rate').onchange = e => { pos.rate = Number(e.target.value); audio.playbackRate = pos.rate; save(); };
    const close = () => { audio.pause(); pos.t = Math.floor(audio.currentTime || pos.t); save(); cache.forEach(u => URL.revokeObjectURL(u)); host.remove(); document.body.style.overflow = ''; };
    $('.close').onclick = close;
    host.addEventListener('click', e => { if (e.target === host) close(); });
    document.body.style.overflow = 'hidden';
    document.body.append(host);
    const start = Math.max(0, tracks.findIndex(t => t.number === Number(pos.n)));
    await play(start, Number(pos.t) || 0);
    return { close };
  }
  window.EkodiAudioPlayer = { open };
})();
