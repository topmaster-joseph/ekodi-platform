// Editable bulletin content: the weekly worship page ships with the prepared
// bulletin, and anything the pastor edits in My Page (church_worship_materials
// .bulletin / .photo_url) replaces the matching block here.
(() => {
  'use strict';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const script = document.currentScript;
  const date = script && script.dataset.date;
  const pages = document.querySelector('[data-bulletin-date]');
  if (!date || !pages) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const block = name => pages.querySelector(`[data-b="${name}"]`);
  const rows = list => (Array.isArray(list) ? list : []).filter(r => Array.isArray(r) && r.some(c => String(c).trim()));

  function token() {
    try {
      const s = JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token') || 'null');
      const v = s && (s.currentSession || s.session || s);
      if (v && v.access_token && Number(v.expires_at || 0) > Date.now() / 1000 + 15) return v.access_token;
    } catch { /* storage blocked */ }
    return '';
  }


  // Effective-dated service order: preserve every worship bulletin before 2026-11-22.
  const orderEffectiveDate = '2026-11-22';
  const newOrder = [
    ["경배찬양", "Praise & Worship", "다같이"],
    ["예배부름", "Call to Worship", "인도자"],
    ["입례찬송", "Processional Hymn", "다같이"],
    ["공동고백", "Community Confession", "다같이"],
    ["회개찬송", "Hymn of Repentance", "다같이"],
    ["대표기도", "Congregational Prayer", "맡은이"],
    ["말씀봉독", "Scripture Reading", "다같이"],
    ["말씀찬송", "Hymn before the Sermon", "다같이"],
    ["말씀선포", "Proclamation of the Word", "설교자"],
    ["말씀기도", "Prayer in Response to the Word", "다같이"],
    ["결단찬송", "Hymn of Commitment", "다같이"],
    ["교회소식", "Church Announcements", "인도자"],
    ["파송찬송", "Sending Hymn", "다같이"],
    ["주기도문", "The Lord's Prayer", "다같이"]
  ];
  const hasNewOrder = date >= orderEffectiveDate;
  function applyNewWorshipLayout() {
    if (!hasNewOrder) return;
    const sheet = Array.from(pages.querySelectorAll('.bp-sheet')).find(s => s.querySelector('.bp-order'));
    if (!sheet) return;
    const cols = sheet.querySelector('.bp-cols');
    if (!cols || cols.children.length !== 2) return;
    const [left, right] = cols.children;
    const order = sheet.querySelector('.bp-order');
    const tableEl = order && order.querySelector('table');
    if (!tableEl) return;

    // 4 columns: Korean order, English, Korean song/scripture/title, person.
    // Song details are weekly; never reuse November 22 hymns in later services.
    const previousRows = Array.from(tableEl.querySelectorAll('tr'));
    const readOld = ko => {
      const row = previousRows.find(r => r.cells[0]?.textContent?.trim().startsWith(ko));
      if (!row) return '';
      return row.cells.length >= 4
        ? row.cells[2]?.textContent?.trim() || ''
        : row.cells[1]?.textContent?.trim() || '';
    };
    const extract = (ko, re) => (readOld(ko).match(re)?.[1] || '').trim().slice(0, 120);
    const existingScripture = extract('말씀읽기', /^Scripture Reading\\s*:\\s*(.+)$/i)
      || extract('말씀봉독', /^(?:Scripture Reading\\s*:\\s*)?(.+)$/i);
    const existingSermon = extract('말씀나눔', /^Sermon\\s*[-–:]\\s*(.+)$/i)
      || extract('말씀선포', /^(?:Proclamation of the Word\\s*[-–:·]\\s*)?(.+)$/i);
    const weeklySongs = date === '2026-11-22' ? {
      "경배찬양": [
            "은혜",
            "날구원하신주",
            "지금까지"
      ],
      "입례찬송": "거룩하신 하나님",
      "회개찬송": "나 주님의 기쁨되기",
      "말씀봉독": "고린도전서 12:1–11",
      "말씀찬송": "아 하나님의 은혜로",
      "말씀선포": "공동의 유익을 위한 은사",
      "결단찬송": "성령이여 강림하사",
      "파송찬송": "주 안에 우린 하나"
} : {};
    const detailMap = { ...weeklySongs };
    if (existingScripture && existingScripture !== 'Scripture Reading') detailMap['말씀봉독'] = detailMap['말씀봉독'] || existingScripture;
    if (existingSermon && existingSermon !== 'Proclamation of the Word') detailMap['말씀선포'] = detailMap['말씀선포'] || existingSermon;
    function formatDetail(value) {
      const lines = (Array.isArray(value) ? value : [value]).map(v => String(v || '').trim()).filter(Boolean).slice(0, 5);
      return lines.map(line => '<span class="bp-order-line">' + esc(line) + '</span>').join('');
    }
    const rows = newOrder.map(([ko, en, actor]) => {
      const korean = esc(ko) + (ko === '경배찬양' ? '<small class="bp-praise-time">예배 15분 전</small>' : '');
      return '<tr><td class="bp-order-ko">' + korean + '</td>'
        + '<td class="bp-order-en">' + esc(en) + '</td>'
        + '<td class="bp-order-detail">' + formatDetail(detailMap[ko]) + '</td>'
        + '<td class="bp-order-actor">' + esc(actor) + '</td></tr>';
    }).join('');
    tableEl.innerHTML = rows;

    const committee = sheet.querySelector('[data-b="committee"]');
    const committeeHeading = committee?.previousElementSibling;
    const sponsors = sheet.querySelector('[data-b="sponsors"]');
    const sponsorsHeading = sponsors?.previousElementSibling;
    const questions = sheet.querySelector('[data-b="questions"]');
    const questionsHeading = questions?.previousElementSibling;
    // Starting 2026-11-22, the left column holds worship order; the right
    // column holds worship committee, cooperation and one application question.
    left.prepend(order);
    if (committee && committeeHeading) right.prepend(committeeHeading, committee);
    if (sponsors && sponsorsHeading) right.append(sponsorsHeading, sponsors);
    if (questions && questionsHeading) right.append(questionsHeading, questions);
    pages.dataset.worshipLayout = orderEffectiveDate;
    if (questions) Array.from(questions.querySelectorAll('li')).slice(1).forEach(item => item.remove());

    if (!document.querySelector('link[data-worship-layout-css]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.dataset.worshipLayoutCss = orderEffectiveDate;
      css.href = new URL('./bulletin-layout-20261122.css', script.src).href;
      document.head.appendChild(css);
    }
  }

  function table(head, body, extra = '') {
    return `<table class="bp-grid ${extra}">${head.length ? '<tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>' : ''}${body.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('')}</table>`;
  }

  function render(b, photoUrl) {
    if (b) {
      const week = rows(b.week);
      if (week.length && block('week')) block('week').innerHTML = `<table class="bp-week"><tr>${week.map(r => `<th>${esc(r[0])}</th>`).join('')}</tr><tr>${week.map(r => `<td>${esc(r[1] || '')}</td>`).join('')}</tr></table>`;
      if (Array.isArray(b.announce) && block('announce')) block('announce').innerHTML = '<ul class="bp-ann">' + b.announce.filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('') + '</ul>';
      const serve = rows(b.serve);
      if (serve.length && block('serve')) {
        const pairs = [];
        for (let i = 0; i < serve.length; i += 2) pairs.push([...(serve[i] || ['', '']).slice(0, 2), ...((serve[i + 1] || ['', '']).slice(0, 2))]);
        block('serve').innerHTML = table(['구분', '이름', '구분', '이름'], pairs, 'bp-serve');
      }
      const stats = rows(b.stats);
      if (stats.length && block('stats')) {
        const pairs = [];
        for (let i = 0; i < stats.length; i += 2) pairs.push([...(stats[i] || []).concat(['', '', '', '']).slice(0, 4), ...((stats[i + 1] || []).concat(['', '', '', '']).slice(0, 4))]);
        block('stats').innerHTML = table(['구분', '장소', '시간', '인원', '구분', '장소', '시간', '인원'], pairs);
      }
      const committee = rows(b.committee);
      if (!hasNewOrder && committee.length > 1 && block('committee')) block('committee').innerHTML = table(committee[0], committee.slice(1));
      if (Array.isArray(b.sponsors) && block('sponsors')) block('sponsors').innerHTML = '<ul class="bp-sponsors">' + b.sponsors.filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('') + '</ul>';
      if (Array.isArray(b.questions) && block('questions')) block('questions').innerHTML = '<ol class="bp-q">' + b.questions.filter(Boolean).slice(0, hasNewOrder ? 1 : undefined).map(a => `<li>${esc(a)}</li>`).join('') + '</ol>';
    }
    const photo = block('photo');
    if (photo) {
      // Photo slot: an uploaded photo, a public Google Drive photo, a blank
      // space, or a short text — chosen in My Page.
      const mode = (b && b.photoMode) || (photoUrl ? 'photo' : '');
      const img = photo.querySelector('img');
      const cap = photo.querySelector('figcaption');
      const allowed = /^https:\/\/(renzehysxirjilvdxacv\.supabase\.co\/storage\/v1\/object\/public\/church-bulletin\/|drive\.google\.com\/thumbnail\?id=[\w-]+&sz=w\d+$)/;
      photo.classList.remove('bp-photo-blank', 'bp-photo-text');
      let note = photo.querySelector('.bp-photo-note');
      if (mode === 'photo' && photoUrl && allowed.test(photoUrl)) {
        img.hidden = false; img.src = photoUrl; img.alt = (b && b.photoCaption) || '';
        cap.textContent = (b && b.photoCaption) || '';
        if (note) note.remove();
        photo.hidden = false;
      } else if (mode === 'blank' || mode === 'text') {
        img.hidden = true; img.removeAttribute('src'); cap.textContent = '';
        photo.classList.add(mode === 'blank' ? 'bp-photo-blank' : 'bp-photo-text');
        if (mode === 'text') {
          if (!note) { note = document.createElement('p'); note.className = 'bp-photo-note'; photo.prepend(note); }
          note.textContent = (b && b.photoText) || '';
        } else if (note) note.remove();
        photo.hidden = false;
      }
    }
  }


  // Annual register (one record per Sunday) is the single source of truth
  // for all bulletins on or after 2026-11-22. Site-admin changes to a date
  // update only that date. The Git-tracked verified seed is a safe fallback
  // until the guarded migration has been deployed.
  const committeeKeys = [
    ['praise_leader', '경배찬양'],
    ['worship_leader', '예배인도'],
    ['prayer_leader', '대표기도'],
    ['preacher', '말씀선포'],
    ['meal_coordinator', '식사준비']
  ];
  const pad = value => String(value).padStart(2,'0');
  const datePlusDays = (day, delta) => {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0,10);
  };
  const committeeWeekDates = day => [-7, 0, 7, 14, 21].map(delta => datePlusDays(day, delta));
  function committeeDisplay(records) {
    const host = block('committee');
    if (!host || !hasNewOrder) return;
    const dates = committeeWeekDates(date);
    const byDay = new Map(records.filter(v => v && /^\\d{4}-\\d{2}-\\d{2}$/.test(v.service_date || v.date))
      .map(v => [v.service_date || v.date, v]));
    const header = '<tr><th scope="col">구분</th>' + dates.map((day, i) =>
      '<th scope="col"' + (i === 1 ? ' class="bp-now" aria-label="이번 주 ' + esc(day) + '"' : '') + '>' +
      esc(day.slice(5).replace('-', '/')) + (i === 1 ? '<small class="bp-week-label">이번주</small>' : '') + '</th>').join('') + '</tr>';
    const body = committeeKeys.map(([key,label]) =>
      '<tr><th scope="row">' + esc(label) + '</th>' + dates.map((day,i) => {
        const value = String(byDay.get(day)?.[key] || '').trim();
        return '<td' + (i === 1 ? ' class="bp-now"' : '') + '>' + esc(value || '확인필요') + '</td>';
      }).join('') + '</tr>').join('');
    host.innerHTML = '<table class="bp-grid bp-committee-annual">' + header + body + '</table>';
  }
  async function loadAnnualCommittee() {
    if (!hasNewOrder) return;
    let verified = [];
    try {
      const url = new URL('./committee-' + date.slice(0,4) + '.json', script.src);
      const r = await fetch(url, {cache:'no-store'});
      const data = r.ok ? await r.json() : null;
      if (data?.schema === 'ekodi.church.annual-worship-committee.v1') verified = data.records || [];
    } catch { /* unknown year, no invented roster */ }
    committeeDisplay(verified);
    try {
      const first = date.slice(0,4) + '-01-01';
      const last = String(Number(date.slice(0,4)) + 1) + '-01-01';
      const query = '?select=service_date,praise_leader,worship_leader,prayer_leader,preacher,meal_coordinator'
        + '&service_date=gte.' + first + '&service_date=lt.' + last + '&order=service_date.asc';
      const url = SUPABASE_URL + '/rest/v1/church_worship_committee_assignments' + query;
      const key = token();
      const response = await fetch(url, {headers:{apikey:KEY,authorization:'Bearer ' + (key || KEY),accept:'application/json'},cache:'no-store'});
      if (!response.ok) return;
      const changed = await response.json();
      if (!Array.isArray(changed)) return;
      const merged = new Map(verified.map(v => [v.service_date || v.date,v]));
      for(const row of changed) merged.set(row.service_date,row);
      committeeDisplay(Array.from(merged.values()));
    } catch { /* static verified register remains readable */ }
  }

  async function load() {
    const key = token();
    const url = `${SUPABASE_URL}/rest/v1/church_worship_materials?select=bulletin,photo_url&service_type=eq.sunday&service_date=eq.${date}&limit=1`;
    const response = await fetch(url, { headers: { apikey: KEY, authorization: 'Bearer ' + (key || KEY) }, cache: 'no-store' });
    if (!response.ok) return;
    const list = await response.json();
    const row = Array.isArray(list) ? list[0] : null;
    if (row) render(row.bulletin, row.photo_url);
  }
  applyNewWorshipLayout();
  load().catch(() => { /* keep the prepared bulletin */ }).finally(() => { void loadAnnualCommittee(); });
})();
