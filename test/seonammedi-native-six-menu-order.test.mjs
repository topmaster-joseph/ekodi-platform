import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const EXPECTED=['공지','활동이력','관련소식','소통채널','시민의견','조직'];

test('16-screen post-deploy native verifier matches actual notice-first six-menu contract',async()=>{
  const [verifier,guest,worker]=await Promise.all([
    read('scripts/verify-seonammedi-dropdown-visual-native.mjs'),
    read('scripts/verify-seonammedi-nav-guest-native.mjs'),
    read('services/independent-board/worker.js')
  ]);
  const expected=EXPECTED.join('|');
  assert.ok(verifier.includes("entry.styles.labels.join('|')!=='"+expected+"'"),
    'native visual verifier must check exact current menu labels in canonical order');
  assert.ok(!verifier.includes("entry.styles.labels.join('|')!=='활동이력|관련소식|소통채널|시민의견|공지|조직'"),
    'retired six-menu order must not block healthy production releases');
  assert.ok(guest.includes("const LABELS=['"+EXPECTED.join("','")+"'];"),
    '24-surface guest verifier must enforce the same canonical menu order');

  const nav=worker.slice(worker.indexOf('function nav(active,req){'),worker.indexOf('const footer=',worker.indexOf('function nav(active,req){')));
  const anchors=[
    "boardPath(req,'notices')+'\">공지</a>",
    "link(home('#committee-activity'),'활동이력'",
    "link(home('#timeline'),'관련소식'",
    'data-category-menu="소통채널"',
    "link(boardPath(req,'voices')+'?compose=1','시민의견'",
    "link(home('#organization'),'조직'"
  ];
  let last=-1;
  for(const anchor of anchors){
    const at=nav.indexOf(anchor,last+1);
    assert.ok(at>last,'canonical independent-board nav order must include '+anchor);
    last=at;
  }
  assert.ok(verifier.includes("const routes=['/','/board/voices','/board/notices','/board/finance']"));
  assert.ok(verifier.includes("const devices=[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]"));
  assert.ok(verifier.includes("if(entry.styles.horizontalOverflow)throw Error('page_horizontal_overflow')"),
    'fix must not suppress independent mobile overflow checks');
  assert.ok(verifier.includes("if(!open)throw Error('notice_category_does_not_open_with_required_links')"),
    'notice click-through remains mandatory');
  assert.ok(verifier.includes("report.results.length===16&&report.errors.length===0"),
    'all 16 screens remain required');
});
