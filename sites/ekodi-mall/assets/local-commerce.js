(() => {
  'use strict';
  const STORAGE_KEY = 'ekodiMallLocalRegionV1';
  const select = document.querySelector('#localRegionSelect');
  const applyButton = document.querySelector('#localApply');
  const clearButton = document.querySelector('#localClear');
  const positionButton = document.querySelector('#localUsePosition');
  const status = document.querySelector('#localStatus');

  const optionRegion = (option) => option?.value ? {
    id: option.value,
    label: option.dataset.fullName || option.textContent.trim(),
    path: String(option.dataset.path || '').split(',').filter(Boolean)
  } : null;

  function validStored(value) {
    if (!value || typeof value !== 'object' || !value.id) return null;
    const option = select?.querySelector(`option[value="${CSS.escape(String(value.id))}"]`);
    return option ? optionRegion(option) : null;
  }

  function readSelected() {
    try { return validStored(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch { return null; }
  }

  function writeSelected(region) {
    try {
      if (region) localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: region.id, label: region.label, selectedAt: new Date().toISOString(), source: 'explicit' }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function emit(region, source) {
    document.dispatchEvent(new CustomEvent('ekodi:local-region-change', { detail: { region, source } }));
  }

  function sync() {
    const region = readSelected();
    if (select) select.value = region?.id || '';
    setStatus(region ? `내 로컬 · ${region.label}` : '내 로컬 미지정 · 전국의 지역 연결 상품을 함께 봅니다.');
    return region;
  }

  function activateLocalFilter() {
    const button = document.querySelector('#filters [data-filter="local"]');
    if (button) button.click();
  }

  applyButton?.addEventListener('click', () => {
    const region = optionRegion(select?.selectedOptions?.[0]);
    if (!region) {
      setStatus('지역을 선택해 주세요. 선택하지 않으면 전국 로컬 보기로 유지됩니다.');
      return;
    }
    writeSelected(region);
    setStatus(`내 로컬을 ${region.label}(으)로 저장했습니다.`);
    emit(region, 'explicit');
    activateLocalFilter();
  });

  clearButton?.addEventListener('click', () => {
    writeSelected(null);
    if (select) select.value = '';
    setStatus('내 로컬을 해제했습니다. 전국의 지역 연결 상품을 보여줍니다.');
    emit(null, 'explicit-clear');
    activateLocalFilter();
  });

  positionButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('이 브라우저에서는 현재 위치 확인을 지원하지 않습니다. 지역을 직접 선택해 주세요.');
      return;
    }
    positionButton.disabled = true;
    setStatus('브라우저 위치 권한을 확인하고 있습니다...');
    navigator.geolocation.getCurrentPosition(
      () => {
        positionButton.disabled = false;
        setStatus('현재 위치 권한을 확인했습니다. 좌표는 저장하지 않습니다. 행정지역을 직접 선택해 내 로컬을 확정해 주세요.');
        emit(readSelected(), 'geolocation-consented-unresolved');
      },
      (error) => {
        positionButton.disabled = false;
        setStatus(error.code === 1 ? '위치 권한을 사용하지 않았습니다. 지역을 직접 선택할 수 있습니다.' : '현재 위치를 확인하지 못했습니다. 지역을 직접 선택해 주세요.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });

  window.EkodiLocal = Object.freeze({
    getSelectedRegion: readSelected,
    getSelectedRegionId: () => readSelected()?.id || '',
    storageKey: STORAGE_KEY
  });

  const initial = sync();
  emit(initial, 'initial');
})();
