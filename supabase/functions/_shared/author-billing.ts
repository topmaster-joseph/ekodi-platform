const AUTHOR_BILLING_API=Deno.env.get("AUTHOR_BILLING_API_URL")||"https://api.ekodi.kr/api/author/billing/me";
const PAID_PLANS=new Set(["author","pro"]);

type BillingSubscription={
  planId?:string;
  status?:string;
  monthlyFee?:number;
  currentPeriodEnd?:string|null;
  cancelAtPeriodEnd?:boolean;
  paidAiActive?:boolean;
};

type BillingState={
  product?:string;
  userId?:string;
  subscription?:BillingSubscription;
};

function authorization(req:Request){
  return String(req.headers.get("Authorization")||"").trim();
}

async function remoteState(req:Request,userId:string):Promise<BillingState>{
  const auth=authorization(req);
  if(!auth)throw new Error("billing_verification_unauthorized");
  const response=await fetch(AUTHOR_BILLING_API,{
    method:"GET",
    headers:{Authorization:auth,"Accept":"application/json"},
    signal:AbortSignal.timeout(6500),
  });
  const data=await response.json().catch(()=>({})) as BillingState&{error?:string};
  if(!response.ok)throw new Error(data?.error||`billing_verification_${response.status}`);
  if(String(data?.userId||"")!==userId)throw new Error("billing_identity_mismatch");
  return data;
}

export async function reconcileAuthorBilling(req:Request,admin:any,userId:string){
  const state=await remoteState(req,userId);
  const subscription=state?.subscription||{};
  const planCode=String(subscription.planId||"free").toLowerCase();
  const paidUntil=subscription.currentPeriodEnd?String(subscription.currentPeriodEnd):null;
  const paidActive=Boolean(
    subscription.paidAiActive
    && PAID_PLANS.has(planCode)
    && subscription.status==="active"
    && Number(subscription.monthlyFee||0)>0
    && paidUntil
    && new Date(paidUntil).getTime()>Date.now()
  );

  if(paidActive){
    const {error}=await admin.from("author_memberships").upsert({
      user_id:userId,
      plan_code:planCode,
      status:"active",
      billable_ai_enabled:true,
      paid_until:paidUntil,
      billing_provider:"toss",
      provider_membership_ref:`author:${userId}`,
      updated_at:new Date().toISOString(),
    },{onConflict:"user_id"});
    if(error)throw error;
  }else{
    const {error}=await admin.from("author_memberships").upsert({
      user_id:userId,
      plan_code:"free",
      status:"active",
      billable_ai_enabled:false,
      paid_until:null,
      billing_provider:null,
      provider_membership_ref:null,
      updated_at:new Date().toISOString(),
    },{onConflict:"user_id"});
    if(error)throw error;
  }

  return {
    verified:true,
    paid_ai_active:paidActive,
    plan:paidActive?planCode:"free",
    paid_until:paidActive?paidUntil:null,
    cancel_at_period_end:Boolean(subscription.cancelAtPeriodEnd),
    billing_status:String(subscription.status||"active"),
  };
}
