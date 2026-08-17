(() => {
  const authButton = document.getElementById('authButton');
  const guestButton = document.getElementById('guestAuthButton');
  const guestEntry = document.getElementById('guestEntry');
  const authOnly = [...document.querySelectorAll('[data-auth-only]')];
  const nav = document.querySelector('.topbar nav');

  function sync() {
    const signedIn = (authButton?.textContent || '').trim() === 'My에서 나가기';
    document.body.dataset.authState = signedIn ? 'member' : 'guest';

    authOnly.forEach((element) => {
      element.hidden = !signedIn;
    });

    if (guestEntry) guestEntry.hidden = signedIn;
    if (nav) nav.hidden = !signedIn;

    if (!signedIn) {
      ['serviceCount', 'paidCount', 'workspaceCount', 'creatorCount'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
      });
    }
  }

  guestButton?.addEventListener('click', () => authButton?.click());

  if (authButton) {
    new MutationObserver(sync).observe(authButton, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  sync();
})();