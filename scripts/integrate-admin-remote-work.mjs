import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch produced no change`);
  fs.writeFileSync(path, after);
}

patch('admin-menu-registry.js', source => {
  const before = "{ id: 'devices', group: 'system', icon: 'D', labels: { ko: '기기 관리', en: 'Devices' } }";
  const after = "{ id: 'devices', group: 'system', icon: 'D', labels: { ko: '원격 작업', en: 'Remote Work' } }";
  if (!source.includes(before)) throw new Error('admin menu devices definition not found');
  return source.replace(before, after);
});

patch('admin-demand-loader.js', source => {
  const before = `    devices: {\n      label: '기기 관리', icon: '⌁',\n      styles: ['device-control-admin.css'],\n      scripts: ['device-control-admin.js'],\n      secondaryStyles: ['device-browser-diagnostics.css'],\n      secondaryScripts: ['device-browser-diagnostics.js'],\n      real: '[data-device-control-nav]',\n      hashes: ['#devices'],\n      insert: 'after-workspace',\n    },`;
  const after = `    devices: {\n      label: '원격 작업', icon: '⌁',\n      styles: ['device-control-admin.css', 'remote-power-admin.css'],\n      scripts: ['device-control-admin.js', 'remote-power-admin.js'],\n      secondaryStyles: ['device-browser-diagnostics.css'],\n      secondaryScripts: ['device-browser-diagnostics.js'],\n      real: '[data-device-control-nav]',\n      hashes: ['#devices'],\n      insert: 'after-workspace',\n    },`;
  if (!source.includes(before)) throw new Error('devices demand feature not found');
  return source.replace(before, after);
});

patch('device-control-admin.js', source => {
  const replacements = [
    ["setPageTitle('통합 기기관리');", "setPageTitle('원격 작업');"],
    ["label.textContent = 'Devices';", "label.textContent = '원격 작업';"],
    ['<div><p class="kicker">EKODI DEVICE MANAGEMENT</p><h2>통합 기기관리</h2><p>PC·POS·키오스크·태블릿·센서·서비스로봇을 하나의 목록에서 보되, 기기 유형마다 권한을 다르게 적용합니다. 센서와 로봇은 기본 관찰 전용이며 검증된 어댑터 전에는 원격행동을 허용하지 않습니다.</p></div>', '<div><p class="kicker">REMOTE WORK & DEVICE MANAGEMENT</p><h2>원격 작업</h2><p>원격 PC의 연결·복구·작업배정과 기기 진단을 한곳에서 관리합니다. PC는 허용된 원격 작업만 실행하며 POS·키오스크·센서·서비스로봇은 기기 유형별 안전정책을 그대로 적용합니다.</p></div>'],
  ];
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`device control anchor missing: ${before.slice(0, 40)}`);
    source = source.replace(before, after);
  }
  return source;
});

patch('remote-power-admin.js', source => {
  const before = "function host(){ return document.querySelector('#aiOpsPanel') || document.querySelector('main') || document.body; }";
  const after = "function host(){ return document.querySelector('#deviceControlPanel') || document.querySelector('[data-panel~=\"devices\"]'); }";
  if (!source.includes(before)) throw new Error('remote power host anchor not found');
  source = source.replace(before, after);
  const loadBefore = "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true}); else load();";
  const loadAfter = "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(host())load()},{once:true}); else if(host())load();";
  if (!source.includes(loadBefore)) throw new Error('remote power boot anchor not found');
  return source.replace(loadBefore, loadAfter);
});

patch('admin-lazy-features.js', source => {
  source = source.replace("    'remote-power-admin.css',\n", '');
  source = source.replace("    'remote-power-admin.js',\n", '');
  if (source.includes("'remote-power-admin.css'") || source.includes("'remote-power-admin.js'")) {
    throw new Error('remote power still coupled to AI Ops lazy bundle');
  }
  return source;
});

console.log('Admin System > Remote Work integrated.');
