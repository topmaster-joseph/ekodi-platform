const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('#main-nav');
const siteHeader = document.querySelector('.site-header');
const churchT = (source) => window.EKODIChurchI18n?.t?.(source) || source;

// Korean-first church identity in the public header. The locale layer translates it after boot.
const headerBrandName = document.querySelector('.site-header .brand strong');
if (headerBrandName) headerBrandName.textContent = '에코디교회';
const headerBrandLink = document.querySelector('.site-header .brand');
if (headerBrandLink) headerBrandLink.setAttribute('aria-label', '에코디교회 홈');

// Public church header: keep only the most useful next actions and the church-local member home.
if (nav) {
  const items = [
    { href: '#worship', label: '예배안내' },
    { href: '/ekodichurch/devotion/', label: '매일묵상', className: 'nav-devotion' },
    { href: '#online', label: '온라인' },
    { href: '#location', label: '오시는 길' },
    { href: '/qtin/church', label: '큐티인 신청', className: 'nav-qtin' },
    { href: '/ekodichurch/my/', label: '마이페이지', className: 'shell-my' },
  ];
  const links = items.map((item) => {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (item.className) link.className = item.className;
    if (item.href.startsWith('http')) link.setAttribute('aria-label', item.label);
    return link;
  });
  nav.replaceChildren(...links);
}

const footerBrandName = document.querySelector('footer .footer-brand strong');
if (footerBrandName) footerBrandName.textContent = '에코디교회';
const footerCopyright = document.querySelector('footer .footer-meta span');
if (footerCopyright) footerCopyright.textContent = '© 2026 에코디교회';

const communityCard = [...document.querySelectorAll('.community-cards article')].find((card) => card.querySelector('h3')?.textContent.includes('에코디커뮤니티'));
if (communityCard) {
  const link = communityCard.querySelector('a');
  if (link) {
    link.href = 'https://community.ekodi.kr';
    link.textContent = '에코디커뮤니티 보기 →';
  }
}
document.querySelectorAll('a[href="https://www.youtube.com/@ekodicommunity"]').forEach((link) => {
  link.textContent = '에코디커뮤니티 채널 ↗';
});

// Keep canonical YouTube links from the page intact. The registry may add other
// social channels, but it must not replace the worship route with stale data.
async function syncChurchSocialLinks() {
  const host = document.querySelector('.channel-links');
  if (!host) return;
  const preserved = [...host.querySelectorAll('a')].map((link) => link.cloneNode(true));
  const urls = new Set(preserved.map((link) => link.href));
  try {
    const response = await fetch('https://api.ekodi.kr/api/social/registry', {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`registry_${response.status}`);
    const registry = await response.json();
    const church = (registry.organizations || []).find((org) => org.id === 'church' && org.isActive !== false);
    const channels = (church?.channels || []).filter((channel) => channel.isActive !== false && channel.provider !== 'youtube');
    const nodes = [...preserved];
    channels.forEach((channel) => {
      if (!channel.url || urls.has(channel.url)) return;
      const link = document.createElement('a');
      link.href = channel.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = `${channel.label || channel.provider || 'Channel'} ↗`;
      link.dataset.provider = channel.provider || 'other';
      nodes.push(link);
      urls.add(channel.url);
    });
    const hubUrl = 'https://social.ekodi.kr/?org=church';
    if (!urls.has(hubUrl)) {
      const hub = document.createElement('a');
      hub.href = hubUrl;
      hub.target = '_blank';
      hub.rel = 'noreferrer noopener';
      hub.textContent = '전체 소셜채널 ↗';
      nodes.push(hub);
    }
    host.replaceChildren(...nodes);
    host.dataset.registryRevision = String(registry.revision || registry.version || 'live');
    window.EKODIChurchI18n?.refresh?.();
  } catch (error) {
    console.warn('[EKODI Church Social] existing channel links retained', error?.message || error);
  }
}
syncChurchSocialLinks();

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', open);
  });

  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }));
}

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (entry.isIntersecting) {
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);
  }
}), { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const youtubeChannels = {
  church: {
    playlist: 'UUnp_LXmJBcJRX7CgJT9FF7w',
    title: '에코디교회 최신 유튜브 영상',
  },
  mission: {
    playlist: 'UUm1PFvzN0PRnyiF8Xx_mYTw',
    title: '에코디커뮤니티 최신 유튜브 영상',
  },
};

const youtubePlayer = document.querySelector('#youtube-player');
function youtubePlaylistUrl(playlist) {
  return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlist)}&rel=0&playsinline=1&origin=${encodeURIComponent('https://ekodi.kr')}`;
}

document.querySelectorAll('.channel-tab').forEach((tab) => tab.addEventListener('click', () => {
  const selected = youtubeChannels[tab.dataset.channel];
  if (!selected || !youtubePlayer) return;

  document.querySelectorAll('.channel-tab').forEach((button) => {
    const active = button === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  youtubePlayer.src = youtubePlaylistUrl(selected.playlist);
  youtubePlayer.referrerPolicy = 'strict-origin-when-cross-origin';
  youtubePlayer.title = churchT(selected.title);
}));

document.querySelectorAll('.copy-account').forEach((button) => button.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(button.dataset.account);
    button.textContent = churchT('복사 완료');
    button.classList.add('copied');
    window.setTimeout(() => {
      button.textContent = churchT('계좌 복사');
      button.classList.remove('copied');
    }, 1800);
  } catch {
    button.textContent = button.dataset.account;
  }
}));

// Published worship data: public pages can read only rows released by a church tenant admin.
async function syncPublishedWorship() {
  const schedule = document.querySelector('#worship .schedule');
  if (!schedule) return;
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const query = new URLSearchParams({
    select: 'service_type,service_date,service_name,service_time,scripture,title,preacher,notice',
    is_published: 'eq.true',
    service_date: `gte.${today}`,
    order: 'service_date.asc',
    limit: '2',
  });
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/church_worship_materials?${query}`, {
      headers: { apikey: PUBLISHABLE_KEY, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`worship_${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return;
    schedule.querySelectorAll('[data-ekodi-published-worship]').forEach((node) => node.remove());
    rows.forEach((row) => {
      const card = document.createElement('div');
      card.dataset.ekodiPublishedWorship = row.service_type || 'service';
      const date = new Date(`${row.service_date}T00:00:00+09:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' });
      const headline = row.title || row.scripture || '함께 드리는 모임';
      card.innerHTML = `<span>${row.service_name || '예배'} · ${date}</span><strong></strong><small></small>`;
      card.querySelector('strong').textContent = headline;
      card.querySelector('small').textContent = [row.scripture, row.preacher, row.service_time].filter(Boolean).join(' · ');
      schedule.prepend(card);
    });
  } catch (error) {
    console.warn('[EKODI Church Worship] static schedule retained', error?.message || error);
  }
}

syncPublishedWorship();
