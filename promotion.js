import { preparePromotionItems, filterPromotionItems, promotionPage } from './promotion-core.js';

const $ = (selector) => document.querySelector(selector);
const board = $('#promotionBoard');
const count = $('#promotionCount');
const status = $('#promotionStatus');
const pageLabel = $('#promotionPageNumber');
const siteSelector = $('#promotionSite');
const screen = new URL(location.href).searchParams.get('screen') === '1';
const state = { items: [], category: 'all', siteId: 'all', page: 0, loaded: false };
const siteNames = Object.freeze({
  ekodimission: '에코디선교회', ekodichurch: '에코디교회',
  ekodimall: '에코디몰', ekodibooks: '에코디서점',
  seonammedi: '서남권국립의대',
  cgma: '청계상인회', edu: '에코디 교육',
});
const categoryNames = { event: '행사·모임', notice: '소식·이야기', product: '상품' };

function siteName(item) { return siteNames[item.siteId] || '에코디 공개 게시물'; }
function setText(target, value) { if (target) target.textContent = value; }
function element(tag, className, text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function makeCard(item) {
  const card = element('article', 'promotion-card');
  card.dataset.category = item.category;
  const top = element('div', 'promotion-card-top');
  top.append(element('span', 'promotion-chip', categoryNames[item.category]), element('span', 'promotion-site', siteName(item)));
  const title = element('h3', '', item.title);
  const body = element('div', 'promotion-card-copy');
  body.append(title);
  if (item.summary && !screen) body.append(element('p', '', item.summary));
  const actions = element('div', 'promotion-actions');
  const link = element('a', 'promotion-link', '원문 보기');
  link.href = item.url;
  link.rel = 'noopener';
  const share = element('button', 'promotion-share', '링크 공유');
  share.type = 'button';
  share.setAttribute('aria-label', item.title + ' 공유');
  share.addEventListener('click', () => shareItem(item));
  actions.append(link, share);
  card.append(top, body, actions);
  return card;
}
async function shareItem(item) {
  try {
    if (navigator.share) {
      await navigator.share({ title: item.title, url: item.url });
      return;
    }
    if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(item.url);
    setText(status, '공개 게시물 링크를 복사했습니다.');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    setText(status, '공유가 제한되어 있습니다. 원문 보기에서 주소를 복사해 주세요.');
  }
}
function currentItems() {
  return filterPromotionItems(state.items, { category: state.category, siteId: state.siteId });
}
function render() {
  const items = currentItems();
  const page = screen ? promotionPage(items, state.page, 5) : { items, page: 0, pages: 1 };
  board.replaceChildren();
  if (!page.items.length) board.append(element('p', 'promotion-empty', state.loaded ? '선택한 분류에 공개된 홍보물이 없습니다.' : '공개 홍보물을 불러오고 있습니다.'));
  else for (const item of page.items) board.append(makeCard(item));
  board.setAttribute('aria-busy', 'false');
  setText(count, '공개 홍보물 ' + items.length + '건');
  setText(pageLabel, screen && page.pages ? (page.page + 1) + ' / ' + page.pages + ' · 12초마다 다음 게시물' : '');
}
function syncSiteOptions() {
  const old = siteSelector.value;
  const ids = [...new Set(state.items.map(item => item.siteId).filter(Boolean))].sort();
  siteSelector.replaceChildren(new Option('모든 사이트', 'all'));
  for (const id of ids) siteSelector.append(new Option(siteNames[id] || id, id));
  state.siteId = ids.includes(old) ? old : 'all';
  siteSelector.value = state.siteId;
}
async function load() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/public-registry.json', { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('registry_http_' + response.status);
    const registry = await response.json();
    if (registry?.canonicalHost !== 'ekodi.kr' || !Array.isArray(registry?.resources)) throw new Error('registry_shape');
    state.items = preparePromotionItems(registry);
    state.loaded = true;
    state.page = 0;
    syncSiteOptions();
    render();
    setText(status, '공개 원본 자료 기반 · 60초마다 자동 갱신 · 최종 확인 ' + new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
  } catch {
    state.loaded = true;
    render();
    setText(status, state.items.length ? '연결이 일시 중단되어 이전에 확인한 공개 정보가 표시됩니다.' : '공개 게시물 연결을 확인할 수 없습니다. 잠시 후 새로고침해 주세요.');
  } finally { clearTimeout(timeout); }
}
document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
  state.category = button.dataset.category;
  state.page = 0;
  document.querySelectorAll('[data-category]').forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  render();
}));
siteSelector.addEventListener('change', () => { state.siteId = siteSelector.value; state.page = 0; render(); });
$('#promotionRefresh').addEventListener('click', load);
$('#promotionScreen').addEventListener('click', () => { location.assign('/promotion?screen=1'); });
if (screen) {
  document.body.classList.add('promotion-screen');
  $('.promotion-home').textContent = '일반 화면';
  $('.promotion-home').href = '/promotion';
  $('#promotionBoardTitle').textContent = '에코디 공개 홍보';
  setInterval(() => {
    if (document.hidden) return;
    state.page += 1;
    render();
  }, 12000);
}
setInterval(() => { if (!document.hidden) load(); }, 60000);
load();
