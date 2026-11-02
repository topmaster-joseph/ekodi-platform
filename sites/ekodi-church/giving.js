(() => {
  const openButton = document.querySelector('#open-giving-payment');
  const statusNode = document.querySelector('#giving-payment-status');
  if (!openButton || !statusNode) return;

  let config = null;
  const tr = (source) => window.EKODIChurchI18n?.t?.(source) || source;
  const setText = (node, value) => {
    const next = String(value ?? '');
    if (node.textContent !== next) node.textContent = next;
  };

  function setStatus(message, state = '') {
    setText(statusNode, tr(message));
    statusNode.dataset.state = state;
  }

  function applyConfig() {
    const ready = Boolean(config?.enabled && config?.provider === 'missionfund' && config?.checkoutUrl);
    openButton.disabled = !ready;
    if (ready) {
      setText(openButton, tr('카드·자동이체'));
      setStatus('미션펀드의 안전한 후원창에서 카드와 자동이체를 이용할 수 있습니다.', 'ready');
    } else {
      setText(openButton, tr('카드·자동이체 연결 확인 필요'));
      setStatus('현재 계좌이체를 이용해 주세요.', 'error');
    }
  }

  async function fetchConfig() {
    try {
      const response = await fetch('./giving-config.json', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`config_${response.status}`);
      config = await response.json();
      applyConfig();
    } catch (error) {
      console.warn('[EKODI Church Giving] config unavailable', error?.message || error);
      config = null;
      applyConfig();
    }
  }

  openButton.addEventListener('click', () => {
    if (!config?.enabled || !config?.checkoutUrl) return;
    const url = new URL(config.checkoutUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'go.missionfund.org') {
      console.error('[EKODI Church Giving] blocked untrusted checkout URL');
      setStatus('안전한 후원 연결을 확인할 수 없습니다. 계좌이체를 이용해 주세요.', 'error');
      return;
    }
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  });

  window.addEventListener('ekodi:church-i18n-applied', applyConfig);
  fetchConfig();
})();
