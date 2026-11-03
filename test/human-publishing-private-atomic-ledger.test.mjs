import test from 'node:test';
import assert from 'node:assert/strict';
import { makePrivateReleaseTestDb } from './private-release-sqlite-test-support.mjs';
import { commitPrivateRegistration, commitPrivateTransition,
  listPrivateOutbox } from '../publishing/human/private-release-atomic-ledger.js';
import { readPrivateEdition } from '../publishing/human/private-release-store.js';

const AT='2026-10-29T02:00:00.000Z';
const DIGEST='sha256:'+'d'.repeat(64);
const initial=()=>({
  editionId:'edition-atomic-01',publicationId:'publication-atomic-01',authorId:'author-atomic',
  releaseDigest:DIGEST,title:'완료 도서의 비공개 정본',state:'private_registered',
  visibility:'private',checkoutEnabled:false,publishAt:null,revision:1,
  lastTransition:'private-registered',
});
const edited=old=>({...old,revision:old.revision+1,state:'scheduled',
  publishAt:'2026-11-01T00:00:00.000Z',lastTransition:'approved-schedule-saved'});
const rows=async(db,table)=> (await db.prepare('SELECT * FROM '+table).bind().all()).results;

test('atomic book registration writes a single matching audit and outbox together',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await commitPrivateRegistration(db,initial(),'staff-editor-01',AT);
    const r=await readPrivateEdition(db,initial().editionId);
    assert.equal(r.visibility,'private');
    assert.equal(r.checkoutEnabled,false);
    const audits=await rows(db,'publishing_release_audit');
    const out=await listPrivateOutbox(db);
    assert.equal(audits.length,1);
    assert.equal(out.length,1);
    assert.equal(audits[0].actor_id,'staff-editor-01');
    assert.equal(audits[0].revision,1);
    assert.equal(out[0].event_key,'edition-atomic-01:1');
    const minimal=JSON.parse(out[0].payload_json);
    assert.equal(minimal.state,'private_registered');
    assert.ok(!('authorApproval' in minimal));
    assert.ok(!('manuscript' in minimal));
  }finally{db.close();}
});
test('concurrent duplicate registration cannot produce orphan audit/outbox',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await commitPrivateRegistration(db,initial(),'staff-editor-01',AT);
    await assert.rejects(commitPrivateRegistration(db,initial(),'staff-editor-01',AT),
      /batch-missing-mutation|constraint/i);
    assert.equal((await rows(db,'publishing_private_editions')).length,1);
    assert.equal((await rows(db,'publishing_release_audit')).length,1);
    assert.equal((await rows(db,'publishing_release_outbox')).length,1);
  }finally{db.close();}
});
test('successful scheduled transition updates state, audit, and outbox atomically',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const first=initial(),second=edited(first);
    await commitPrivateRegistration(db,first,'staff-editor-01',AT);
    await commitPrivateTransition(db,first,second,'staff-editor-01',AT);
    assert.equal((await readPrivateEdition(db,first.editionId)).state,'scheduled');
    assert.deepEqual((await rows(db,'publishing_release_audit')).map(x=>x.revision),[1,2]);
    assert.deepEqual((await rows(db,'publishing_release_outbox')).map(x=>x.revision),[1,2]);
    assert.equal((await listPrivateOutbox(db)).length,2);
  }finally{db.close();}
});
test('stale update and failed auditing roll back with no partial mutation',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const first=initial(),second=edited(first);
    await commitPrivateRegistration(db,first,'staff-editor-01',AT);
    await commitPrivateTransition(db,first,second,'staff-editor-01',AT);
    await assert.rejects(commitPrivateTransition(db,first,
      second,'staff-editor-01',AT),
      /batch-missing-mutation|constraint/i);
    assert.equal((await readPrivateEdition(db,first.editionId)).title,first.title);
    assert.equal((await rows(db,'publishing_release_audit')).length,2);
    assert.equal((await rows(db,'publishing_release_outbox')).length,2);
  }finally{db.close();}
});
test('existing edition author and title are immutable between revisions',async()=>{
  const db=makePrivateReleaseTestDb();try{
    const first=initial();
    await commitPrivateRegistration(db,first,'staff-editor-01',AT);
    await assert.rejects(commitPrivateTransition(db,first,{
      ...edited(first),authorId:'injected-author',
    },'staff-editor-01',AT),/immutable-edition/);
    await assert.rejects(commitPrivateTransition(db,first,{
      ...edited(first),title:'injected-new-title',
    },'staff-editor-01',AT),/immutable-edition/);
    assert.equal((await rows(db,'publishing_release_audit')).length,1);
    assert.equal((await rows(db,'publishing_release_outbox')).length,1);
  }finally{db.close();}
});

test('missing batch transaction fails closed before any registration',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await assert.rejects(commitPrivateRegistration({prepare:db.prepare},initial(),'staff-editor-01',AT),
      /atomic-batch-required/);
    assert.equal((await rows(db,'publishing_private_editions')).length,0);
  }finally{db.close();}
});
test('untrusted actor and malformed UTC clock rejected before database mutation',async()=>{
  const db=makePrivateReleaseTestDb();try{
    await assert.rejects(commitPrivateRegistration(db,initial(),'','2026-10-29T02:00:00.000Z'),
      /trusted-actor-required/);
    await assert.rejects(commitPrivateRegistration(db,initial(),'staff-editor-01','2026-10-29T11:00:00+09:00'),
      /canonical-utc-clock-required/);
    assert.equal((await rows(db,'publishing_private_editions')).length,0);
  }finally{db.close();}
});
