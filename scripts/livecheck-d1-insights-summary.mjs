import fs from 'node:fs';

const input = process.argv[2];
const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.result) ? payload.result : [];

function sanitizeSql(value) {
  return String(value || '')
    .replace(/'(?:''|[^'])*'/g, "'?'")
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

const summary = rows.map((row, index) => ({
  rank:index + 1,
  query:sanitizeSql(row?.query),
  totalRowsRead:Number(row?.totalRowsRead || 0),
  avgRowsRead:Number(row?.avgRowsRead || 0),
  numberOfTimesRun:Number(row?.numberOfTimesRun || 0),
  queryEfficiency:Number(row?.queryEfficiency || 0),
  totalDurationMs:Number(row?.totalDurationMs || 0),
}));

console.log(JSON.stringify({ queryGroups:summary.length, capturedRowsRead:summary.reduce((sum,row)=>sum+row.totalRowsRead,0), top:summary.slice(0,40) }, null, 2));
