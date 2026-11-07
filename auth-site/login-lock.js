// One login at a time (owner request 2026-11-07): while one channel is signing in, every
// other login button on the page is disabled and a bold "로그인 중" message is shown.
// A failed or cancelled attempt unlocks everything again.
const BUSY_ATTR = 'data-ekodi-login-busy';
const LOCK_MARK = 'loginLockDisabled';
const CONTROLS = '#signedOut button:not(#cancelSignedOut), #signedOut input, #signedOut select, .federated-btn';

export function isLoginBusy() {
  return document.documentElement.hasAttribute(BUSY_ATTR);
}

export function busyMessage(label) {
  const name = String(label || '').trim();
  return `${name ? `${name} ` : ''}로그인 중입니다. 완료될 때까지 다른 로그인 버튼은 누를 수 없습니다.`;
}

export function lockLogin(label, message) {
  document.documentElement.setAttribute(BUSY_ATTR, String(label || 'login'));
  document.querySelectorAll(CONTROLS).forEach(control => {
    if (control.disabled) return;
    control.dataset[LOCK_MARK] = '1';
    control.disabled = true;
  });
  const status = document.getElementById('authStatus');
  if (status) {
    status.textContent = message || busyMessage(label);
    status.className = 'notice busy';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
  }
}

export function unlockLogin() {
  document.documentElement.removeAttribute(BUSY_ATTR);
  document.querySelectorAll(`[data-login-lock-disabled]`).forEach(control => {
    delete control.dataset[LOCK_MARK];
    control.disabled = false;
  });
}

// Google's button lives in an iframe and opens its own account chooser, so its click is
// seen only as the page losing focus to that iframe. Lock while it is open; if the chooser
// closes without a credential, unlock shortly after the page regains focus.
export function watchGoogleButton(host, isHandling) {
  if (!host || host.dataset.loginLockWatch) return;
  host.dataset.loginLockWatch = '1';
  let openedByGoogle = false;
  window.addEventListener('blur', () => {
    const active = document.activeElement;
    if (active?.tagName === 'IFRAME' && host.contains(active) && !isLoginBusy()) {
      openedByGoogle = true;
      lockLogin('Google');
    }
  });
  window.addEventListener('focus', () => {
    if (!openedByGoogle) return;
    setTimeout(() => {
      if (openedByGoogle && !isHandling()) { openedByGoogle = false; unlockLogin(); }
    }, 1500);
  });
  return { settle() { openedByGoogle = false; } };
}
