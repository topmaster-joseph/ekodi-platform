// EKODI-MALL-PRODUCT-PHOTOS-001: seller photo upload for the saved product.
// Photos are resized in the browser (max 1600px, JPEG) before upload.
(() => {
  const API = '/ekodimall/api';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const form = document.querySelector('#sellerDraftForm');
  const studio = document.querySelector('#studio');
  if (!form || !studio || !window.supabase) return;
  const sb = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const MAX = 6;

  const section = document.createElement('section');
  section.className = 'studio-shell seller-photos';
  section.id = 'sellerPhotos';
  section.innerHTML = `
    <div class="sp-head"><h2>상품 사진</h2><p>밝은 자연광에서 찍은 실제 사진이 가장 좋습니다. 최대 ${MAX}장 · 첫 사진이 대표 이미지입니다.</p></div>
    <label class="sp-drop"><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><span class="sp-drop-title">사진 선택</span><span class="sp-drop-sub">또는 여기로 끌어다 놓기</span></label>
    <p class="sp-status" role="status" aria-live="polite"></p>
    <ul class="sp-grid"></ul>`;
  studio.after(section);
  const input = section.querySelector('input');
  const drop = section.querySelector('.sp-drop');
  const grid = section.querySelector('.sp-grid');
  const status = section.querySelector('.sp-status');
  let images = [];

  const style = document.createElement('style');
  style.textContent = `
  .seller-photos{padding:24px}
  .sp-head h2{margin:0;font-size:20px}.sp-head p{margin:6px 0 16px;color:#5f6763;font-size:14px}
  .sp-drop{display:grid;place-items:center;gap:4px;border:1.5px dashed #c9bfae;border-radius:16px;padding:28px;background:#fbf8f2;cursor:pointer;text-align:center}
  .sp-drop.is-over{background:#f2ebdd;border-color:#1f3d33}
  .sp-drop-title{font-weight:700;color:#1f3d33}.sp-drop-sub{font-size:12px;color:#7a807c}
  .sp-status{min-height:1.2em;margin:10px 0;font-size:14px;color:#1f4d3c}.sp-status[data-state=error]{color:#8a2430}
  .sp-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
  .sp-grid li{position:relative;border-radius:12px;overflow:hidden;background:#efe9df;aspect-ratio:4/5}
  .sp-grid img{width:100%;height:100%;object-fit:cover;display:block}
  .sp-grid .sp-badge{position:absolute;left:8px;top:8px;background:#1f3d33;color:#fff;font-size:11px;padding:3px 8px;border-radius:999px}
  .sp-actions{position:absolute;left:0;right:0;bottom:0;display:flex;gap:6px;padding:8px;background:linear-gradient(transparent,rgba(0,0,0,.45))}
  .sp-actions button{flex:1;border:0;border-radius:8px;padding:6px 0;font-size:12px;background:rgba(255,255,255,.92);cursor:pointer}`;
  document.head.append(style);

  const setStatus = (text, error = false) => { status.textContent = text; status.dataset.state = error ? 'error' : 'ok'; };
  const productId = () => String(form.elements.productId?.value || '').trim();
  const serverId = () => /^prd_[a-f0-9]{32}$/i.test(productId()) ? productId() : '';

  async function token() { return (await sb.auth.getSession()).data.session?.access_token || ''; }
  async function call(path, options = {}) {
    const t = await token();
    if (!t) throw new Error('Google 판매자 로그인이 필요합니다.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${t}`);
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `사진 처리 실패 (${response.status})`);
    return body;
  }

  function render() {
    grid.replaceChildren();
    images.forEach((image, index) => {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.src = image.url; img.alt = `상품 사진 ${index + 1}`; img.loading = 'lazy';
      li.append(img);
      if (index === 0) { const badge = document.createElement('span'); badge.className = 'sp-badge'; badge.textContent = '대표'; li.append(badge); }
      const actions = document.createElement('div'); actions.className = 'sp-actions';
      if (index > 0) { const main = document.createElement('button'); main.type = 'button'; main.textContent = '대표로'; main.addEventListener('click', () => makeMain(image.id)); actions.append(main); }
      const del = document.createElement('button'); del.type = 'button'; del.textContent = '삭제'; del.addEventListener('click', () => remove(image.id)); actions.append(del);
      li.append(actions);
      grid.append(li);
    });
  }

  async function load() {
    const id = serverId();
    if (!id) { images = []; render(); setStatus('먼저 5단계에서 [서버에 저장]을 눌러 주세요. 저장된 상품에만 사진을 올릴 수 있습니다.'); return; }
    try { const body = await call(`/api/products/${encodeURIComponent(id)}`); images = body.product?.images || []; render(); setStatus(images.length ? `사진 ${images.length}장` : '사진을 올려 주세요.'); }
    catch (error) { setStatus(error.message, true); }
  }

  function resize(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => blob ? resolve({ blob, w, h }) : reject(new Error('사진을 변환하지 못했습니다.')), 'image/jpeg', 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이 사진 형식은 열 수 없습니다. JPG·PNG로 저장 후 다시 올려 주세요.')); };
      img.src = url;
    });
  }

  async function upload(files) {
    const id = serverId();
    if (!id) { setStatus('먼저 [서버에 저장]을 눌러 상품을 저장해 주세요.', true); return; }
    const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, MAX - images.length));
    if (!list.length) { setStatus(images.length >= MAX ? `사진은 최대 ${MAX}장입니다.` : '사진 파일을 선택해 주세요.', true); return; }
    let done = 0;
    for (const file of list) {
      setStatus(`사진 올리는 중... (${done + 1}/${list.length})`);
      try {
        const { blob, w, h } = await resize(file);
        const body = await call(`/api/products/${encodeURIComponent(id)}/images`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg', 'x-image-width': String(w), 'x-image-height': String(h) } });
        images = body.images || images; render(); done++;
      } catch (error) { setStatus(error.message, true); return; }
    }
    setStatus(`사진 ${done}장을 올렸습니다. 상품 페이지에 바로 반영됩니다.`);
  }

  async function remove(imageId) {
    try { const body = await call(`/api/products/${encodeURIComponent(serverId())}/images/${imageId}`, { method: 'DELETE' }); images = body.images || []; render(); setStatus('사진을 삭제했습니다.'); }
    catch (error) { setStatus(error.message, true); }
  }
  async function makeMain(imageId) {
    const order = [imageId, ...images.map((i) => i.id).filter((id) => id !== imageId)];
    try { const body = await call(`/api/products/${encodeURIComponent(serverId())}/images`, { method: 'PUT', body: JSON.stringify({ order }), headers: { 'content-type': 'application/json' } }); images = body.images || images; render(); setStatus('대표 사진을 바꿨습니다.'); }
    catch (error) { setStatus(error.message, true); }
  }

  input.addEventListener('change', () => { upload(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => upload(e.dataTransfer?.files || []));
  form.elements.productId?.addEventListener('input', load);
  // Refresh whenever the section becomes visible (wizard step change).
  new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) load(); }).observe(section);
})();
