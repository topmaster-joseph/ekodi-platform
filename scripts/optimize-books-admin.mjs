import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const adminPath = path.join(root, 'dist', 'books-admin.js');
const financePath = path.join(root, 'dist', 'books-finance-admin.js');

function requireReplace(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Books performance patch marker missing: ${label}`);
  return source.replace(before, after);
}

if (!fs.existsSync(adminPath) || !fs.existsSync(financePath)) {
  throw new Error('Build Books assets before applying the performance patch');
}

let admin = fs.readFileSync(adminPath, 'utf8').replace(/\r\n/g, '\n');
const adminAlreadySafe =
  admin.includes('let loading = false;') &&
  admin.includes('if (loading) return;') &&
  admin.includes('loading = false;') &&
  !admin.includes("observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});");

if (!adminAlreadySafe) {
  admin = requireReplace(
    admin,
    "  let loaded = false;\n",
    "  let loaded = false;\n  let loading = false;\n",
    'admin loading state',
  );
  admin = requireReplace(
    admin,
    "  function install() {\n    if (installed) return;\n    const nav = document.querySelector('.sidebar nav');\n    const content = document.querySelector('.content');\n    if (!nav || !content) return;\n",
    "  function install() {\n    if (installed) return true;\n    const nav = document.querySelector('.sidebar nav');\n    const content = document.querySelector('.content');\n    if (!nav || !content) return false;\n",
    'admin install return contract',
  );
  admin = requireReplace(
    admin,
    "    if (location.hash === '#books') setTimeout(() => button.click(), 80);\n  }\n\n  function selectTab(name) {",
    "    if (location.hash === '#books') setTimeout(() => button.click(), 80);\n    return true;\n  }\n\n  function selectTab(name) {",
    'admin install success',
  );
  admin = requireReplace(
    admin,
    "  async function load() {\n    if (!token()) { flash('관리자 인증 후 Books 데이터를 불러올 수 있습니다.', true); return; }\n    flash('Books 운영정보를 불러오는 중입니다.');\n    try {",
    "  async function load() {\n    if (loading) return;\n    if (!token()) { flash('관리자 인증 후 Books 데이터를 불러올 수 있습니다.', true); return; }\n    loading = true;\n    flash('Books 운영정보를 불러오는 중입니다.');\n    try {",
    'admin load guard',
  );
  admin = requireReplace(
    admin,
    "    } catch (error) {\n      flash(error.message, true);\n    }\n  }\n\n  function renderAll() {",
    "    } catch (error) {\n      flash(error.message, true);\n    } finally {\n      loading = false;\n    }\n  }\n\n  function renderAll() {",
    'admin load finally',
  );
  admin = requireReplace(
    admin,
    "  function boot() {\n    install();\n    const observer = new MutationObserver(() => {\n      if (!installed) install();\n      if (document.querySelector('#app') && !document.querySelector('#app').hidden && location.hash === '#books' && !loaded) load();\n    });\n    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});\n    setTimeout(() => observer.disconnect(), 20000);\n  }",
    "  function boot() {\n    if (install()) return;\n    const observer = new MutationObserver(() => {\n      if (install()) observer.disconnect();\n    });\n    observer.observe(document.documentElement, { childList: true, subtree: true });\n    setTimeout(() => observer.disconnect(), 5000);\n  }",
    'admin observer scope',
  );
}

let finance = fs.readFileSync(financePath, 'utf8').replace(/\r\n/g, '\n');
finance = requireReplace(
  finance,
  "      strip.id = 'booksFinanceOverview';\n      strip.className = 'books-finance-overview';\n      strip.innerHTML =",
  "      strip.id = 'booksFinanceOverview';\n      strip.className = 'books-finance-overview';\n      strip.hidden = true;\n      strip.innerHTML =",
  'finance overview initial visibility',
);
finance = requireReplace(
  finance,
  "    const booksNav = document.querySelector('.sidebar .nav[data-section=\"books\"]');\n    booksNav?.addEventListener('click', () => setTimeout(() => loadFinance(true), 50));\n    if (location.hash === '#books' && token()) setTimeout(() => loadFinance(true), 150);\n    return true;",
  "    return true;",
  'finance eager load removal',
);
finance = requireReplace(
  finance,
  "    const overview = document.querySelector('#booksFinanceOverview');\n    if (overview) {\n      const cards = overview.querySelectorAll('article strong');",
  "    const overview = document.querySelector('#booksFinanceOverview');\n    if (overview) {\n      overview.hidden = false;\n      const cards = overview.querySelectorAll('article strong');",
  'finance overview reveal',
);

for (const [label, source, forbidden] of [
  ['Books admin', admin, "attributeFilter:['hidden']"],
  ['Books finance', finance, "setTimeout(() => loadFinance(true), 150)"],
]) {
  if (source.includes(forbidden)) throw new Error(`${label} still contains performance regression marker: ${forbidden}`);
}
for (const required of ['let loading = false', 'if (loading) return', 'loading = false']) {
  if (!admin.includes(required)) throw new Error(`Optimized Books admin missing: ${required}`);
}
if (!finance.includes('strip.hidden = true') || !finance.includes('overview.hidden = false')) {
  throw new Error('Optimized Books finance must stay lazy and truthful on Overview');
}

fs.writeFileSync(adminPath, admin);
fs.writeFileSync(financePath, finance);
console.log(`✅ Books admin optimized: ${adminAlreadySafe ? 'source already single-flight' : 'single-flight patch applied'}, lazy finance`);
