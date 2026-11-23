'use strict';
(() => {
  const tableBody = document.getElementById('libraryRows');
  const notice = document.getElementById('libraryStatus');
  const input = document.getElementById('librarySearch');
  const category = document.getElementById('libraryCategory');
  const filterButtons = [...document.querySelectorAll('[data-library-scope]')];
  if (!tableBody || !notice || !input || !category) return;
  let records = [];
  const queryScope = new URLSearchParams(location.search).get('scope');
  let scope = queryScope === '선교부' || queryScope === '총회' || queryScope === '노회' ? queryScope : '전체';
  const text = (value) => String(value == null ? '' : value);
  const element = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value != null) node.textContent = text(value);
    if (className) node.className = className;
    return node;
  };
  function safeUrl(value) {
    if (typeof value !== 'string' || !value.trim() || value.startsWith('//')) return null;
    if (value.startsWith('/')) return /^\/(?!\/)[a-zA-Z0-9/_.,%()~+\-]+$/.test(value) ? value : null;
    try {
      const u = new URL(value);
      return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
    } catch { return null; }
  }
  function link(label, url) {
    const href = safeUrl(url);
    if (!href) return null;
    const anchor = element('a', label);
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function renderDetail(record, detail) {
    detail.append(element('p', record.summary || '설명 정보가 없습니다.'));
    if (typeof record.content === 'string' && record.content.trim()) {
      detail.append(element('strong', '원본 내용'));
      detail.append(element('div', record.content, 'original-text'));
    } else {
      detail.append(element('p', '원본 전문은 아직 확보·검증되지 않았습니다. 요약을 원본으로 대체하지 않습니다.', 'minor'));
    }
    const actions = element('div', null, 'resource-links');
    const postLink = link('카페 원게시글', record.source && record.source.post_url);
    const listingLink = link('현재 참고 목록', record.source && record.source.listed_url);
    const cafeLink = link('공식 카페', record.source && record.source.cafe_url);
    if (postLink) actions.append(postLink);
    if (listingLink) actions.append(listingLink);
    if (!postLink && cafeLink) actions.append(cafeLink);
    detail.append(actions);
    const files = Array.isArray(record.attachments) ? record.attachments : [];
    detail.append(element('strong', '첨부파일 (' + files.length + ')'));
    if (files.length) {
      const list = element('ul', null, 'file-list');
      for (const file of files) {
        const li = element('li');
        li.append(element('span', file.name || '파일'));
        const original = link('원본 첨부', file.original_url);
        const mirror = link('보존본', file.mirror_url);
        if (original) li.append(' · ', original);
        if (mirror && record.state === 'approved_mirror') li.append(' · ', mirror);
        list.append(li);
      }
      detail.append(list);
    } else detail.append(element('p', '확인된 첨부파일이 없습니다. 파일이 없는 것으로 확정한 것은 아닙니다.', 'minor'));
    const verified = record.source && record.source.verified_at;
    detail.append(element('p', '원문 확인일: ' + (verified || '미확인') + ' · 원본의 수정 여부는 공식 출처에서 최종 확인해 주세요.', 'minor'));
  }
  function render() {
    const q = input.value.trim().toLocaleLowerCase('ko');
    const selectedCategory = category.value;
    filterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.libraryScope === scope)));
    const matched = records.filter(r => {
      const audiences = Array.isArray(r.audiences) ? r.audiences : [];
      const textValue = [r.title, r.scope, r.category, r.summary, ...(r.purposes || [])].join(' ').toLocaleLowerCase('ko');
      return (scope === '전체' || audiences.includes(scope) || r.scope === scope)
        && (selectedCategory === '전체' || r.category === selectedCategory)
        && (!q || textValue.includes(q));
    });
    tableBody.replaceChildren();
    for (const r of matched) {
      const tr = element('tr');
      tr.append(element('td', r.scope || '-'));
      tr.append(element('td', r.category || '-'));
      const titleCell = element('td');
      const details = element('details');
      details.append(element('summary', r.title));
      const content = element('div', null, 'detail');
      renderDetail(r, content);
      details.append(content);
      titleCell.append(details);
      tr.append(titleCell);
      tr.append(element('td', r.issued_on || '미확인'));
      const stateCell = element('td');
      stateCell.append(element('span', r.state === 'approved_mirror' ? '원본 확인' : '원본 미확인', 'flag' + (r.state === 'approved_mirror' ? ' ready' : '')));
      tr.append(stateCell);
      tableBody.append(tr);
    }
    notice.textContent = matched.length + '건 표시 / 전체 ' + records.length + '건 · 마지막 목록 정리: 2026.11.16';
    const empty = document.getElementById('libraryEmpty');
    if (empty) empty.hidden = matched.length !== 0;
  }
  input.addEventListener('input', render);
  category.addEventListener('change', render);
  for (const button of filterButtons) button.addEventListener('click', () => { scope = button.dataset.libraryScope; render(); });
  fetch('/mokpo-presbytery/library/catalog.json', { cache: 'no-store', credentials: 'omit' })
    .then(response => { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
    .then(data => {
      if (data.schema_version !== 1 || !Array.isArray(data.records)) throw new Error('자료 목록 형식 오류');
      records = data.records.filter(r => r && typeof r.title === 'string' && ['metadata_only', 'approved_mirror'].includes(r.state));
      render();
    })
    .catch(() => { notice.textContent = '목록을 불러오지 못했습니다. 공식 카페에서 원본을 확인해 주세요.'; });
})();
