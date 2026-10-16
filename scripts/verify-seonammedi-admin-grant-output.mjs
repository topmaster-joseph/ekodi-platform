import fs from 'node:fs';

const filename=process.argv[2];
if(!filename)throw new Error('Provide a Wrangler D1 JSON output filename');
let parsed;
try{parsed=JSON.parse(fs.readFileSync(filename,'utf8'))}
catch{console.error('SEONAMMEDI_BOARD_ADMIN_GRANT=UNVERIFIED (query parse failure)');process.exit(2)}
const sets=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.result)?parsed.result:[parsed]);
const rows=sets.flatMap(set=>Array.isArray(set?.results)?set.results:[]);
const verified=sets.length>0 && sets.every(set=>set?.success!==false) &&
  rows.length===1 && Number(rows[0]?.scoped_grant_verified)===1;
if(verified){
  console.log('SEONAMMEDI_BOARD_ADMIN_GRANT=VERIFIED');
}else{
  console.error('SEONAMMEDI_BOARD_ADMIN_GRANT=UNVERIFIED');
  process.exitCode=2;
}
