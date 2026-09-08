(() => {
  const palettes = [
    ['#f2cfa45c','#9ed7b25c','#b9d4e55c'],
    ['#f3d9ad55','#a7d9bd55','#bad7ec55'],
    ['#ecc7b455','#b1dccb55','#d2c7e755'],
  ];
  const gatePriority = ['church','community','biz','mall','marketing','books','lab','work','publishing','journal','author','social','life','my'];

  function installMessageUI() {
    if (window.EKODIMessage || document.querySelector('script[data-ekodi-message-runtime]')) return;
    const script = document.createElement('script');
    script.src = '/ekodi-message-ui.js';
    script.defer = true;
    script.dataset.ekodiMessageRuntime = 'v1';
    script.addEventListener('error', () => console.warn('[EKODI] shared message UI runtime failed to load.'), { once:true });
    document.head.appendChild(script);
  }

  function seoulDateKey(now = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' });
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function dailySeed(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function applyDailyAmbient() {
    const key = seoulDateKey();
    const seed = dailySeed(key);
    const palette = palettes[seed % palettes.length];
    const root = document.documentElement;
    root.style.setProperty('--ambient-a', palette[0]);
    root.style.setProperty('--ambient-b', palette[1]);
    root.style.setProperty('--ambient-c', palette[2]);
    root.dataset.dailyDate = key;
    root.dataset.ambientTheme = String((seed % palettes.length) + 1);
  }

  function staticPresentation(card) {
    return {
      visibility: card.dataset.homepageDefault || (card.hasAttribute('hidden') ? 'hidden' : 'normal'),
      order: Math.max(0, Math.min(9999, Math.trunc(Number(card.dataset.homepageOrder) || 9999))),
    };
  }

  function updateServiceGroups() {
    document.querySelectorAll('.service-group').forEach(group => {
      const cards = [...group.querySelectorAll('.service-card[data-service-id]')];
      const visible = cards.filter(card => !card.hasAttribute('hidden'));
      group.toggleAttribute('hidden', visible.length === 0);
      group.querySelectorAll('[data-service-count]').forEach(node => { node.textContent = String(visible.length); });
    });
  }

  async function applyHomepagePresentation(cards) {
    const settings = new Map();
    try {
      const response = await fetch('https://api.ekodi.kr/api/homepage/presentation', {
        method:'GET', mode:'cors', credentials:'omit', cache:'no-store', headers:{ accept:'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const item of data.services || []) {
        if (!item?.id) continue;
        const visibility = ['hidden','normal','featured'].includes(item.visibility) ? item.visibility : 'hidden';
        const order = Math.max(0, Math.min(9999, Math.trunc(Number(item.order) || 9999)));
        settings.set(String(item.id), { visibility, order });
      }
      document.documentElement.dataset.homepagePresentation = 'live';
    } catch (error) {
      console.warn('[EKODI] homepage presentation API unavailable; using registry defaults.', error);
      document.documentElement.dataset.homepagePresentation = 'default';
    }

    for (const card of cards) {
      const current = settings.get(card.dataset.serviceId) || staticPresentation(card);
      card.toggleAttribute('hidden', current.visibility === 'hidden');
      card.dataset.homepageVisibility = current.visibility;
      card.dataset.homepageOrder = String(current.order);
      card.classList.toggle('is-admin-featured', current.visibility === 'featured');
    }

    document.querySelectorAll('.service-list').forEach(list => {
      const items = [...list.querySelectorAll('.service-card[data-service-id]')];
      items.sort((a, b) => Number(a.dataset.homepageOrder || 9999) - Number(b.dataset.homepageOrder || 9999)
        || String(a.dataset.serviceId || '').localeCompare(String(b.dataset.serviceId || '')));
      items.forEach(card => list.append(card));
    });
    updateServiceGroups();
  }

  function serviceRank(card) {
    const priority = gatePriority.indexOf(card.dataset.serviceId || '');
    const adminOrder = Number(card.dataset.homepageOrder || 9999);
    return [priority < 0 ? 999 : priority, adminOrder];
  }

  function buildVillageGate(card) {
    const link = document.createElement('a');
    link.className = 'village-gate';
    link.href = card.getAttribute('href') || '#services';
    link.dataset.villageServiceId = card.dataset.serviceId || '';
    const icon = document.createElement('span');
    icon.className = 'gate-icon';
    const sourceIcon = card.querySelector('.service-icon');
    if (sourceIcon) icon.innerHTML = sourceIcon.innerHTML;
    else icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 15c5 0 9-4 14-10 0 8-4 14-11 14-2 0-3-1-3-4Z"></path></svg>';
    const title = document.createElement('strong');
    title.textContent = card.querySelector('.service-title strong')?.textContent?.trim() || 'EKODI';
    const subtitle = document.createElement('small');
    subtitle.textContent = card.querySelector('.service-name-en')?.textContent?.trim() || card.dataset.serviceId || 'Service';
    link.append(icon, title, subtitle);
    return link;
  }

  function buildCharacterVillage(cards) {
    const host = document.querySelector('[data-ekodi-village-gates]');
    if (!host) return;
    const visible = cards.filter(card => !card.hasAttribute('hidden'));
    visible.sort((a, b) => {
      const aa = serviceRank(a); const bb = serviceRank(b);
      return aa[0] - bb[0] || aa[1] - bb[1];
    });
    host.replaceChildren(...visible.slice(0, 8).map(buildVillageGate));
    host.toggleAttribute('data-empty', host.childElementCount === 0);
  }

  function markExternalLinks() {
    document.querySelectorAll('a[href^="https://"]').forEach(link => {
      try {
        const url = new URL(link.href);
        if (url.hostname !== location.hostname && !link.hasAttribute('rel')) link.rel = 'noopener';
      } catch {}
    });
  }

  async function start() {
    installMessageUI();
    applyDailyAmbient();
    document.body.dataset.livingGateway = 'v6-character-village';
    const cards = [...document.querySelectorAll('.service-card[data-service-status][data-service-id]')];
    await applyHomepagePresentation(cards);
    buildCharacterVillage(cards);
    markExternalLinks();
    document.documentElement.dataset.homepageExperience = 'ekodian-village-v6';
  }

  start().catch(error => console.warn('[EKODI] character village failed to initialize.', error));
})();
