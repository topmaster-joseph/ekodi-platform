(() => {
  window.addEventListener('ekodi:books-open-publication', event => {
    const id = String(event.detail?.id || '');
    if (!id) return;
    document.querySelector('[data-books-tab="publications"]')?.click();
    setTimeout(() => {
      const rows = [...document.querySelectorAll('#booksPublicationList .books-row')];
      const target = rows.find(row => String(row.querySelector('.books-row-main small')?.textContent || '').includes(id));
      target?.querySelector('.books-row-actions .primary')?.click();
    }, 80);
  });
})();
