(() => {
  'use strict';

  const FINANCE_API = 'https://finance-api.ekodi.kr';
  const ORGANIZATION_ID = 'EKODIBIZ';
  const HOMETAX_URL = 'https://www.hometax.go.kr';
  let readiness = null;
  let invoices = [];
  let refreshTimer = 0;

  function token() {
    try { return sessionStorage.getItem('ekodi-auth-token') || ''; } catch { return ''; }
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${FINANCE_API}${path}`, { ...options, headers, cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || `Finance 요청 실패 (${response.status})`);
    return data;
  }

  function won(value) {
    return `₩${Math.round(Number(value) || 0).toLocaleString('ko-KR')}`;
  }

  function workspace() {
    return document.querySelector('#taxInvoiceWorkspace');
  }

  function ensureBanner() {
    const root = workspace();
    if (!root) return false;

    const copy = root.querySelector('.operations-copy');
    if (copy) {
      copy.textContent = '무료 기본 운영: 에코디에서 작성·관리하고 홈택스에서 무료 최종발행합니다. 이용량이 커지면 준비된 API 자동화 엔진을 선택적으로 켭니다.';
    }

    if (!root.querySelector('#taxFreeFirstPolicy')) {
      const banner = document.createElement('div');
      banner.id = 'taxFreeFirstPolicy';
      banner.className = 'tax-invoice-notice good';
      banner.innerHTML = '<strong>FREE-FIRST</strong> 기본 운영비 0원을 우선합니다. 유료 API는 자동으로 켜지지 않으며, 별도 운영 승인이 있을 때만 활성화됩니다.';
      const status = root.querySelector('.tax-invoice-status');
      status?.insertAdjacentElement('afterend', banner);
    }
    return true;
  }

  function renderMode() {
    if (!readiness || !ensureBanner()) return;
    const environment = document.querySelector('#taxEnvironment');
    const provider = document.querySelector('#taxProvider');
    const notice = document.querySelector('#taxInvoiceNotice');

    if (environment) {
      environment.textContent = readiness.automationEnabled ? 'API 자동화 선택됨' : 'HomeTax 무료';
      environment.className = 'finance-ready';
    }
    if (provider) {
      provider.textContent = readiness.automationEnabled
        ? `${readiness.paidAutomationProvider || 'POPBILL'} · 선택적 자동화`
        : '홈택스 · 무료 기본';
    }
    if (notice) {
      if (readiness.automationEnabled) {
        notice.textContent = readiness.automationReady
          ? '유료 API 자동화가 명시적으로 활성화된 상태입니다. 관리자 승인 후에만 발행됩니다.'
          : 'API 자동화 스위치는 켜져 있지만 공급자 키가 없어 실제 자동발행은 잠겨 있습니다. 홈택스 무료 발행은 계속 사용할 수 있습니다.';
      } else {
        notice.textContent = '현재 기본 경로는 홈택스 무료 발행입니다. 거래처·품목·금액·이력은 에코디가 관리하고, 최종 발행만 홈택스에서 처리합니다.';
      }
      notice.className = 'tax-invoice-notice good';
    }
  }

  function actionButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
    return button;
  }

  async function copyForHometax(invoice) {
    try {
      const { invoice: detail } = await request(`/api/finance/tax-invoices/${invoice.id}`);
      const lines = [
        '[에코디 세금계산서 홈택스 입력자료]',
        `작성일: ${detail.writeDate || ''}`,
        `문서번호: ${detail.documentNo || ''}`,
        `영수/청구: ${detail.purposeType || ''}`,
        `과세구분: ${detail.taxType || ''}`,
        '',
        '[공급자]',
        `사업자번호: ${detail.invoicer?.corpNum || ''}`,
        `상호: ${detail.invoicer?.corpName || ''}`,
        `대표자: ${detail.invoicer?.ceoName || ''}`,
        `주소: ${detail.invoicer?.addr || ''}`,
        `업태: ${detail.invoicer?.bizType || ''}`,
        `종목: ${detail.invoicer?.bizClass || ''}`,
        '',
        '[공급받는자]',
        `사업자번호: ${detail.invoicee?.corpNum || ''}`,
        `상호: ${detail.invoicee?.corpName || ''}`,
        `대표자: ${detail.invoicee?.ceoName || ''}`,
        `주소: ${detail.invoicee?.addr || ''}`,
        `업태: ${detail.invoicee?.bizType || ''}`,
        `종목: ${detail.invoicee?.bizClass || ''}`,
        `이메일: ${detail.invoicee?.email || ''}`,
        '',
        '[금액]',
        `공급가액: ${detail.supplyAmount || 0}`,
        `세액: ${detail.taxAmount || 0}`,
        `합계: ${detail.totalAmount || 0}`,
        '',
        '[품목]',
        ...(detail.items || []).map((item, index) => `${index + 1}. ${item.itemName || ''} / 수량 ${item.qty || '1'} / 공급가액 ${item.supplyCost || 0} / 세액 ${item.tax || 0}`)
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      alert('홈택스 입력용 세금계산서 정보가 클립보드에 복사되었습니다.');
    } catch (error) {
      alert(error.message);
    }
  }

  function openHometax() {
    window.open(readiness?.hometaxUrl || HOMETAX_URL, '_blank', 'noopener,noreferrer');
  }

  async function recordManualIssue(invoice) {
    const confirmNum = prompt(
      `${invoice.invoicee?.corpName || '거래처'} · ${won(invoice.totalAmount)}\n홈택스에서 발행을 완료했다면 국세청 승인번호를 입력하세요.\n승인번호를 아직 확인하지 못했다면 비워둔 채 확인을 눌러도 됩니다.`
    );
    if (confirmNum === null) return;
    const ok = confirm('홈택스에서 실제 발행을 완료한 것이 맞습니까? 이 작업은 에코디 내부 발행대장에 완료 기록을 남깁니다.');
    if (!ok) return;
    try {
      await request(`/api/finance/tax-invoices/${invoice.id}/manual-issued`, {
        method: 'POST',
        body: JSON.stringify({ ntsConfirmNum: confirmNum.trim() })
      });
      await refresh(true);
      document.querySelector('#taxInvoiceRefresh')?.click();
    } catch (error) {
      alert(error.message);
    }
  }

  function enhanceRows() {
    const tbody = document.querySelector('#taxInvoiceRows');
    if (!tbody || !invoices.length) return;
    const byDocument = new Map(invoices.map(invoice => [invoice.documentNo, invoice]));

    tbody.querySelectorAll('tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 8) return;
      const documentNo = cells[1]?.textContent?.trim();
      const invoice = byDocument.get(documentNo);
      if (!invoice) return;
      const action = cells[cells.length - 1];
      const key = `${invoice.id}:${invoice.status}:${invoice.provider}:${Boolean(readiness?.automationEnabled)}`;
      if (action.dataset.freeFirstKey === key) return;
      action.dataset.freeFirstKey = key;

      if (!readiness?.automationEnabled) {
        action.querySelectorAll('button').forEach(button => {
          const label = button.textContent?.trim() || '';
          if (label === '발행' || label === '샌드박스 발행') button.remove();
          if (invoice.provider === 'HOMETAX_MANUAL' && label === '상태 확인') button.remove();
        });
      }

      if (invoice.status === 'APPROVED' && !readiness?.automationEnabled) {
        action.append(
          actionButton('정보 복사', 'ghost compact', () => copyForHometax(invoice)),
          actionButton('홈택스 열기', 'secondary compact', openHometax),
          actionButton('발행완료 기록', 'primary compact', () => recordManualIssue(invoice))
        );
      }
    });
  }

  async function refresh(force = false) {
    if (!token() || !ensureBanner()) return;
    try {
      const suffix = force ? `&_=${Date.now()}` : '';
      const [ready, list] = await Promise.all([
        request(`/api/finance/tax-invoices/readiness?organizationId=${ORGANIZATION_ID}${suffix}`),
        request(`/api/finance/tax-invoices?organizationId=${ORGANIZATION_ID}&limit=100${suffix}`)
      ]);
      readiness = ready;
      invoices = list.invoices || [];
      renderMode();
      enhanceRows();
    } catch (error) {
      console.warn('[EKODI Finance] free-first admin refresh failed', error);
    }
  }

  function scheduleRefresh(delay = 450) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refresh(true), delay);
  }

  function install() {
    if (!ensureBanner()) return false;
    const root = workspace();
    if (root.dataset.freeFirstInstalled === 'true') return true;
    root.dataset.freeFirstInstalled = 'true';

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.id === 'taxInvoiceRefresh' || button.textContent?.includes('승인') || button.textContent?.includes('저장')) {
        scheduleRefresh(900);
      }
    });

    const observer = new MutationObserver(() => {
      renderMode();
      enhanceRows();
    });
    const tbody = document.querySelector('#taxInvoiceRows');
    if (tbody) observer.observe(tbody, { childList: true, subtree: true });

    refresh(false);
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('ekodi-finance-overview', () => scheduleRefresh(250));
})();
