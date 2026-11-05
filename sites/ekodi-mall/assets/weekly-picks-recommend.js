// Weekly picks owns AI discovery. Legacy Mall links can pass a safe query via ?q=.
(() => {
  'use strict';
  const input = document.getElementById('contextInput');
  const form = document.getElementById('contextForm');
  if (!input || !form) return;
  const query = new URL(window.location.href).searchParams.get('q');
  if (!query) return;
  input.value = query.trim().slice(0, 180);
  if (input.value && window.EkodiContextCurator?.recommend) {
    // The existing curator only uses approved public HTTPS affiliate offers.
    void window.EkodiContextCurator.recommend(input.value, false);
  }
})();
