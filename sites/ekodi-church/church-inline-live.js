(() => {
  'use strict';
  const host = document.getElementById('churchInlineLive');
  const stage = document.getElementById('churchInlineLiveStage');
  const placeholder = document.getElementById('churchInlineLivePlaceholder');
  const frame = document.getElementById('churchInlineLiveFrame');
  const watch = document.getElementById('churchWatchLive');
  const fullscreen = document.getElementById('churchWatchFullscreen');
  const status = document.getElementById('churchInlineLiveStatus');
  if (!host || !stage || !placeholder || !frame || !watch || !fullscreen || !status) return;

  // The same-origin Church viewer owns room discovery and WebRTC media.
  // The homepage never gains broadcast permissions or access to a studio token.
  const viewerUrl = new URL('/live/church/', location.origin);
  viewerUrl.searchParams.set('mode', 'viewer');
  viewerUrl.searchParams.set('embed', 'church-online');
  let watching = false;

  function setWatching(value) {
    watching = value;
    host.dataset.watching = String(value);
    frame.hidden = !value;
    placeholder.hidden = value;
    fullscreen.disabled = !value;
    watch.setAttribute('aria-expanded', String(value));
    watch.textContent = value ? '시청 종료' : '실시간 방송 시청';
    status.textContent = value
      ? '실시간 방송을 연결하고 있습니다. 방송 중이 아니면 대기 안내가 표시됩니다.'
      : '공개 방송은 로그인 없이 볼 수 있습니다.';
    if (value) {
      // Assign only after a click: no surprise media/session connections on page load.
      frame.src = viewerUrl.pathname + viewerUrl.search;
    } else {
      // Unload the viewer to close its WebRTC session, polling and audio.
      frame.removeAttribute('src');
    }
  }

  function syncFullscreen() {
    const active = document.fullscreenElement === stage;
    fullscreen.textContent = active ? '전체화면 종료' : '전체화면';
    fullscreen.setAttribute('aria-pressed', String(active));
  }

  watch.addEventListener('click', () => {
    if (document.fullscreenElement === stage) {
      void document.exitFullscreen().catch(() => {});
    }
    setWatching(!watching);
  });
  fullscreen.addEventListener('click', async () => {
    if (!watching) return;
    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else if (stage.requestFullscreen) {
        await stage.requestFullscreen();
      } else {
        status.textContent = '전체화면이 지원되지 않습니다. 별도 화면에서 시청할 수 있습니다.';
      }
    } catch {
      status.textContent = '전체화면 전환이 제한되었습니다. 별도 화면에서 시청할 수 있습니다.';
    }
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  window.addEventListener('pagehide', () => {
    frame.removeAttribute('src');
  }, { once: true });
})();
