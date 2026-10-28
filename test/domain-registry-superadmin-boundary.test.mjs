import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../auth-worker-core.js',import.meta.url),'utf8');
const begin=source.indexOf("if (url.pathname.startsWith('/api/registry'))");
const end=source.indexOf("if (request.method === 'GET' && url.pathname === '/api/audit')",begin);
const block=source.slice(begin,end);
test('domain registry rejects unauthenticated and non-super-admin actors before database mutation or reads',()=>{
 assert.ok(begin>=0&&end>begin);
 const denied=block.indexOf("if (!admin) return reply({ error: '관리자 인증이 필요합니다.' }, 401)");
 const restricted=block.indexOf("if (admin.role !== 'super_admin') return reply({ error: '최고관리자 권한이 필요합니다.' }, 403)");
 const seed=block.indexOf('const seed = env.DB.prepare(');
 const get=block.indexOf("request.method === 'GET'");
 const put=block.indexOf("request.method === 'PUT'");
 assert.ok(denied>=0&&restricted>denied&&seed>restricted&&get>restricted&&put>restricted);
});
test('registry update remains audited and limited to allowlisted registered domains',()=>{
 assert.match(block,/EKODI_DOMAINS\.some\(item => item\.name === domain\)/);
 assert.match(block,/writeAudit\(env\.DB, admin\.id, 'registry\.update'/);
});
