import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

class FakeElement {
  constructor(id='',dataset={}) {
    this.id=id; this.dataset=dataset; this.hidden=false; this.disabled=false;
    this.textContent='';this.className='';this.value='';this.checked=false;
    this.style={};this.events={};this.attributes={};this.tabIndex=0;
    this.children=[];this.options=[];this.elements={};
  }
  addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  focus(){this.focused=true;}
  scrollIntoView(){}
  append(...items){this.children.push(...items);if(this.id==='cycleSelect')this.options.push(...items);}
  replaceChildren(...items){this.children=[...items];this.options=[];}
  reportValidity(){return true;}
  querySelector(){return null;}
  querySelectorAll(){return [];}
}

function fakeDocument({customer=false,admin=false}={}) {
  const nodes=new Map();
  const get=id=>{
    if(!nodes.has(id)) nodes.set(id,new FakeElement(id));
    return nodes.get(id);
  };
  const customerNames=['apply','flow','status','contract','guide'];
  const tabButtons=customerNames.map(name=>new FakeElement('tab-'+name,{agencyTab:name}));
  const panels=customerNames.map(name=>new FakeElement(name,{agencyPanel:name}));
  const companyNames=['list','review','settlement'];
  const adminTabs=companyNames.map(name=>new FakeElement('company-'+name,{adminTab:name}));
  const radios=[new FakeElement('radio-institution'),new FakeElement('radio-individual')];
  radios[1].checked=true;
  const form=get('agencyForm');
  const fields={type:{value:'individual'},customer:{value:'Test'},email:{value:'test@example.test'},
    organization:{value:'',required:false},provider:{value:'OpenAI'},
    service:{value:'test-only'},description:{value:''},months:{value:'2'},
    consent:{checked:true},terms:{checked:true}};
  form.elements=fields;
  form.querySelector=()=>radios[1];
  form.querySelectorAll=()=>radios;
  const quoteForm=get('quoteForm');
  quoteForm.elements={
    feeAmount:{value:'1000'},supplierAmount:{value:'0'},guidance:{value:'test quote'}
  };
  const cycleForm=get('cycleForm');
  cycleForm.elements={paidOn:{value:''},cycle:new FakeElement('cycleSelect'),
    amount:{value:'100'},receiptRef:{value:'ABC123'}};
  const renewalForm=get('renewalForm');
  renewalForm.elements={cancellationRef:{value:''},personalAccountKept:{checked:false}};
  const created=[];
  const document={
    body:{dataset:{},append(){}},
    head:{append(){}},
    getElementById:get,
    querySelectorAll(query){
      if(query==='[data-agency-tab]')return tabButtons;
      if(query==='[data-agency-panel]')return panels;
      if(query==='[data-open-agency-tab]')return [];
      if(query==='[data-admin-tab]')return adminTabs;
      return [];
    },
    createElement(tag){
      const el=new FakeElement(tag);
      created.push(el);
      return el;
    }
  };
  return {document,get,tabButtons,panels,adminTabs,created,form,quoteForm};
}
function response(status,obj) {
  return {ok:status>=200&&status<300,status,json:async()=>obj};
}
function contextFor(document,fetcher,path) {
  return {
    document, fetch:fetcher, location:{pathname:path,search:'',hash:'',origin:'https://ekodi.kr'},
    history:{replaceState(){}}, sessionStorage:{getItem:()=>null,setItem(){}},
    navigator:{clipboard:{writeText:async()=>{}}},window:{},
    URL,URLSearchParams,Blob,Intl,Date,Array,Promise,Object,Number,String,
    confirm:()=>true,setTimeout:()=>0,console
  };
}

