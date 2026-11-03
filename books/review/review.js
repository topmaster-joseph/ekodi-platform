// BOOKS-EDITION-APPROVAL-001 — 출판 최종 확정 화면(운영자 전용, 권한은 서버가 검사)
(() => {
  'use strict';
  const C = window.EkodiBooksCommerce;
  const $ = id => document.getElementById(id);
  const bookId = (new URLSearchParams(location.search).get('book') || '').toUpperCase();
  let state = null, opened = false;
  const row = (dl, k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
  function refreshButton() { $('approve').disabled = !(opened && $('rights').checked && $('reviewed').checked && $('edition').value.trim() && state?.file); }
  async function authed(path, init = {}) {
    const s = await C.session();
    return fetch(`${C.BASE}/api/commerce/${path}`, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + (s?.accessToken || '') }, cache: 'no-store' });
  }
  function render() {
    const { file, approval, readiness, catalog } = state;
    $('reviewRoot').hidden = false;
    const dl = $('fileInfo'); dl.replaceChildren();
    row(dl, '도서', catalog.title || bookId);
    row(dl, '저자', catalog.author || '미입력');
    row(dl, '도서코드', bookId);
    row(dl, '파일', file ? `${(file.size / 1024).toFixed(0)}KB · ${file.uploaded ? new Date(file.uploaded).toLocaleString('ko-KR') : ''} 업로드` : '보관함에 파일 없음');
    row(dl, '현재 상태', readiness.ready ? `판매 가능 (${readiness.source === 'approval' ? '출판 확정' : '카탈로그 기록'})` : readiness.label || '판매 준비 중');
    $('price').textContent = `${Number(catalog.listPrice || 0).toLocaleString('ko-KR')}원 (서점 등록 가격)`;
    const stageNames = { manuscript: '원고', editing: '편집', epub: 'EPUB', cover: '표지', metadata: '메타데이터' };
    const verified = { manuscript: 'complete', editing: 'complete', epub: 'validated', cover: 'complete', metadata: 'ready' };
    const pending = Object.entries(stageNames).filter(([key]) => catalog.workflow?.[key] !== verified[key]).map(([, name]) => name);
    $('readinessNote').textContent = pending.length
      ? `출판 공정 확인 필요: ${pending.join('·')}. 승인 전에 실제 완성본과 권리를 점검해 주세요.`
      : '카탈로그 출판 공정 확인 완료. 최종 판매 파일과 권리는 별도로 검토해 주세요.';
    $('readinessNote').className = pending.length ? 'review-readiness warn' : 'review-readiness ok';
    // 판본 이름은 기본값을 미리 채운다(필요할 때만 수정). 판권 확인 체크는 사람이 직접 한다.
    if (!$('edition').value) $('edition').value = approval?.edition || catalog.edition || '전자책 초판 v1.0';
    $('openReader').disabled = !file;
    $('approvalState').className = approval?.fileMatches ? 'ok' : 'warn';
    $('approvalState').textContent = approval
      ? (approval.fileMatches ? `확정됨 · ${approval.edition} · ${approval.approved_by} · ${new Date(approval.approved_at).toLocaleString('ko-KR')}` : '이전 확정 이후 판매 파일이 바뀌어 확정이 해제되었습니다. 다시 검토해 주세요.')
      : '아직 확정되지 않았습니다.';
    $('revoke').hidden = !approval;
    refreshButton();
  }
  async function load() {
    if (!bookId) { $('reviewStatus').textContent = '도서를 지정해 주세요.'; return; }
    try {
      state = await C.api(`admin/approvals/${encodeURIComponent(bookId)}`);
      $('reviewLogin').hidden = true; $('reviewStatus').textContent = '';
      $('reviewTitle').textContent = `출판 최종 확정 · ${state.catalog.title || bookId}`;
      $('reviewBookMeta').textContent = `${state.catalog.author || '저자 미입력'} · ${bookId}`;
      render();
    } catch (e) {
      if (e.status === 401) { $('reviewLogin').hidden = false; $('reviewStatus').textContent = '운영자 계정으로 로그인해 주세요.'; }
      else $('reviewStatus').textContent = e.status === 403 ? '운영자만 사용할 수 있는 화면입니다.' : e.message;
    }
  }
  $('openReader').addEventListener('click', async () => {
    const b = $('openReader'); b.disabled = true; b.textContent = '여는 중…';
    try {
      const r = await authed(`admin/files/${encodeURIComponent(bookId)}/content`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '파일을 열지 못했습니다.');
      await window.EkodiEpubReader.open(await r.arrayBuffer(), { title: `검토 · ${bookId}`, notice: '출판 확정 전 검토 화면입니다. 독자에게는 아직 보이지 않습니다.' });
      opened = true; $('readNote').textContent = '내용을 펼쳐 확인했습니다.'; $('readNote').className = 'ok';
    } catch (e) { alert(e.message); }
    finally { b.disabled = false; b.textContent = '내용 펼쳐 보기'; refreshButton(); }
  });
  ['rights', 'reviewed', 'edition'].forEach(id => $(id).addEventListener('input', refreshButton));
  $('approve').addEventListener('click', async () => {
    if (!confirm(`${bookId}의 판권·판본을 확정하고 에코디서점 판매를 엽니다. 계속할까요?`)) return;
    const r = await authed(`admin/approvals/${encodeURIComponent(bookId)}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ edition: $('edition').value.trim(), listPrice: state.catalog.listPrice, rightsConfirmed: $('rights').checked, contentReviewed: $('reviewed').checked, note: $('note').value, fileEtag: state.file?.etag }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { alert(d.error || '확정하지 못했습니다.'); return; }
    alert(d.readiness?.ready ? '출판 승인 기록이 저장되었습니다. 판매 파일·결제 환경·실제 구매 화면을 별도로 확인해 주세요.' : '출판 승인 기록이 저장되었지만 판매 준비가 완료되지 않았습니다. 상태를 확인해 주세요.');
    await load();
  });
  $('revoke').addEventListener('click', async () => {
    if (!confirm('확정을 취소하면 이 도서의 신규 판매가 즉시 중지됩니다. 계속할까요?')) return;
    const r = await authed(`admin/approvals/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
    if (!r.ok) { alert('취소하지 못했습니다.'); return; }
    load();
  });
  C.mountGoogle($('googleButton'), (t, err) => { $('accountStatus').textContent = t || ''; }, load);
  load();
})();
