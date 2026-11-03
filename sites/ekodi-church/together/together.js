(() => {
  const APPLY_API = '/ekodimission/api/activities/261028-together-partners/applications';
  const CONTACT = '정찬균 목사 010-3501-8542';

  // Mobile menu
  const menu = document.querySelector('.menu-button');
  const nav = document.getElementById('main-nav');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') === 'true';
      menu.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
  }

  // Account copy
  document.querySelectorAll('.copy-account').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.account || '');
        btn.textContent = '복사됨';
      } catch {
        btn.textContent = '직접 입력해 주세요';
      }
      setTimeout(() => { btn.textContent = '복사'; }, 2000);
    });
  });

  // Card / CMS giving (church only, same trust rules as homepage giving.js)
  const cardBtn = document.getElementById('together-card-giving');
  const cardStatus = document.getElementById('together-card-status');
  let checkout = null;
  if (cardBtn && cardStatus) {
    fetch('/ekodichurch/giving-config.json', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        const url = cfg?.enabled && cfg?.provider === 'missionfund' && cfg?.checkoutUrl ? new URL(cfg.checkoutUrl) : null;
        if (url && url.protocol === 'https:' && url.hostname === 'go.missionfund.org') {
          checkout = url.toString();
          cardBtn.disabled = false;
          cardBtn.textContent = '카드·자동이체로 후원';
          cardStatus.textContent = '미션펀드 보안 후원창에서 진행됩니다.';
        } else throw new Error('config');
      })
      .catch(() => {
        cardBtn.textContent = '카드·자동이체 준비 중';
        cardStatus.textContent = '현재는 계좌이체를 이용해 주세요.';
      });
    cardBtn.addEventListener('click', () => { if (checkout) window.open(checkout, '_blank', 'noopener,noreferrer'); });
  }

  // Partnership application
  const form = document.getElementById('together-form');
  const status = document.getElementById('together-form-status');
  if (!form || !status) return;
  const say = (msg, state) => { status.textContent = msg; status.dataset.state = state || ''; };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const phone = String(fd.get('phone') || '').trim();
    const ways = fd.getAll('way').map(String);
    if (!name) return say('이름을 입력해 주세요.', 'error');
    if (phone.replace(/[^0-9+]/g, '').length < 8) return say('연락처를 확인해 주세요.', 'error');
    if (!ways.length) return say('함께하고 싶은 방식을 하나 이상 골라 주세요.', 'error');
    if (!fd.get('privacy')) return say('개인정보 수집·이용에 동의해 주세요.', 'error');

    const org = String(fd.get('org') || '').trim();
    const note = [`[동역방식] ${ways.join(', ')}`, org ? `[소속] ${org}` : '', String(fd.get('note') || '').trim()]
      .filter(Boolean).join('\n').slice(0, 2000);

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    say('접수하고 있습니다…');
    try {
      const response = await fetch(APPLY_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          name, phone, email: String(fd.get('email') || '').trim(), partySize: 1, language: 'ko',
          note, privacyConsent: true, photoConsent: false, website: String(fd.get('website') || ''),
        }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        form.reset();
        say(`동역 신청이 정상 접수되었습니다. 감사합니다. 담당자가 곧 연락드리겠습니다. 기타 문의: ${CONTACT}`, 'ok');
      } else {
        say(`${data?.message || '신청을 저장하지 못했습니다.'} 문의: ${CONTACT}`, 'error');
      }
    } catch {
      say(`네트워크 문제로 접수하지 못했습니다. 잠시 후 다시 시도하시거나 ${CONTACT}로 연락해 주세요.`, 'error');
    } finally {
      button.disabled = false;
    }
  });
})();

// Three ways as tabs: the chosen way's detail appears right below the cards.
(() => {
  const cards = [...document.querySelectorAll('.together-way')];
  if (!cards.length) return;
  const panels = { pray: ['pray', 'join'], give: ['give'], partner: ['join'] };
  const preset = { pray: ['기도동역'], partner: ['재능·봉사', '기관협력'] };
  const sections = ['pray', 'give', 'join'].map(id => document.getElementById(id)).filter(Boolean);
  function select(way, scroll) {
    if (!panels[way]) return;
    cards.forEach(card => card.setAttribute('aria-selected', String(card.dataset.way === way)));
    sections.forEach(section => { section.hidden = !panels[way].includes(section.id); });
    const picks = preset[way];
    if (picks) document.querySelectorAll('#together-form input[name="way"]').forEach(box => { box.checked = picks.includes(box.value); });
    if (scroll) document.getElementById(panels[way][0])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  cards.forEach(card => card.addEventListener('click', () => { select(card.dataset.way, true); history.replaceState(null, '', '#' + (card.dataset.way === 'partner' ? 'join' : card.dataset.way)); }));
  document.querySelectorAll('[data-way-link]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const way = link.dataset.wayLink;
    select(way, false);
    const target = link.getAttribute('href').slice(1);
    if (way === 'pray' && target === 'join') document.getElementById('join').hidden = false;
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const hash = location.hash.slice(1);
  select(hash === 'give' ? 'give' : hash === 'join' ? 'partner' : hash === 'pray' ? 'pray' : 'pray', !!hash);
})();
