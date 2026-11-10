// BOOKS-GUEST-OTP-001 — verified mailbox, no EKODI account registration.
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  if (!C) return;
  let readiness;
  async function mount(host) {
    if (!host || host.querySelector('[data-books-guest-otp]')) return;
    try {
      readiness = readiness || await C.api('guest/readiness');
      if (!readiness.available || host.querySelector('[data-books-guest-otp]')) return;
      const panel = document.createElement('form');
      panel.dataset.booksGuestOtp = 'true';
      panel.className = 'books-guest-otp';
      panel.style.cssText = 'margin-top:12px;border:1px solid #d9e2df;border-radius:12px;padding:12px;display:grid;gap:8px';
      const title = document.createElement('strong');
      title.textContent = '회원가입 없이 이메일로 구매';
      const note = document.createElement('small');
      note.textContent = '구매 확인용 이메일 인증만 합니다. 결제 후 같은 이메일을 인증하면 내 서재에서 다시 열람할 수 있습니다.';
      const email = document.createElement('input');
      email.type = 'email'; email.required = true; email.maxLength = 254;
      email.autocomplete = 'email'; email.placeholder = '영수증·열람용 이메일';
      email.setAttribute('aria-label','비회원 구매 이메일');
      const submit = document.createElement('button'); submit.type = 'submit';
      submit.textContent = '이메일 인증번호 받기';
      const code = document.createElement('input'); code.type = 'text';
      code.inputMode = 'numeric'; code.pattern = '[0-9]{6}'; code.minLength = 6; code.maxLength = 6;
      code.placeholder = '6자리 인증번호'; code.setAttribute('aria-label','이메일 인증번호'); code.hidden = true;
      const status = document.createElement('p'); status.style.margin = '0';
      status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
      panel.append(title,note,email,code,submit,status);
      let challengeId = '';
      panel.addEventListener('submit',async event => {
        event.preventDefault();
        if (submit.disabled) return;
        submit.disabled = true;
        status.textContent = '인증을 처리하고 있습니다.';
        try {
          if (!challengeId) {
            const started = await C.api('guest/start',{method:'POST',body:{email:email.value.trim().toLowerCase()}});
            challengeId = started.challengeId;
            code.hidden = false; code.required = true; email.readOnly = true;
            submit.textContent = '인증번호 확인';
            status.textContent = '이메일로 보낸 6자리 인증번호를 입력해 주세요. 10분간 유효합니다.';
          } else {
            await C.api('guest/verify',{method:'POST',body:{challengeId,code:code.value}});
            status.textContent = '비회원 이메일 인증이 완료되었습니다.';
            location.reload(); // Same-origin HttpOnly cookie proves guest identity to the server.
          }
        } catch(error) {
          status.textContent = error?.message || '인증하지 못했습니다. 다시 시도해 주세요.';
        } finally { submit.disabled = false; }
      });
      host.append(panel);
    } catch { /* Not ready: leave the approved login flow untouched. */ }
  }
  window.EkodiBooksGuestCheckout = { mount };
  document.addEventListener('DOMContentLoaded', () => {
    const bookLogin = document.getElementById('signedOut');
    if (bookLogin) void mount(bookLogin);
  });
})();
