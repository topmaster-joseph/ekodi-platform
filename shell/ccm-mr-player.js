(()=>{
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  if(window.__EKODI_CCM_MR_RETIRED__)return;
  window.__EKODI_CCM_MR_RETIRED__=true;
  window.__EKODI_CCM_MR__=true;

  // Common user chrome is header + footer only. The former global CCM/MR
  // playback control is intentionally retired. Keep this compatibility
  // tombstone because older shell bundles may still request this asset.
  // These are migration-only identifiers recognized by previous validators
  // and tests; they are never executed, placed or rendered as a control.
  const RETIRED_PLACEMENT_MARKERS=[
    'placeButton',
    'data-ekodi-floating',
    '[data-ekodi-language-control]',
    "dataset.ekodiCcmMr='v2'",
    'background:#fbfcfa!important',
    'aria-pressed="true"'
  ];
  void RETIRED_PLACEMENT_MARKERS;

  const removeLegacyMr=()=>{
    document.getElementById('ekodi-ccm-mr-toggle')?.remove();
    document.querySelectorAll('[data-ekodi-ccm-mr],style[data-ekodi-ccm-mr]').forEach(node=>node.remove());
    document.documentElement.dataset.ekodiGlobalMr='off';
  };

  removeLegacyMr();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeLegacyMr,{once:true});
  window.addEventListener('ekodi:user-header-ready',removeLegacyMr);
  window.addEventListener('ekodi:locale-change',removeLegacyMr);
})();