test('a verified contract followed by an invalid secret clears the old settlement and restores empty state',async()=>{
  const {document,get,panels}=fakeDocument({customer:true});
  let statusCalls=0;
  const fetcher=async(url)=>{
    if(!url.endsWith('/status'))throw Error('unexpected API '+url);
    statusCalls+=1;
    if(statusCalls===1)return response(200,{ok:true,
      record:{id:'R1',type:'individual',months:2,status:'accepted',feeAmount:1000,
        supplierAmount:0,totalAmount:1000},
      campus:{agreementId:'R1',months:2,periods:[
        {cycle:1,status:'operator_recorded',amount:500,paidOn:'2026-11-08',receiptRef:'INV123'},
        {cycle:2,status:'missing'}
      ],feeAmount:1000,supplierBudget:0,recordedSupplierSpending:500,
        unallocatedSupplierBudget:0,renewalStopEvidenceRecorded:false}
    });
    return response(404,{ok:false,error:'not_found'});
  };
  const env=contextFor(document,fetcher,'/ekodibiz/ai-agency/individual');
  runInNewContext(await read('../ekodibiz/ai-agency.js'),env);
  get('lookupId').value='R1';
  get('lookupToken').value='correct';
  await get('lookupBtn').events.click();
  assert.equal(get('campusPanel').hidden,false);
  assert.equal(get('contractEmpty').hidden,true);
  assert.equal(get('campusPeriods').children.length,2);
  assert.equal(panels.find(p=>p.dataset.agencyPanel==='status').hidden,false);
  get('campusCycleDetails').open=true;
  get('lookupToken').value='wrong';
  await get('lookupBtn').events.click();
  assert.equal(get('result').hidden,true);
  assert.equal(get('campusPanel').hidden,true);
  assert.equal(get('contractEmpty').hidden,false);
  assert.equal(get('campusPeriods').children.length,0);
  assert.equal(get('campusCycleDetails').open,false);
  assert.match(get('message').textContent,/보안코드/);
});

test('approved checkout renders Toss only after visible contract panel and never reuses an old amount',async()=>{
  const {document,get,panels}=fakeDocument({customer:true});
  const observed=[];
  const fetcher=async url=>{
    if(url.endsWith('/status'))return response(200,{ok:true,
      record:{id:'R1',type:'individual',months:2,status:'accepted',feeAmount:1000,
        supplierAmount:0,totalAmount:1000},campus:null});
    if(url.endsWith('/checkout'))return response(200,{
      ok:true,clientKey:'test_client_key',amount:1000,orderId:'R1',
      mode:'test',orderName:'test order'
    });
    throw Error('unexpected API '+url);
  };
  const env=contextFor(document,fetcher,'/ekodibiz/ai-agency/individual');
  env.window.TossPayments=()=>({widgets:()=>({
    async setAmount(value){observed.push(['amount',value.value]);},
    async renderPaymentMethods(){
      observed.push(['render',get('tossPanel').hidden,
        panels.find(p=>p.dataset.agencyPanel==='contract').hidden]);
    },
    async renderAgreement(){observed.push(['agreement']);}
  })});
  runInNewContext(await read('../ekodibiz/ai-agency.js'),env);
  get('lookupId').value='R1';get('lookupToken').value='secret';
  await get('lookupBtn').events.click();
  await get('paymentBtn').events.click();
  assert.deepEqual(observed.slice(0,3),[
    ['amount',1000],['render',false,false],['agreement']
  ]);
  assert.equal(get('tossPanel').hidden,false);
  // Same-key checkout must still re-bind the server-quoted amount.
  await get('paymentBtn').events.click();
  assert.equal(observed.filter(x=>x[0]==='amount').length,2);
});

test('company admin tabs stay disabled before contract selection and reset after a quote',async()=>{
  const {document,get,adminTabs,created}=fakeDocument({admin:true});
  const item={id:'R1',type:'institution',customer:'Test',email:'test@example.test',
    organization:'Test Org',provider:'OpenAI',service:'Test',months:2,
    status:'awaiting_quote',feeAmount:null,supplierAmount:0,totalAmount:null};
  let quotes=0;
  const fetcher=async url=>{
    if(url.endsWith('/list'))return response(200,{ok:true,items:[item]});
    if(url.endsWith('/quote')){quotes+=1;return response(200,{ok:true});}
    throw Error('unexpected admin API '+url);
  };
  get('adminKey').value='a'.repeat(40);
  const env=contextFor(document,fetcher,'/ekodibiz/ai-agency/manage');
  runInNewContext(await read('../ekodibiz/ai-agency-admin.js'),env);
  assert.equal(adminTabs[1].disabled,true);
  assert.equal(adminTabs[2].disabled,true);
  await get('load').events.click();
  const review=created.find(el=>el.textContent==='검토');
  assert.ok(review,'selectable authorized contract list row');
  review.events.click();
  assert.equal(adminTabs[1].disabled,false);
  assert.equal(adminTabs[2].disabled,false);
  assert.equal(get('detail').hidden,false);
  await get('quoteForm').events.submit({preventDefault(){}});
  assert.equal(quotes,1);
  assert.equal(get('adminApplications').hidden,false);
  assert.equal(adminTabs[1].disabled,true);
  assert.equal(adminTabs[2].disabled,true);
});
