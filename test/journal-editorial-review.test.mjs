import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createJournalReviewPacket, journalBodyToText, journalTextToBody } from '../journal-editorial-packet.js';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const sample = {
  slug:'beginning-ekodi-journal',updatedAt:'2026-09-02T22:30:00+09:00',
  category:'ekodi',values:['Ecclesia','Jubilee'],
  body:[{type:'heading',text:'기록의 시작'},{type:'p',text:'본문 내용'}],
};
const fields = {
  slug:sample.slug,title:'에코디 저널의 시작',
  excerpt:'공동체의 기록과 실천을 남깁니다.',
  body:'## 시작하는 이유\n\n서로의 이야기를 기록합니다.\n\n- 나눔\n- 현장\n\n> 책임 있는 기록',
};

test('journal editorial packet remains private, needs human approval, and retains source revision', () => {
  const packet=createJournalReviewPacket(sample,fields,'2026-11-03T10:00:00Z');
  assert.equal(packet.schema,'ekodi-journal-editorial-review-v1');
  assert.equal(packet.state,'review_required');
  assert.equal(packet.publishApproved,false);
  assert.equal(packet.visibility,'private');
  assert.equal(packet.sourceRevision,sample.updatedAt);
  assert.deepEqual(packet.article.body.map(b=>b.type),['heading','p','list','quote']);
  assert.equal(packet.article.slug,sample.slug);
  assert.equal(packet.article.coverPhoto,null);
});

test('journal editorial draft validates slug, text, and source revision', () => {
  assert.throws(()=>createJournalReviewPacket(sample,{...fields,slug:'changed-id'}),/invalid_editorial_slug/);
  assert.throws(()=>createJournalReviewPacket(null,{...fields,slug:'../private'}),/invalid_editorial_slug/);
  assert.throws(()=>createJournalReviewPacket(sample,{...fields,title:'x'}),/invalid_editorial_text/);
  assert.throws(()=>createJournalReviewPacket(sample,{...fields,body:'short'}),/invalid_editorial_text/);
  assert.equal(journalBodyToText(sample.body),'## 기록의 시작\n\n본문 내용');
  assert.deepEqual(journalTextToBody('- 첫째\n- 둘째\n- 셋째'),[{type:'list',items:['첫째','둘째','셋째']}]);
});

test('journal photos are never auto-approved by the review-only editor', () => {
  const packet=createJournalReviewPacket(null,{
    ...fields,slug:'new-community-journal',
    photoSrc:'/journal/media/field/church-2026.webp',photoAlt:'원탁에 모여 나눔을 하는 모습',
    photoCaption:'공동체 모임',photoCredit:'EKODI',rightsStatus:'verified',
  });
  assert.equal(packet.article.coverPhoto.rightsStatus,'pending');
  assert.equal(packet.publishApproved,false);
  assert.throws(()=>createJournalReviewPacket(null,{...fields,photoSrc:'https://external.example/x.jpg'}),/invalid_editorial_photo_path/);
  assert.throws(()=>createJournalReviewPacket(null,{...fields,photoSrc:'/journal/media/a.webp',photoAlt:''}),/invalid_editorial_text/);
});

test('Journal editor uses shared Admin and only writes private drafts with central authentication', () => {
  const ctx={window:{location:new URL('https://ekodi.kr/admin/journal')},URL,URLSearchParams};
  vm.runInNewContext(read('admin-canonical-routes.js'),ctx);
  assert.equal(ctx.window.EKODIAdminRoutes.sectionFromPath('/admin/journal'),'engine-professional');
  assert.equal(ctx.window.EKODIAdminRoutes.pathFor('engine-professional'),'/admin/services/engine-professional');
  assert.equal(ctx.window.EKODIAdminRoutes.navigationTarget('engine-professional'),'/admin/journal');
  const menu=read('admin-menu-registry.js');
  const common=read('common-services-admin.js');
  const page=read('journal-editorial-admin.js');
  const build=read('scripts/build.mjs');
  assert.doesNotMatch(menu,/id: 'journal', group: 'services'/);
  assert.match(common,/journalEditorialSlot/);
  assert.match(common,/mountJournalEditor/);
  assert.match(common,/if\(service\.id==='journal'&&detail\.querySelector\('#journalEditorialSlot'\)\)return;/);
  assert.match(common,/isJournalRoute/);
  assert.match(page,/session\.role!=='super_admin'/);
  assert.match(page,/\/journal\/api\/posts/);
  assert.match(page,/JSON\.stringify\(draft,null,2\)/);
  assert.match(page,/게시·권리 승인은 실행하지 않습니다/);
  assert.match(page,/data-journal-save/);
  assert.match(page,/method:'POST'/);
  assert.match(page,/\/api\/journal\/editorial\/drafts/);
  assert.doesNotMatch(page,/method:\s*['"](?:PUT|PATCH|DELETE)['"]/);
  assert.ok(build.includes('journal-editorial-admin.js'));
  assert.ok(build.includes('journal-editorial-packet.js'));
});
