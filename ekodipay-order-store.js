// Private, one-order-per-Durable-Object ledger. Not a public HTTP endpoint.
// No card numbers, bank details, or customer PII may be stored in this ledger.
const ORDER_RE=/^EB-[A-Z0-9-]{18,60}$/;
const validOrder=x=>x&&ORDER_RE.test(String(x.orderId||''))&&x.merchant==='ekodibiz'&&
  x.service==='ekodibiz'&&x.approved===true&&x.currency==='KRW'&&['test','live'].includes(x.pgMode)&&
  Number.isSafeInteger(x.expiresAt)&&x.expiresAt>Date.now()+60000&&x.expiresAt<Date.now()+30*86400000&&
  Number.isSafeInteger(x.amount)&&x.amount>=100&&x.amount<=10000000&&
  typeof x.orderName==='string'&&x.orderName.trim().length>=2&&x.orderName.length<=80;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export class PayOrderStore {
  constructor(ctx){this.storage=ctx.storage;}
  async fetch(request){
    const url=new URL(request.url),action=url.pathname;
    let data={};
    if(request.method==='POST'){
      try{data=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
    }
    if(action==='/register'&&request.method==='POST'){
      if(!validOrder(data))return json({ok:false,error:'invalid_approved_order'},400);
      const current=await this.storage.get('order');
      if(current){
        const same=['orderId','merchant','service','currency','amount','orderName','pgMode','expiresAt'].every(k=>current[k]===data[k]);
        return same?json({ok:true,orderId:current.orderId,status:current.status,idempotent:true}):
          json({ok:false,error:'immutable_order_conflict'},409);
      }
      const order={orderId:data.orderId,merchant:data.merchant,service:data.service,
        currency:'KRW',amount:data.amount,orderName:data.orderName.trim(),pgMode:data.pgMode,expiresAt:data.expiresAt,
        status:'ready',createdAt:Date.now(),approvalRef:String(data.approvalRef||'').slice(0,100),
        providerKey:null,checkoutToken:null,sessionExpires:0};
      await this.storage.put('order',order);
      return json({ok:true,orderId:order.orderId,status:'ready'},201);
    }
    const order=await this.storage.get('order');
    if(!order)return json({ok:false,error:'order_not_found'},404);
    if(action==='/read'&&request.method==='GET')
      return json({ok:true,order:{orderId:order.orderId,merchant:order.merchant,service:order.service,
        amount:order.amount,currency:order.currency,orderName:order.orderName,status:order.status}});
    if(action==='/session'&&request.method==='POST'){
      return this.storage.transaction(async tx=>{
        const fresh=await tx.get('order');
        if(fresh.status!=='ready'||Date.now()>fresh.expiresAt)
          return json({ok:false,error:'order_not_ready_or_expired'},409);
        if(fresh.checkoutToken&&Date.now()<fresh.sessionExpires)
          return json({ok:false,error:'session_already_active'},409);
        const token=crypto.randomUUID()+'-'+crypto.randomUUID();
        fresh.checkoutToken=token;fresh.sessionExpires=Date.now()+10*60*1000;
        await tx.put('order',fresh);
        return json({ok:true,token,expiresAt:fresh.sessionExpires,
          order:{orderId:fresh.orderId,amount:fresh.amount,currency:'KRW',orderName:fresh.orderName}});
      });
    }
    if(action==='/reserve'&&request.method==='POST'){
      return this.storage.transaction(async tx=>{
        const fresh=await tx.get('order');
        if(fresh.status!=='ready')return json({ok:false,error:'order_already_reserved'},409);
        if(data.token!==fresh.checkoutToken||Date.now()>fresh.sessionExpires)
          return json({ok:false,error:'checkout_session_expired'},403);
        if(data.orderId!==fresh.orderId||data.amount!==fresh.amount||
          data.pgMode!==fresh.pgMode||Date.now()>fresh.expiresAt||
          !/^[a-zA-Z0-9_-]{6,200}$/.test(String(data.paymentKey||'')))
          return json({ok:false,error:'payment_auth_mismatch'},400);
        fresh.status='confirming';fresh.providerKey=data.paymentKey;fresh.reservedAt=Date.now();
        fresh.checkoutToken=null;
        await tx.put('order',fresh);
        return json({ok:true,orderId:fresh.orderId,amount:fresh.amount});
      });
    }
    if(action==='/settle'&&request.method==='POST'){
      if(order.status!=='confirming'||order.providerKey!==data.paymentKey)
        return json({ok:false,error:'unexpected_confirmation'},409);
      if(data.orderId!==order.orderId||data.amount!==order.amount)
        return json({ok:false,error:'provider_mismatch'},400);
      order.status=data.providerStatus==='DONE'?'paid':'requires_reconciliation';
      order.providerStatus=data.providerStatus;
      order.confirmedAt=Date.now();
      await this.storage.put('order',order);
      return json({ok:order.status==='paid',status:order.status});
    }
    if(action==='/hold'&&request.method==='POST'){
      if(order.status==='confirming'){
        order.status='requires_reconciliation';order.failureReason='provider_response_unknown';
        await this.storage.put('order',order);
      }
      return json({ok:true,status:order.status});
    }
    if(action==='/reconcile'&&request.method==='POST'){
      if(!['ready','confirming','requires_reconciliation','paid'].includes(order.status))
        return json({ok:false,error:'invalid_reconcile_state'},409);
      if(data.orderId!==order.orderId||data.amount!==order.amount||
         !/^[a-zA-Z0-9_-]{6,200}$/.test(String(data.paymentKey||''))||
         (order.providerKey&&order.providerKey!==data.paymentKey))
        return json({ok:false,error:'provider_ledger_mismatch'},400);
      if(!['DONE','CANCELED','PARTIAL_CANCELED'].includes(String(data.providerStatus||'')))
        return json({ok:false,error:'unsupported_pg_status'},409);
      if(data.providerStatus!=='DONE'){
        order.status='requires_reconciliation';order.lastProviderStatus=data.providerStatus;
      }else{
        order.status='paid';order.providerKey=data.paymentKey;order.confirmedAt=Date.now();
      }
      order.lastReconciledAt=Date.now();
      await this.storage.put('order',order);
      return json({ok:data.providerStatus==='DONE',status:order.status});
    }
    if(action==='/refund-finalize'&&request.method==='POST'){
      if(order.status!=='paid'&&order.status!=='refund_review')return json({ok:false,error:'invalid_refund_state'},409);
      if(data.paymentKey!==order.providerKey||data.orderId!==order.orderId)return json({ok:false,error:'payment_mismatch'},400);
      order.status=data.providerStatus==='CANCELED'?'refunded':'refund_review';
      order.refundAt=Date.now();
      await this.storage.put('order',order);
      return json({ok:true,status:order.status});
    }
    return json({ok:false,error:'not_found'},404);
  }
}
export {validOrder,ORDER_RE};
