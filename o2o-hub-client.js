import { O2O_SITES, resolveO2OTarget, formatO2OShareText } from './o2o-link-core.js';
const form = document.getElementById('o2o-form');
if (form) {
  const siteInput = document.getElementById('o2o-site');
  const targetInput = document.getElementById('o2o-target');
  const nameInput = document.getElementById('o2o-name');
  const qrRoot = document.getElementById('o2o-qr');
  const status = document.getElementById('o2o-status');
  const link = document.getElementById('o2o-link');
  const open = document.getElementById('o2o-open');
  let current = null;
  let lastRenderedUrl = '';
  let editTimer = null;
  const say = (message) => { status.textContent = message; };
  function invalidatePreview() {
    current = null;
    lastRenderedUrl = '';
    qrRoot.replaceChildren();
    link.textContent = '주소 입력을 확인하고 있습니다.';
    open.removeAttribute('href');
  }
  // Typing must never leave a stale QR/active link in the preview. Debounce the
  // expensive QR canvas work, but invalidate unsafe/old links immediately.
  function scheduleRender() {
    if (editTimer !== null) window.clearTimeout(editTimer);
    invalidatePreview();
    editTimer = window.setTimeout(() => {
      editTimer = null;
      render();
    }, 220);
  }
  function render() {
    if (editTimer !== null) {
      window.clearTimeout(editTimer);
      editTimer = null;
    }
    let item;
    try {
      item = resolveO2OTarget({ siteId: siteInput.value, targetPath: targetInput.value });
    } catch {
      invalidatePreview();
      link.textContent = '공개 주소를 확인해 주세요.';
      say('선택한 사이트의 공개 주소만 연결할 수 있습니다. 로그인·관리자·비공개 주소는 제외해 주세요.');
      return;
    }
    // Repeated submit of an unchanged destination is O(1): no new QR canvas.
    if (current?.url === item.url && lastRenderedUrl === item.url &&
        qrRoot.querySelector('canvas, img')) {
      say('기존 QR을 그대로 사용합니다. 다시 생성할 필요가 없습니다.');
      return;
    }
    current = item;
    link.textContent = item.url;
    open.href = item.url;
    qrRoot.replaceChildren();
    lastRenderedUrl = '';
    if (typeof window.QRCode !== 'function') {
      say('연결 링크는 준비되었습니다. QR을 생성할 수 없는 환경에서는 링크를 사용해 주세요.');
      return;
    }
    try {
      new window.QRCode(qrRoot, {
        text: item.url, width: 256, height: 256,
        colorDark: '#14241a', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      lastRenderedUrl = item.url;
      say('QR이 준비되었습니다. 화면 공유·인쇄에 사용할 수 있습니다.');
    } catch {
      say('링크는 준비되었지만 QR 이미지 생성에 실패했습니다.');
    }
  }
  const params = new URLSearchParams(window.location.search);
  if (O2O_SITES.some((item) => item.id === params.get('site'))) {
    siteInput.value = params.get('site');
    // Do not load share text or destinations from URL query: edge logs may retain query values.
    targetInput.value = O2O_SITES.find((item) => item.id === siteInput.value).root;
    nameInput.value = '현장 활동';
  }
  siteInput.addEventListener('change', () => {
    const selected = O2O_SITES.find((item) => item.id === siteInput.value);
    targetInput.value = selected.root;
    nameInput.value = '현장 활동';
    render();
  });
  targetInput.addEventListener('input', scheduleRender);
  form.addEventListener('submit', (event) => { event.preventDefault(); render(); });
  document.getElementById('o2o-copy').addEventListener('click', async () => {
    if (!current) return say('먼저 유효한 공개 주소로 QR을 만들어 주세요.');
    try {
      const message = formatO2OShareText({
        siteId: current.site.id, targetPath: current.path, activityName: nameInput.value
      });
      await navigator.clipboard.writeText(message);
      say('단체명·활동명·연결주소를 복사했습니다.');
    } catch { say('클립보드를 사용할 수 없습니다. 표시된 주소를 직접 복사해 주세요.'); }
  });
  document.getElementById('o2o-print').addEventListener('click', () => {
    if (!current) return say('먼저 QR을 만들어 주세요.');
    window.print();
  });
  document.getElementById('o2o-download').addEventListener('click', () => {
    if (!current) return say('먼저 QR을 만들어 주세요.');
    const canvas = qrRoot.querySelector('canvas');
    const image = qrRoot.querySelector('img');
    const source = canvas?.width && canvas?.height ? canvas :
      (image?.complete && image?.naturalWidth ? image : null);
    if (!source) return say('QR 그림이 없습니다. 링크를 사용해 주세요.');
    try {
      const exported = document.createElement('canvas');
      exported.width = 768; exported.height = 768;
      const ctx = exported.getContext('2d');
      if (!ctx) throw new Error('canvas_not_supported');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 768, 768);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, 64, 64, 640, 640);
      const a = document.createElement('a');
      a.href = exported.toDataURL('image/png');
      a.download = 'ekodi-o2o-qr.png';
      a.click();
      say('스캔 여백을 포함한 QR 이미지를 저장했습니다.');
    } catch { say('이 환경에서는 이미지 저장을 지원하지 않습니다.'); }
  });
  render();
}
