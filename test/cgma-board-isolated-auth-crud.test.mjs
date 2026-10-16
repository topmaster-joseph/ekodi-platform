import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleSiteBoardRequest } from '../site-board-control.js';

// In-memory SQL only. No production account, network credentials, D1 database,
// browser session or persisted tenant data is used by this fixture.
function isolatedEnvironment() {
  const db = new DatabaseSync(':memory:');
  function statement(sql, args = []) {
    return {
      bind(...next) { return statement(sql, next); },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() {
        const result = db.prepare(sql).run(...args);
        return { success: true, meta: { last_row_id: Number(result.lastInsertRowid), changes: result.changes } };
      },
    };
  }
  const calls = [];
  const env = {
    DB: {
      prepare: sql => statement(sql),
      async batch(statements) {
        const results = [];
        for (const s of statements) results.push(await s.run());
        return results;
      },
    },
    CONTROL_API: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        const auth = request.headers.get('authorization') || '';
        if (path === '/api/session') {
          calls.push({path, method:request.method});
          const identity = auth === 'Bearer local-owner-fixture'
            ? 'owner@example.invalid'
            : auth === 'Bearer local-other-fixture'
              ? 'other@example.invalid'
              : '';
          return identity
            ? Response.json({authenticated:true,email:identity,role:'super_admin'})
            : Response.json({authenticated:false}, {status:401});
        }
        if (path === '/api/reauth/verify') {
          calls.push({path, method:request.method});
          const body = await request.json();
          const valid = request.headers.get('x-ekodi-reauth-proof') === 'local-reauth-fixture'
            && body.scope === 'board.membership.bootstrap'
            && body.resource === 'site:cgma:main';
          return valid
            ? Response.json({verified:true,actor:'admin:owner@example.invalid'})
            : Response.json({verified:false,error:'reauth_failed'}, {status:403});
        }
        throw new Error('Unexpected CONTROL_API route: ' + path);
      },
    },
  };
  async function request(path, {method='GET', identity='', body, reauth=''} = {}) {
    const headers = new Headers();
    if (identity) headers.set('authorization', 'Bearer local-' + identity + '-fixture');
    if (reauth) headers.set('x-ekodi-reauth-proof', reauth);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const response = await handleSiteBoardRequest(new Request('https://ekodi.kr' + path, {
      method, headers,
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    }), env);
    assert.ok(response, 'Independent site board route must be handled');
    if (response.headers.get('content-type')?.includes('application/json')) {
      assert.equal(response.headers.get('x-ekodi-board-independent'), 'true');
      assert.equal(response.headers.get('x-ekodi-board-id'),
        path.startsWith('/ekodichurch/') ? 'site:ekodichurch:main' : 'site:cgma:main');
    }
    return {status:response.status, data:response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()};
  }
  return {db,env,request,calls};
}

test('CGMA isolated real-handler CRUD respects account sessions, local membership and audit', async () => {
  const {db,request,calls} = isolatedEnvironment();
  try {
    const root='/cgma/board';
    const health=await request(root+'/api/health');
    assert.equal(health.status,200);
    assert.equal(health.data.ok,true);
    assert.equal(health.data.boardId,'site:cgma:main');

    // Anonymous user sees public list but cannot write or enumerate board membership.
    assert.equal((await request(root+'/api/posts')).data.items.length,0);
    assert.equal((await request(root+'/api/memberships')).status,403);
    assert.equal((await request(root+'/api/posts',{method:'POST',body:{title:'Untrusted',body:'Blocked'}})).status,401);
    // A claimed admin email header is not an authenticated identity.
    const anonymousWrites=db.prepare('SELECT COUNT(*) AS total FROM ekodi_board_posts').get();
    assert.equal(anonymousWrites.total,0);

    // An authenticated platform admin is NOT automatically a board owner.
    assert.equal((await request(root+'/api/memberships',{identity:'other'})).status,403);
    assert.equal((await request(root+'/api/memberships/bootstrap',{identity:'owner',method:'POST'})).status,401);

    // Board owner bootstrap requires a validated reauthentication proof.
    const bootstrap=await request(root+'/api/memberships/bootstrap',{
      identity:'owner',method:'POST',reauth:'local-reauth-fixture',
    });
    assert.equal(bootstrap.status,201);
    assert.equal(bootstrap.data.role,'owner');
    const owners=await request(root+'/api/memberships',{identity:'owner'});
    assert.equal(owners.status,200);
    assert.equal(owners.data.items.length,1);
    assert.equal(owners.data.items[0].role,'owner');

    const created=await request(root+'/api/posts',{
      identity:'owner',method:'POST',body:{title:'CGMA fixture',body:'Fixture original'},
    });
    assert.equal(created.status,201);
    assert.ok(created.data.id>0);
    const id=created.data.id;
    assert.equal((await request(root+'/api/posts')).data.items.length,1);

    // Authenticated non-owner must not modify or delete someone else's post.
    assert.equal((await request(root+'/api/posts/'+id,{
      identity:'other',method:'PATCH',body:{title:'Hijack',body:'No'},
    })).status,403);
    assert.equal((await request(root+'/api/posts/'+id,{identity:'other',method:'DELETE'})).status,403);

    const edited=await request(root+'/api/posts/'+id,{
      identity:'owner',method:'PATCH',body:{title:'CGMA fixture edited',body:'Fixture updated'},
    });
    assert.equal(edited.status,200);
    assert.equal(edited.data.ok,true);
    assert.equal((await request(root+'/api/posts/'+id)).data.title,'CGMA fixture edited');

    // Last board owner cannot be revoked.
    const revoke=await request(root+'/api/memberships',{
      identity:'owner',method:'DELETE',body:{personId:'admin:owner@example.invalid'},
    });
    assert.equal(revoke.status,409);
    assert.equal(revoke.data.error,'last_owner_cannot_be_removed');

    // No super-admin reauthentication -> no lifecycle cancellation or deletion.
    assert.equal((await request(root+'/api/lifecycle/cancel',{identity:'owner',method:'POST'})).status,401);

    const deleted=await request(root+'/api/posts/'+id,{identity:'owner',method:'DELETE'});
    assert.equal(deleted.status,200);
    assert.equal(deleted.data.ok,true);
    assert.equal((await request(root+'/api/posts')).data.items.length,0);
    assert.equal((await request(root+'/api/posts/'+id)).status,404);

    // A site-scoped board must not leak another site's published content.
    const church=await request('/ekodichurch/board/api/posts/'+id);
    assert.equal(church.status,404);

    const rows=db.prepare("SELECT action FROM ekodi_board_audit WHERE board_id=? ORDER BY id")
      .all('site:cgma:main').map(row=>row.action);
    assert.deepEqual(rows.filter(x=>x.startsWith('post.')),['post.create','post.edit','post.delete']);
    assert.ok(rows.includes('membership.bootstrap'));
    assert.ok(calls.some(x=>x.path==='/api/reauth/verify'&&x.method==='POST'));
    assert.equal(db.prepare('SELECT status FROM ekodi_board_instances WHERE board_id=?')
      .get('site:cgma:main').status,'active');
  } finally { db.close(); }
});
