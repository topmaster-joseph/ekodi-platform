(() => {
  const API = 'https://api.ekodi.kr';
  let state = null;
  let installed = false;
  let loaded = false;

  function token() { return sessionStorage.getItem('ekodi-auth-token') || ''; }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Books API 요청 실패 (${response.status})`);
    return data;
  }

  function money(value) {
    const number = Number(value || 0);
    return number ? `${number.toLocaleString('ko-KR')}원` : '무료 / 별도견적';
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function flash(message, error = false) {
    const node = document.querySelector('#booksFlash');
    if (!node) return;
    node.textContent = message || '';
    node.style.color = error ? '#fda4af' : '';
  }

  function install() {
    if (installed) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return;
    installed = true;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.section = 'books';
    button.innerHTML = '▤ <span>Books</span>';
    const finance = nav.querySelector('[data-section="finance"]');
    if (finance) nav.insertBefore(button, finance);
    else nav.append(button);

    const section = document.createElement('section');
    section.id = 'booksAdminSection';
    section.className = 'section books-admin hidden-panel';
    section.dataset.panel = 'books';
    section.innerHTML = `
      <div class="section-head books-head">
        <div><p class="kicker">EKODI BOOKS · PUBLISHING OPERATIONS</p><h2>Books Control</h2><p>출판물, 상담, 출판대행 서비스, 요금과 기능 노출을 한곳에서 관리합니다.</p></div>
        <div class="books-head-actions"><a class="secondary books-public-link" href="https://books.ekodi.kr/publishing/" target="_blank" rel="noopener">Publishing Service ↗</a><button class="secondary" id="refreshBooksAdmin" type="button">↻ Refresh</button></div>
      </div>
      <p class="books-flash" id="booksFlash" role="status"></p>
      <div class="books-tabs" role="tablist">
        <button class="books-tab active" data-books-tab="overview" type="button">Overview</button>
        <button class="books-tab" data-books-tab="publications" type="button">Publications</button>
        <button class="books-tab" data-books-tab="inquiries" type="button">Consultations</button>
        <button class="books-tab" data-books-tab="services" type="button">Pricing & Services</button>
        <button class="books-tab" data-books-tab="features" type="button">Features</button>
      </div>
      <div class="books-pane" data-books-pane="overview">
        <div class="books-metrics" id="booksMetrics"></div>
        <div class="books-list" id="booksOverviewList"></div>
      </div>
      <div class="books-pane" data-books-pane="publications" hidden>
        <div class="books-head-actions" style="margin-bottom:10px"><button class="books-compact-button primary" id="newPublication" type="button">+ New Publication</button></div>
        <div class="books-list" id="booksPublicationList"></div>
        <form class="books-form" id="publicationForm" hidden>
          <div class="books-form-head"><strong id="publicationFormTitle">Publication</strong><button class="books-compact-button" id="closePublicationForm" type="button">Close</button></div>
          <div class="books-form-grid">
            <label>ID<input name="id" maxlength="80" placeholder="ekodi-books-002" required></label>
            <label>Catalog No.<input name="catalogNo" maxlength="80" placeholder="EB-MONO-002"></label>
            <label>Stage<select name="stage"><option>MANUSCRIPT</option><option>EDITING</option><option>DESIGN</option><option>EPUB</option><option>ISBN</option><option>REVIEW</option><option>READY</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label>
            <label>Status<input name="status" maxlength="100" placeholder="Forthcoming · 2026"></label>
            <label class="wide">Title<input name="title" maxlength="200" required></label>
            <label class="wide">Subtitle<input name="subtitle" maxlength="240"></label>
            <label>Author<input name="author" maxlength="160"></label>
            <label>Series<input name="series" maxlength="160" value="EKODI ORIGINAL"></label>
            <label>Series No.<input name="seriesNumber" type="number" min="0"></label>
            <label>Editorial Field<select name="editorialField"><option>Ecclesia</option><option>Koinonia</option><option>Diaspora</option><option>Jubilee</option><option>Other</option></select></label>
            <label class="wide">Publication Type<input name="publicationType" maxlength="160" placeholder="MONOGRAPH · PUBLIC THEOLOGY"></label>
            <label class="wide">Language<input name="languageLabel" maxlength="180" placeholder="한국어"></label>
            <label>Price (KRW)<input name="priceKrw" type="number" min="0" step="100"></label>
            <label>Sort<input name="sortOrder" type="number" value="100"></label>
            <label>Public<select name="isPublic"><option value="false">No</option><option value="true">Yes</option></select></label>
            <label>Edition<input name="edition" maxlength="160"></label>
            <label class="wide">Cover URL<input name="coverImage" maxlength="500"></label>
            <label class="wide">Detail URL<input name="detailUrl" maxlength="500"></label>
            <label>Google ID<input name="googleBooks" maxlength="120"></label>
            <label>ISBN<input name="isbnEbook" maxlength="80"></label>
            <label>Amazon ASIN<input name="amazonAsin" maxlength="80"></label>
            <label>Formats<input name="format" maxlength="220" placeholder="EPUB 3, PDF"></label>
            <label class="full">Abstract<textarea name="abstract" maxlength="4000"></textarea></label>
            <label class="full">Citation<textarea name="citation" maxlength="1000"></textarea></label>
            <label>Google status<input name="distGoogle" maxlength="120"></label>
            <label>Amazon status<input name="distAmazon" maxlength="120"></label>
            <label>Korea status<input name="distKorea" maxlength="120"></label>
          </div>
          <div class="books-form-actions"><button class="books-compact-button" id="deletePublication" type="button" hidden>Delete</button><button class="books-compact-button primary" type="submit">Save Publication</button></div>
        </form>
      </div>
      <div class="books-pane" data-books-pane="inquiries" hidden><div class="books-inquiry-list" id="booksInquiryList"></div></div>
      <div class="books-pane" data-books-pane="services" hidden><div class="books-service-grid" id="booksServiceGrid"></div></div>
      <div class="books-pane" data-books-pane="features" hidden><div class="books-feature-grid" id="booksFeatureGrid"></div></div>
    `;
    content.append(section);

    button.addEventListener('click', () => {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('books'));
      });
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'books'));
      const title = document.querySelector('#pageTitle');
      if (title) title.textContent = 'Books';
      document.querySelector('.sidebar')?.classList.remove('open');
      if (location.hash !== '#books') history.replaceState(null, '', '#books');
      if (!loaded) load();
    });

    section.querySelectorAll('[data-books-tab]').forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.booksTab)));
    section.querySelector('#refreshBooksAdmin').addEventListener('click', load);
    section.querySelector('#newPublication').addEventListener('click', () => openPublication());
    section.querySelector('#closePublicationForm').addEventListener('click', closePublication);
    section.querySelector('#publicationForm').addEventListener('submit', savePublication);
    section.querySelector('#deletePublication').addEventListener('click', removePublication);

    if (location.hash === '#books') setTimeout(() => button.click(), 80);
  }

  function selectTab(name) {
    document.querySelectorAll('[data-books-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.booksTab === name));
    document.querySelectorAll('[data-books-pane]').forEach(pane => { pane.hidden = pane.dataset.booksPane !== name; });
  }

  async function load() {
    if (!token()) { flash('관리자 인증 후 Books 데이터를 불러올 수 있습니다.', true); return; }
    flash('Books 운영정보를 불러오는 중입니다.');
    try {
      state = await request('/api/books/admin/overview');
      loaded = true;
      renderAll();
      flash(`마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`);
    } catch (error) {
      flash(error.message, true);
    }
  }

  function renderAll() {
    renderMetrics();
    renderPublications();
    renderInquiries();
    renderServices();
    renderFeatures();
  }

  function renderMetrics() {
    const metrics = document.querySelector('#booksMetrics');
    metrics.textContent = '';
    const values = [
      ['Publications', state.counts.publications],
      ['Public', state.counts.publicPublications],
      ['In Production', state.counts.inProduction],
      ['New Consults', state.counts.newInquiries],
      ['Open Consults', state.counts.openInquiries],
      ['Services On', state.counts.enabledServices],
    ];
    values.forEach(([label, value]) => {
      const card = el('article', 'books-metric');
      card.append(el('small', '', label), el('strong', '', String(value ?? 0)));
      metrics.append(card);
    });
    const overview = document.querySelector('#booksOverviewList');
    overview.textContent = '';
    const recent = state.publications.slice(0, 5);
    if (!recent.length) overview.append(el('p', 'books-empty', '등록된 출판물이 없습니다.'));
    recent.forEach(book => overview.append(publicationRow(book, false)));
  }

  function publicationRow(book, editable = true) {
    const row = el('article', 'books-row');
    const main = el('div', 'books-row-main');
    main.append(el('strong', '', book.title), el('small', '', `${book.catalogNo || book.id} · ${book.author || '저자 미정'} · ${book.editorialField || ''}`));
    row.append(main, el('span', 'books-stage', book.stage || 'MANUSCRIPT'), el('span', 'books-status-chip', book.isPublic ? 'PUBLIC' : 'PRIVATE'));
    const actions = el('div', 'books-row-actions');
    const open = el('a', 'books-compact-button', 'Public ↗');
    open.href = `https://books.ekodi.kr${book.detailUrl || '/#catalog'}`;
    open.target = '_blank'; open.rel = 'noopener';
    actions.append(open);
    if (editable) {
      const edit = el('button', 'books-compact-button primary', 'Edit');
      edit.type = 'button'; edit.addEventListener('click', () => openPublication(book));
      actions.append(edit);
    }
    row.append(actions);
    return row;
  }

  function renderPublications() {
    const list = document.querySelector('#booksPublicationList');
    list.textContent = '';
    if (!state.publications.length) list.append(el('p', 'books-empty', '등록된 출판물이 없습니다.'));
    state.publications.forEach(book => list.append(publicationRow(book, true)));
  }

  function openPublication(book = null) {
    selectTab('publications');
    const form = document.querySelector('#publicationForm');
    form.hidden = false;
    form.dataset.editId = book?.id || '';
    form.reset();
    form.elements.series.value = 'EKODI ORIGINAL';
    form.elements.sortOrder.value = '100';
    form.elements.stage.value = 'MANUSCRIPT';
    form.elements.editorialField.value = 'Ecclesia';
    form.elements.isPublic.value = 'false';
    document.querySelector('#publicationFormTitle').textContent = book ? `Edit · ${book.title}` : 'New Publication';
    document.querySelector('#deletePublication').hidden = !book;
    form.elements.id.readOnly = Boolean(book);
    if (book) {
      const values = {
        id: book.id, catalogNo: book.catalogNo, stage: book.stage, status: book.status, title: book.title,
        subtitle: book.subtitle, author: book.author, series: book.series, seriesNumber: book.seriesNumber ?? '',
        editorialField: ['Ecclesia','Koinonia','Diaspora','Jubilee','Other'].includes(book.editorialField) ? book.editorialField : 'Other',
        publicationType: book.publicationType, languageLabel: book.languageLabel, priceKrw: book.priceKrw,
        sortOrder: book.sortOrder, isPublic: String(Boolean(book.isPublic)), edition: book.edition, coverImage: book.coverImage,
        detailUrl: book.detailUrl, googleBooks: book.identifiers?.googleBooks, isbnEbook: book.identifiers?.isbnEbook,
        amazonAsin: book.identifiers?.amazonAsin, format: (book.format || []).join(', '), abstract: book.abstract, citation: book.citation,
        distGoogle: book.distribution?.google || '', distAmazon: book.distribution?.amazon || '', distKorea: book.distribution?.korea || '',
      };
      Object.entries(values).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; });
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function closePublication() { document.querySelector('#publicationForm').hidden = true; }

  async function savePublication(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return form.reportValidity();
    const data = new FormData(form);
    const payload = {
      id: String(data.get('id')).trim(), catalogNo: data.get('catalogNo'), stage: data.get('stage'), status: data.get('status'),
      title: data.get('title'), subtitle: data.get('subtitle'), author: data.get('author'), series: data.get('series'),
      seriesNumber: data.get('seriesNumber'), editorialField: data.get('editorialField'), publicationType: data.get('publicationType'),
      languageLabel: data.get('languageLabel'), priceKrw: Number(data.get('priceKrw') || 0), sortOrder: Number(data.get('sortOrder') || 100),
      isPublic: data.get('isPublic') === 'true', edition: data.get('edition'), coverImage: data.get('coverImage'), detailUrl: data.get('detailUrl'),
      identifiers: { googleBooks: data.get('googleBooks'), isbnEbook: data.get('isbnEbook'), amazonAsin: data.get('amazonAsin') },
      format: String(data.get('format') || '').split(',').map(value => value.trim()).filter(Boolean),
      abstract: data.get('abstract'), citation: data.get('citation'),
      distribution: { google: data.get('distGoogle'), amazon: data.get('distAmazon'), korea: data.get('distKorea') },
    };
    const editId = form.dataset.editId;
    flash('출판물 정보를 저장하는 중입니다.');
    try {
      await request(editId ? `/api/books/admin/publications/${encodeURIComponent(editId)}` : '/api/books/admin/publications', {
        method: editId ? 'PUT' : 'POST', body: JSON.stringify(payload),
      });
      closePublication();
      await load();
      selectTab('publications');
      flash('출판물 정보가 저장되었습니다.');
    } catch (error) { flash(error.message, true); }
  }

  async function removePublication() {
    const form = document.querySelector('#publicationForm');
    const id = form.dataset.editId;
    if (!id) return;
    const book = state.publications.find(item => item.id === id);
    if (!confirm(`“${book?.title || id}” 출판 레코드를 삭제할까요? 이 작업은 되돌리기 어렵습니다.`)) return;
    try {
      await request(`/api/books/admin/publications/${encodeURIComponent(id)}`, { method: 'DELETE' });
      closePublication(); await load(); selectTab('publications'); flash('출판 레코드를 삭제했습니다.');
    } catch (error) { flash(error.message, true); }
  }

  function renderInquiries() {
    const list = document.querySelector('#booksInquiryList');
    list.textContent = '';
    if (!state.inquiries.length) { list.append(el('p', 'books-empty', '아직 출판 상담 신청이 없습니다.')); return; }
    state.inquiries.forEach(item => {
      const row = el('article', 'books-inquiry-row');
      const person = el('div', 'books-inquiry-person');
      person.append(el('strong', '', item.name), el('small', '', `${item.email}${item.phone ? ` · ${item.phone}` : ''}`));
      const select = document.createElement('select');
      [['new','NEW'],['reviewing','REVIEWING'],['quoted','QUOTED'],['contracted','CONTRACTED'],['closed','CLOSED']].forEach(([value,label]) => {
        const option = new Option(label, value, false, item.status === value); select.add(option);
      });
      const note = document.createElement('input'); note.placeholder = '관리 메모'; note.value = item.adminNote || '';
      const copy = el('div', 'books-inquiry-copy', `${item.inquiryType} · ${item.manuscriptStage || '단계 미정'} · ${item.desiredChannels || '채널 미정'} · ${item.message || ''}`);
      const save = el('button', 'books-compact-button primary', 'Save'); save.type = 'button';
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await request(`/api/books/admin/inquiries/${item.id}`, { method: 'PUT', body: JSON.stringify({ status: select.value, adminNote: note.value, assignedTo: sessionStorage.getItem('ekodi-admin-email') || '' }) });
          await load(); selectTab('inquiries'); flash('상담 상태를 저장했습니다.');
        } catch (error) { flash(error.message, true); }
        finally { save.disabled = false; }
      });
      row.append(person, select, note, copy, save); list.append(row);
    });
  }

  function renderServices() {
    const grid = document.querySelector('#booksServiceGrid');
    grid.textContent = '';
    state.services.forEach(service => {
      const card = el('article', 'books-service-card');
      const head = document.createElement('header');
      const identity = document.createElement('div'); identity.append(el('strong', '', service.name), el('small', '', `${service.category.toUpperCase()} · ${service.code}`));
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.className = 'books-toggle'; enabled.checked = service.enabled;
      head.append(identity, enabled);
      card.append(head, el('p', '', service.description));
      const fields = el('div', 'books-service-fields');
      const modelLabel = document.createElement('label'); modelLabel.textContent = '가격표시';
      const model = document.createElement('select'); ['fixed','from','quote'].forEach(value => model.add(new Option(value, value, false, service.pricingModel === value))); modelLabel.append(model);
      const priceLabel = document.createElement('label'); priceLabel.textContent = '판매가'; const price = document.createElement('input'); price.type='number'; price.min='0'; price.step='1000'; price.value=service.priceKrw; priceLabel.append(price);
      const compareLabel = document.createElement('label'); compareLabel.textContent = '개별합계'; const compare=document.createElement('input'); compare.type='number'; compare.min='0'; compare.step='1000'; compare.value=service.comparePriceKrw; compareLabel.append(compare);
      fields.append(modelLabel, priceLabel, compareLabel); card.append(fields);
      const footer = el('div', 'books-form-actions');
      const label = el('small', '', `${money(service.priceKrw)} · ${service.unitLabel || ''}`); label.style.marginRight='auto';
      const save = el('button', 'books-compact-button primary', 'Save'); save.type='button';
      save.addEventListener('click', async () => {
        save.disabled=true;
        try { await request(`/api/books/admin/services/${service.code}`, {method:'PUT', body:JSON.stringify({pricingModel:model.value,priceKrw:Number(price.value||0),comparePriceKrw:Number(compare.value||0),enabled:enabled.checked,note:service.note})}); await load(); selectTab('services'); flash('서비스 요금을 저장했습니다.'); }
        catch(error){flash(error.message,true);} finally{save.disabled=false;}
      });
      footer.append(label,save); card.append(footer); grid.append(card);
    });
  }

  function renderFeatures() {
    const grid = document.querySelector('#booksFeatureGrid'); grid.textContent='';
    state.features.forEach(feature => {
      const row = el('article','books-feature');
      const copy=document.createElement('div'); copy.append(el('strong','',feature.label),el('small','',feature.description));
      const toggle=document.createElement('input'); toggle.type='checkbox'; toggle.className='books-toggle'; toggle.checked=feature.enabled;
      toggle.addEventListener('change', async () => {
        toggle.disabled=true;
        try { await request(`/api/books/admin/features/${feature.key}`,{method:'PUT',body:JSON.stringify({enabled:toggle.checked})}); feature.enabled=toggle.checked; flash(`${feature.label} 기능을 ${toggle.checked?'활성화':'비활성화'}했습니다.`); }
        catch(error){toggle.checked=!toggle.checked;flash(error.message,true);} finally{toggle.disabled=false;}
      });
      row.append(copy,toggle);grid.append(row);
    });
  }

  function boot() {
    install();
    const observer = new MutationObserver(() => {
      if (!installed) install();
      if (document.querySelector('#app') && !document.querySelector('#app').hidden && location.hash === '#books' && !loaded) load();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
    setTimeout(() => observer.disconnect(), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();