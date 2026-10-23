/* Local-only discovery of the verified learning destinations shown on the home page.
 * This is NOT a live course inventory or an enrollment interface.
 * No browsing terms or personal data are transmitted or persisted. */
(() => {
  'use strict';
  const form = document.querySelector('#learningSearch');
  const query = document.querySelector('#learningQuery');
  const entries = Array.from(document.querySelectorAll('#learningResults .path-card'));
  const categories = Array.from(document.querySelectorAll('#discover [data-category]'));
  const result = document.querySelector('#learningResult');
  const clear = document.querySelector('#learningClear');
  const empty = document.querySelector('#learningEmpty');
  const target = document.querySelector('#learningPath');
  if (!form || !query || !entries.length || !result || !clear || !empty || !target) return;

  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
  let selectedCategory = '';

  function updateResults() {
    const term = normalize(query.value);
    let count = 0;
    for (const entry of entries) {
      const tags = (entry.getAttribute('data-path-category') || '').split(/\s+/);
      const index = normalize((entry.getAttribute('data-search') || '') + ' ' + entry.textContent);
      const match = (!selectedCategory || tags.includes(selectedCategory)) && (!term || index.includes(term));
      entry.hidden = !match;
      if (match) count++;
    }
    for (const category of categories) {
      if (category.dataset.category === selectedCategory) category.setAttribute('aria-current', 'true');
      else category.removeAttribute('aria-current');
    }
    const selectedText = categories.find(item => item.dataset.category === selectedCategory)?.querySelector('strong')?.textContent;
    const detail = [selectedText, term ? '“' + query.value.trim() + '” 검색' : ''].filter(Boolean).join(' · ');
    result.textContent = (detail ? detail + ' — ' : '') + count + '개 / 전체 ' + entries.length + '개 학습경로';
    clear.hidden = !selectedCategory && !term;
    empty.hidden = count !== 0;
  }

  categories.forEach(category => category.addEventListener('click', () => {
    selectedCategory = selectedCategory === category.dataset.category ? '' : category.dataset.category;
    updateResults();
    // The native hash link remains functional even when JavaScript is disabled.
  }));

  form.addEventListener('submit', event => {
    event.preventDefault();
    // A new text search explores all pathways, not the previously selected category.
    selectedCategory = '';
    updateResults();
    target.scrollIntoView({ block: 'start' });
    history.replaceState(history.state, '', location.pathname + location.search + '#learningPath');
  });
  query.addEventListener('input', updateResults);
  clear.addEventListener('click', () => {
    selectedCategory = '';
    query.value = '';
    updateResults();
    target.scrollIntoView({ block: 'start' });
  });
  updateResults();
})();
