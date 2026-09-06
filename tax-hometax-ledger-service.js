import authWorker from './auth-worker.js';

const ALLOWED_ORIGINS = new Set([
  'https://tax.ekodi.kr',
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);

function corsHeaders(origin='') {
  const headers = new Headers({
    'access-control-allow-headers':'authorization, content-type',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}
function json(data,status=200,origin='') {
  const headers = corsHeaders(origin);
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('x-content-type-options','nosniff');
  return new Response(JSON.stringify(data),{status,headers});
}
function text(value,max=300){return String(value??'').trim().slice(0,max)}
function digits(value,max=20){return String(value??'').replace(/\D/g,'').slice(0,max)}
function amount(value){
  const cleaned=String(value??'').replace(/[^0-9-]/g,'');
  const n=Number(cleaned||0);
  return Number.isFinite(n)?Math.trunc(n):0;
}
function date8(value){
  const d=digits(value,8);
  return d.length===8?d:'';
}
async function readJson(request){try{return await request.json()}catch{return {}}}
function stableHash(value){
  let h=0x811c9dc5;
  for(const ch of String(value)){
    h^=ch.charCodeAt(0);
    h=Math.imul(h,0x01000193)>>>0;
  }
  return h.toString(16).padStart(8,'0');
}
function normalizeRow(input={}){
  const approvalNo=digits(input.approvalNo||input.approval_no,40);
  const supplierCorpNum=digits(input.supplierCorpNum||input.supplier_corp_num,10);
  const supplierTaxRegId=digits(input.supplierTaxRegId||input.supplier_tax_reg_id,4);
  const customerCorpNum=digits(input.customerCorpNum||input.customer_corp_num,13);
  const customerTaxRegId=digits(input.customerTaxRegId||input.customer_tax_reg_id,4);
  const writeDate=date8(input.writeDate||input.write_date);
  const supplyAmount=Math.max(0,amount(input.supplyAmount||input.supply_amount));
  const taxAmount=Math.max(0,amount(input.taxAmount||input.tax_amount));
  const explicitTotal=Math.max(0,amount(input.totalAmount||input.total_amount));
  const totalAmount=explicitTotal||supplyAmount+taxAmount;
  const fallback=[writeDate,supplierCorpNum,supplierTaxRegId,customerCorpNum,customerTaxRegId,totalAmount,text(input.itemName||input.item_name,120)].join('|');
  return {
    sourceKey:approvalNo?`A:${approvalNo}`:`F:${stableHash(fallback)}`,
    approvalNo,
    writeDate,
    issueDate:date8(input.issueDate||input.issue_date),
    transmitDate:date8(input.transmitDate||input.transmit_date),
    supplierCorpNum,
    supplierTaxRegId,
    supplierCorpName:text(input.supplierCorpName||input.supplier_corp_name,200),
    customerCorpNum,
    customerTaxRegId,
    customerCorpName:text(input.customerCorpName||input.customer_corp_name,200),
    customerCeoName:text(input.customerCeoName||input.customer_ceo_name,100),
    supplyAmount,
    taxAmount,
    totalAmount,
    itemName:text(input.itemName||input.item_name,200),
    memo:text(input.memo,500),
    invoiceType:text(input.invoiceType||input.invoice_type,80)
  };
}
function validRow(row){
  return Boolean(row.writeDate && row.supplierCorpNum && row.customerCorpNum && (row.totalAmount>=0));
}
async function sessionCheck(request,env){
  const url=new URL(request.url);url.pathname='/api/session';url.search='';
  const response=await authWorker.fetch(new Request(url.toString(),{method:'GET',headers:request.headers}),env);
  if(!response.ok)return {response};
  return {response,session:await response.clone().json()};
}
async function adminId(env,email){
  const row=await env.DB.prepare('SELECT id FROM admins WHERE email=?').bind(email).first();
  return row?.id||null;
}
async function assertOrganization(env,organizationId){
  const row=await env.DB.prepare('SELECT id FROM organizations WHERE id=? AND active=1').bind(organizationId).first();
  if(!row)throw new Error('유효한 조직을 선택해 주세요.');
}
async function audit(env,session,action,resource,detail=''){
  const id=await adminId(env,session.email);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id,action,resource,detail,created_at) VALUES (?,?,?,?,?)')
    .bind(id,action,resource,String(detail).slice(0,500),new Date().toISOString()).run();
}
async function existingKeys(env,organizationId,keys){
  const found=new Set();
  for(let i=0;i<keys.length;i+=80){
    const chunk=keys.slice(i,i+80);
    if(!chunk.length)continue;
    const marks=chunk.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT source_key FROM tax_hometax_ledger WHERE organization_id=? AND source_key IN (${marks})`)
      .bind(organizationId,...chunk).all();
    for(const row of rows.results||[])found.add(row.source_key);
  }
  return found;
}
async function reconcileInvoice(env,organizationId,row,admin,now){
  let invoice=null;
  if(row.approvalNo){
    invoice=await env.DB.prepare('SELECT id,status,document_no,nts_confirm_num FROM tax_invoices WHERE organization_id=? AND nts_confirm_num=? ORDER BY id DESC LIMIT 1')
      .bind(organizationId,row.approvalNo).first();
  }
  if(!invoice && row.writeDate && row.supplierCorpNum && row.customerCorpNum){
    invoice=await env.DB.prepare(`SELECT id,status,document_no,nts_confirm_num FROM tax_invoices
      WHERE organization_id=? AND write_date=? AND total_amount=?
        AND REPLACE(COALESCE(json_extract(invoicee_json,'$.corpNum'),''),'-','')=?
        AND REPLACE(COALESCE(json_extract(invoicer_json,'$.corpNum'),''),'-','')=?
      ORDER BY id DESC LIMIT 1`)
      .bind(organizationId,row.writeDate,row.totalAmount,row.customerCorpNum,row.supplierCorpNum).first();
  }
  if(!invoice)return null;
  const confirmable=['APPROVED','ISSUED','FAILED','NTS_CONFIRMED'].includes(invoice.status);
  if(row.approvalNo){
    await env.DB.prepare(`UPDATE tax_invoices SET nts_confirm_num=?,status=CASE WHEN status IN ('APPROVED','ISSUED','FAILED','NTS_CONFIRMED') THEN 'NTS_CONFIRMED' ELSE status END,
      issued_at=COALESCE(issued_at,?),updated_at=? WHERE id=?`)
      .bind(row.approvalNo,row.issueDate||now,now,invoice.id).run();
    if(confirmable && invoice.status!=='NTS_CONFIRMED'){
      await env.DB.prepare('INSERT INTO tax_invoice_events (invoice_id,action,from_status,to_status,admin_id,detail,created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(invoice.id,'hometax-import-confirm',invoice.status,'NTS_CONFIRMED',admin,`approval=${row.approvalNo}`,now).run();
    }
  }
  return {id:Number(invoice.id),documentNo:invoice.document_no,status:confirmable?'NTS_CONFIRMED':invoice.status};
}
async function importRows(request,env,auth,origin){
  const body=await readJson(request);
  const organizationId=text(body.organizationId||'EKODIBIZ',40);
  await assertOrganization(env,organizationId);
  const rawRows=Array.isArray(body.rows)?body.rows:[];
  if(!rawRows.length)return json({error:'가져올 홈택스 자료가 없습니다.'},400,origin);
  if(rawRows.length>500)return json({error:'한 번에 최대 500건까지 가져올 수 있습니다.'},413,origin);
  const unique=new Map();
  let rejected=0;
  for(const input of rawRows){
    const row=normalizeRow(input);
    if(!validRow(row)){rejected++;continue}
    unique.set(row.sourceKey,row);
  }
  const rows=[...unique.values()];
  if(!rows.length)return json({error:'필수 항목(작성일자, 공급자/공급받는자 등록번호)을 확인해 주세요.'},400,origin);
  const before=await existingKeys(env,organizationId,rows.map(r=>r.sourceKey));
  const now=new Date().toISOString();
  const sourceFormat=text(body.sourceFormat||'UNKNOWN',30).toUpperCase();
  const fileName=text(body.fileName||'',180);
  const statements=rows.map(row=>env.DB.prepare(`INSERT INTO tax_hometax_ledger
    (organization_id,source_key,approval_no,write_date,issue_date,transmit_date,supplier_corp_num,supplier_tax_reg_id,supplier_corp_name,customer_corp_num,customer_tax_reg_id,customer_corp_name,customer_ceo_name,supply_amount,tax_amount,total_amount,item_name,memo,invoice_type,source_format,source_file,imported_at,updated_at,raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(organization_id,source_key) DO UPDATE SET
      approval_no=excluded.approval_no,write_date=excluded.write_date,issue_date=excluded.issue_date,transmit_date=excluded.transmit_date,
      supplier_corp_num=excluded.supplier_corp_num,supplier_tax_reg_id=excluded.supplier_tax_reg_id,supplier_corp_name=excluded.supplier_corp_name,
      customer_corp_num=excluded.customer_corp_num,customer_tax_reg_id=excluded.customer_tax_reg_id,customer_corp_name=excluded.customer_corp_name,customer_ceo_name=excluded.customer_ceo_name,
      supply_amount=excluded.supply_amount,tax_amount=excluded.tax_amount,total_amount=excluded.total_amount,item_name=excluded.item_name,memo=excluded.memo,
      invoice_type=excluded.invoice_type,source_format=excluded.source_format,source_file=excluded.source_file,updated_at=excluded.updated_at,raw_json=excluded.raw_json`)
    .bind(organizationId,row.sourceKey,row.approvalNo,row.writeDate,row.issueDate,row.transmitDate,row.supplierCorpNum,row.supplierTaxRegId,row.supplierCorpName,row.customerCorpNum,row.customerTaxRegId,row.customerCorpName,row.customerCeoName,row.supplyAmount,row.taxAmount,row.totalAmount,row.itemName,row.memo,row.invoiceType,sourceFormat,fileName,now,now,JSON.stringify(row).slice(0,4000)));
  for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
  const admin=await adminId(env,auth.session.email);
  let matched=0;
  for(const row of rows){if(await reconcileInvoice(env,organizationId,row,admin,now))matched++}
  const inserted=rows.filter(r=>!before.has(r.sourceKey)).length;
  const updated=rows.length-inserted;
  await env.DB.prepare(`INSERT INTO tax_hometax_import_batches
    (organization_id,file_name,source_format,row_count,accepted_count,inserted_count,updated_count,matched_count,imported_by,imported_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(organizationId,fileName,sourceFormat,rawRows.length,rows.length,inserted,updated,matched,admin,now).run();
  await audit(env,auth.session,'finance.tax_hometax.import',fileName||sourceFormat,`accepted=${rows.length};inserted=${inserted};updated=${updated};matched=${matched};rejected=${rejected}`);
  return json({ok:true,rowCount:rawRows.length,acceptedCount:rows.length,insertedCount:inserted,updatedCount:updated,matchedCount:matched,rejectedCount:rejected,sourceFormat,fileName,importedAt:now},200,origin);
}
async function listLedger(request,env,origin){
  const url=new URL(request.url);
  const organizationId=text(url.searchParams.get('organizationId')||'EKODIBIZ',40);
  await assertOrganization(env,organizationId);
  const where=['h.organization_id=?'];
  const args=[organizationId];
  const supplierCorpNum=digits(url.searchParams.get('supplierCorpNum'),10);
  const supplierTaxRegId=digits(url.searchParams.get('supplierTaxRegId'),4);
  const from=date8(url.searchParams.get('from'));
  const to=date8(url.searchParams.get('to'));
  if(supplierCorpNum){where.push('h.supplier_corp_num=?');args.push(supplierCorpNum)}
  if(supplierTaxRegId){where.push('h.supplier_tax_reg_id=?');args.push(supplierTaxRegId)}
  if(from){where.push('h.write_date>=?');args.push(from)}
  if(to){where.push('h.write_date<=?');args.push(to)}
  const rows=await env.DB.prepare(`SELECT h.*,
    i.id AS ekodi_invoice_id,i.document_no AS ekodi_document_no,i.status AS ekodi_status
    FROM tax_hometax_ledger h
    LEFT JOIN tax_invoices i ON i.organization_id=h.organization_id AND h.approval_no<>'' AND i.nts_confirm_num=h.approval_no
    WHERE ${where.join(' AND ')} ORDER BY h.write_date DESC,h.issue_date DESC,h.id DESC LIMIT 1000`)
    .bind(...args).all();
  const items=(rows.results||[]).map(r=>({
    id:Number(r.id),source:'HOMETAX',approvalNo:r.approval_no,writeDate:r.write_date,issueDate:r.issue_date,transmitDate:r.transmit_date,
    supplierCorpNum:r.supplier_corp_num,supplierTaxRegId:r.supplier_tax_reg_id,supplierCorpName:r.supplier_corp_name,
    customerCorpNum:r.customer_corp_num,customerTaxRegId:r.customer_tax_reg_id,customerCorpName:r.customer_corp_name,customerCeoName:r.customer_ceo_name,
    supplyAmount:Number(r.supply_amount)||0,taxAmount:Number(r.tax_amount)||0,totalAmount:Number(r.total_amount)||0,itemName:r.item_name,memo:r.memo,invoiceType:r.invoice_type,
    sourceFormat:r.source_format,sourceFile:r.source_file,importedAt:r.imported_at,updatedAt:r.updated_at,
    ekodiInvoiceId:r.ekodi_invoice_id?Number(r.ekodi_invoice_id):null,ekodiDocumentNo:r.ekodi_document_no||'',ekodiStatus:r.ekodi_status||''
  }));
  return json({ok:true,items,count:items.length,sourceOfTruth:'HOMETAX'},200,origin);
}
async function listImports(request,env,origin){
  const url=new URL(request.url);
  const organizationId=text(url.searchParams.get('organizationId')||'EKODIBIZ',40);
  const rows=await env.DB.prepare(`SELECT id,file_name,source_format,row_count,accepted_count,inserted_count,updated_count,matched_count,imported_at
    FROM tax_hometax_import_batches WHERE organization_id=? ORDER BY imported_at DESC,id DESC LIMIT 20`)
    .bind(organizationId).all();
  return json({ok:true,items:rows.results||[]},200,origin);
}
async function health(env,origin){
  const row=await env.DB.prepare('SELECT COUNT(*) AS c FROM tax_hometax_ledger').first();
  return json({ok:true,service:'ekodi-tax-hometax-ledger',sourceOfTruth:'HOMETAX',importMode:'FILE_FREE_FIRST',formats:['XML','XLSX','XLS_HTML','CSV','TSV'],schemaVersion:1,records:Number(row?.c)||0},200,origin);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=request.headers.get('origin')||'';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(origin)});
    try{
      if(request.method==='GET'&&url.pathname==='/api/finance/tax-hometax-health')return health(env,origin);
      const auth=await sessionCheck(request,env);
      if(!auth.response.ok)return auth.response;
      if(request.method==='POST'&&url.pathname==='/api/finance/tax-hometax-import')return importRows(request,env,auth,origin);
      if(request.method==='GET'&&url.pathname==='/api/finance/tax-hometax-ledger')return listLedger(request,env,origin);
      if(request.method==='GET'&&url.pathname==='/api/finance/tax-hometax-imports')return listImports(request,env,origin);
      return json({error:'HomeTax ledger route not found'},404,origin);
    }catch(error){
      console.error('EKODI HomeTax ledger error',error);
      return json({error:String(error?.message||'홈택스 발행대장 처리 중 오류가 발생했습니다.').slice(0,500)},500,origin);
    }
  }
};
