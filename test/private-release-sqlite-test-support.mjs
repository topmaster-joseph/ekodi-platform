// In-memory SQLite adapter for deterministic D1 batch transaction tests.
// Test-only, never deployed with publisher production worker.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function makePrivateReleaseTestDb() {
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['001_private_scheduled_editions.sql','002_private_release_audit_outbox.sql']){
    sqlite.exec(readFileSync(new URL('../publishing/human/sql/'+name,import.meta.url),'utf8'));
  }
  const prepare=sql=>({
    bind(...values){
      const bound={_sql:sql,_values:values};
      return Object.assign(bound,{
        async run(){
          const out=sqlite.prepare(sql).run(...values);
          return {success:true,meta:{changes:Number(out.changes)}};
        },
        async first(){return sqlite.prepare(sql).get(...values)||null;},
        async all(){return {results:sqlite.prepare(sql).all(...values)};},
      });
    },
  });
  return {
    prepare,
    async batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const results=[];
        for(const statement of statements){
          if(typeof statement?._sql!=='string'||!Array.isArray(statement._values))throw Error('invalid-batch-statement');
          const out=sqlite.prepare(statement._sql).run(...statement._values);
          results.push({success:true,meta:{changes:Number(out.changes)}});
        }
        // D1 batch executes the statements transactionally; this mock also
        // verifies exactly one mutation per statement before commit.
        if(results.some(x=>x.meta.changes!==1))throw Error('batch-missing-mutation');
        sqlite.exec('COMMIT');
        return results;
      }catch(e){sqlite.exec('ROLLBACK');throw e;}
    },
    close(){sqlite.close();},
  };
}
