import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const menuRegistry=read('admin-menu-registry.js');
const loader=read('admin-demand-loader.js');
const shell=read('admin-shell.html');
const services=JSON.parse(read('config/ecosystem-services.json'));
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const menus=['campus','work','communication','workspace','organization','clients','admins','life-ai','community','books','social','aiops','marketing-ai','ai-module-spec','ai-membership','finance','tax','affiliates','storage','api-cost','health','security','devices','architecture'];
for(const id of menus) if(!new RegExp("\\bid\\s*:\\s*['\"]"+esc(id)+"['\"]").test(menuRegistry)) throw new Error('menu missing: '+id);
const lazy=['campus','work','clients','life-ai','community','books','social','aiops','marketing','ai-module-spec','aimembers','affiliates','storage','api-cost','health','security','devices'];
for(const key of lazy) if(!new RegExp("(^|\\n)\\s*['\"]?"+esc(key)+"['\"]?\\s*:\\s*\\{",'m').test(loader)) throw new Error('loader missing: '+key);
const contracts={
  'client-access.js':[/dataset\.section\s*=\s*['\"]clients['\"]/,/고객관리 API 요청 실패/],
  'community-reports-admin.js':[/dataset\.section\s*=\s*['\"]community['\"]/,/Ministry Reports/],
  'books-admin.js':[/dataset\.section\s*=\s*['\"]books['\"]/,/Publications/],
  'books-finance-admin.js':[/Sales & Costs/,/CHANNEL P&L/],
  'social-admin.js':[/dataset\.section\s*=\s*['\"]social['\"]/,/Social Channels/],
  'marketing-funnel-admin.js':[/dataset\.section\s*=\s*['\"]affiliates['\"]/,/affiliate/i],
};
for(const [file,patterns] of Object.entries(contracts)){if(!fs.existsSync(file))throw new Error('module missing: '+file);const src=read(file);for(const pattern of patterns)if(!pattern.test(src))throw new Error(file+' contract failed: '+pattern)}
for(const css of ['client-access.css','community-reports-admin.css','books-admin.css','books-finance-admin.css','social-admin.css','marketing-funnel-admin.css']) if(!fs.existsSync(css)) throw new Error('style missing: '+css);
for(const panel of ['communication','workspace','organization','finance','architecture']) if(!shell.includes('data-panel="'+panel+'"')) throw new Error('static panel missing: '+panel);
for(const bad of ['mail.google.com/a/ekodi.kr','accounts.google.com/AccountChooser','accounts.google.com/AddSession','href="https://trade.ekodi.kr','href="https://marketing.ekodi.kr/','href="https://biz.ekodi.kr/','href="https://church.ekodi.kr/','href="https://lab.ekodi.kr/']) if(shell.includes(bad)) throw new Error('legacy link survived: '+bad);
for(const good of ['https://mail.ekodi.kr/','https://trade.biz.ekodi.kr/','https://ekodi.kr/ekodibiz/marketing-ai','https://cgma.ekodi.kr/','https://ekodi.kr/ekodibiz','https://ekodi.kr/ekodichurch','https://ekodi.kr/ekodilab']) if(!shell.includes(good)) throw new Error('canonical link missing: '+good);
if(!/id:\s*['"]tax['"][\s\S]{0,240}href:\s*['"]https:\/\/tax\.ekodi\.kr\/['"][\s\S]{0,120}adminHandoff:\s*true/.test(menuRegistry)) throw new Error('tax handoff registry missing');
const trade=services.services.find(item=>item.id==='trade'); if(trade?.url!=='https://trade.biz.ekodi.kr') throw new Error('trade registry not canonical');
console.log(`OK ${menus.length} menus, ${lazy.length} lazy modules, linked service contracts.`);
