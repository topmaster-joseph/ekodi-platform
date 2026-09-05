(() => {
  const API = 'https://api.ekodi.kr/api/social/registry';
  const HUB = 'https://social.ekodi.kr';
  const icons = { youtube:'▶', instagram:'◎', facebook:'f', kakao:'◇', blog:'N', threads:'@', live:'●', tiktok:'♪', linkedin:'in', other:'↗' };
  let targets = [...document.querySelectorAll('[data-ekodi-social-links]')];
  if (!targets.length) {
    const grid = document.querySelector('.channel-grid');
    if (grid) {
      grid.dataset.ekodiSocialLinks = '';
      grid.dataset.org = 'community';
      grid.dataset.variant = 'cards';
      targets = [grid];
    }
  }

  function installConnectEntry() {
    const head = document.querySelector('#people .section-head');
    if (!head || head.querySelector('[data-ekodi-connect-entry]')) return;
    const link = document.createElement('a');
    link.href = '/connect/';
    link.className = 'secondary';
    link.dataset.ekodiConnectEntry = 'true';
    link.textContent = 'EKODI Connect →';
    link.setAttribute('aria-label', '신뢰 기반 EKODI Connect 열기');
    head.append(link);
  }
  installConnectEntry();
  if (!targets.length) return;

  function link(channel, variant) {
    const a = document.createElement('a');
    a.href = channel.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.authHref = channel.url;
    a.dataset.authTarget = '_blank';
    a.dataset.provider = channel.provider || 'other';
    if (variant === 'cards') {
      a.className = 'channel-card';
      const icon = document.createElement('span'); icon.textContent = icons[channel.provider] || '↗';
      const label = document.createElement('b'); label.textContent = channel.label || channel.provider || 'Channel';
      const description = document.createElement('small'); description.textContent = channel.description || '공식 채널';
      a.append(icon, label, description);
    } else {
      a.className = variant === 'plain' ? 'ekodi-social-plain' : 'ekodi-social-chip';
      a.textContent = `${icons[channel.provider] || '↗'} ${channel.label || channel.provider || 'Channel'}`;
    }
    return a;
  }

  function hubLink(orgId, variant) {
    const a = document.createElement('a');
    a.href = `${HUB}/?org=${encodeURIComponent(orgId)}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.authHref = a.href;
    a.dataset.authTarget = '_blank';
    if (variant === 'cards') {
      a.className = 'channel-card';
      const icon = document.createElement('span'); icon.textContent = 'E';
      const label = document.createElement('b'); label.textContent = 'EKODI Social';
      const description = document.createElement('small'); description.textContent = '전체 공식 채널 보기';
      a.append(icon, label, description);
    } else {
      a.className = variant === 'plain' ? 'ekodi-social-plain' : 'ekodi-social-chip';
      a.textContent = 'E 전체 소셜채널';
    }
    return a;
  }

  async function render() {
    let registry;
    try {
      const response = await fetch(API, { headers:{ accept:'application/json' }, cache:'no-store' });
      if (!response.ok) throw new Error(`registry_${response.status}`);
      registry = await response.json();
    } catch (error) {
      console.warn('[EKODI Social Links] bundled fallback kept', error?.message || error);
      return;
    }

    for (const target of targets) {
      const orgId = target.dataset.org || 'community';
      const variant = target.dataset.variant || 'chips';
      const org = (registry.organizations || []).find(item => item.id === orgId && item.isActive !== false);
      const channels = (org?.channels || []).filter(item => item.isActive !== false);
      const nodes = channels.map(channel => link(channel, variant));
      nodes.push(hubLink(orgId, variant));
      target.replaceChildren(...nodes);
      target.dataset.registryRevision = String(registry.revision || registry.version || 'live');
      target.dataset.socialReady = 'true';
    }
  }

  render();
})();
