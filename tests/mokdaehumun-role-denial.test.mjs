import {strict as assert} from 'node:assert';
import {mokdaehumunApiResponse} from '../mokdaehumun-member-api.js';
import {mokdaehumunShareResponse} from '../mokdaehumun-share-api.js';
const db={prepare(sql){if(sql.includes('FROM admins'))return {bind(){return {first:async()=>({id:'admin-1'})}}};if(sql.includes('FROM mokdaehumun_admin_roles'))return {bind(){return {first:async()=>null}}};throw Error('Private DB must not be read without cooperative role');}};
const auth={resolveSession:async()=>({principal:{kind:'admin',email:'example@example.test'}})};
for(const [path,handler] of [['members',mokdaehumunApiResponse],['shares',mokdaehumunShareResponse]]){
 const response=await handler(new Request('https://ekodi.kr/mokdaehumun/api/'+path),{DB:db},auth);
 assert.equal(response.status,403);
 assert.match(response.headers.get('cache-control'),/no-store/);
}
console.log('cooperative tenant authorization checks passed');
