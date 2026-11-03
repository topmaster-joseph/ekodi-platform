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
  const say = (message) => { status.textContent = message; };
  function render() {
    let item;
    try {
      item = resolveO2OTarget({ siteId: siteInput.value, targetPath: targetInput.value });
    } catch {
      current = null;
      qrRoot.replaceChildren();
      link.textContent = '공개 주소를 확인해 주세요.';
      open.removeAttribute('href');
      say('선택한 사이트의 공개 주소만 연결할 수 있습니다. 로그인·관리자·비공개 주소는 제외해 주세요.');
      return;
    }
    current = item;
    link.textContent = item.url;
    open.href = item.url;
    qrRoot.replaceChildren();
    if (typeof window.QRCode !== 'function') {
      say('연결 링크는 준비되었습니다. QR을 생성할 수 없는 환경에서는 링크를 사용해 주세요.');
      return;
    }
    try {
      new window.QRCode(qrRoot, {
        text: item.url, width: 320, height: 320,
        colorDark: '#14241a', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
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
