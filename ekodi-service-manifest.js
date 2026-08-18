export const EKODI_SERVICE_MANIFEST = Object.freeze({
  version: 1,
  updatedAt: '2026-08-19',
  identityModel: 'person-space-role',
  shellVersion: 1,
  services: [
    {id:'my',name:'My EKODI',shortName:'My',url:'https://my.ekodi.kr/',group:'personal',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['identity','spaces','activity','account'],sso:true,targetable:false,order:10},
    {id:'marketing',name:'EKODI Marketing AI',shortName:'Marketing',url:'https://marketing.ekodi.kr/',group:'business',workspaceKinds:['person','business','organization','church','community','project'],capabilities:['marketing','content','publishing','analytics'],sso:true,targetable:true,order:20},
    {id:'community',name:'에코디커뮤니티',shortName:'Community',url:'https://community.ekodi.kr/',group:'community',workspaceKinds:['person','community','church','organization','project'],capabilities:['community','groups','messages','events','prayer'],sso:true,targetable:true,order:30},
    {id:'church',name:'에코디교회',shortName:'Church',url:'https://church.ekodi.kr/',group:'ministry',workspaceKinds:['church','organization','person'],capabilities:['church','worship','groups','pastoral','events'],sso:true,targetable:true,order:40},
    {id:'business',name:'EKODI Business OS',shortName:'Business',url:'https://business.ekodi.kr/',group:'business',workspaceKinds:['business','organization'],capabilities:['business','operations','dashboard'],sso:true,targetable:false,order:50},
    {id:'biz',name:'에코디비즈',shortName:'Biz',url:'https://biz.ekodi.kr/',group:'business',workspaceKinds:['business','organization'],capabilities:['business','trade','commerce'],sso:true,targetable:true,order:60},
    {id:'work',name:'EKODI Work',shortName:'Work',url:'https://work.ekodi.kr/',group:'work',workspaceKinds:['person','business','organization'],capabilities:['jobs','talent','recruiting'],sso:true,targetable:false,order:70},
    {id:'author',name:'EKODI Creator AI',shortName:'Creator',url:'https://author.ekodi.kr/',group:'creator',workspaceKinds:['person','organization'],capabilities:['creator','writing','media'],sso:true,targetable:false,order:80},
    {id:'books',name:'에코디출판',shortName:'Books',url:'https://books.ekodi.kr/',group:'knowledge',workspaceKinds:['person','business','organization'],capabilities:['publishing','books','distribution'],sso:true,targetable:true,order:90},
    {id:'lab',name:'에코디연구소',shortName:'Lab',url:'https://lab.ekodi.kr/',group:'knowledge',workspaceKinds:['person','organization','project'],capabilities:['research','projects','knowledge'],sso:true,targetable:true,order:100},
    {id:'social',name:'EKODI Social',shortName:'Social',url:'https://social.ekodi.kr/',group:'community',workspaceKinds:['person','business','organization','church','community'],capabilities:['social','channels'],sso:true,targetable:true,order:110},
    {id:'energy',name:'EKODI Energy AI',shortName:'Energy',url:'https://energy.ekodi.kr/',group:'life',workspaceKinds:['person','business','organization'],capabilities:['energy','solar','electricity'],sso:true,targetable:true,order:120},
    {id:'mall',name:'에코디몰',shortName:'Mall',url:'https://mall.ekodi.kr/',group:'business',workspaceKinds:['person','business','organization'],capabilities:['commerce','products','orders'],sso:true,targetable:true,order:130},
    {id:'trade',name:'EKODI Global Trading',shortName:'Trade',url:'https://trade.ekodi.kr/',group:'business',workspaceKinds:['business','organization'],capabilities:['trade','buyers','suppliers'],sso:true,targetable:true,order:140},
    {id:'pay',name:'EKODI Pay',shortName:'Pay',url:'https://pay.ekodi.kr/',group:'finance',workspaceKinds:['person','business','organization'],capabilities:['payments','billing'],sso:true,targetable:true,order:150},
    {id:'edu',name:'에코디교육',shortName:'Education',url:'https://edu.ekodi.kr/',group:'knowledge',workspaceKinds:['person','church','community','organization'],capabilities:['education','courses','learning'],sso:true,targetable:true,order:160,state:'planned'},
    {id:'media',name:'에코디미디어',shortName:'Media',url:'https://media.ekodi.kr/',group:'creator',workspaceKinds:['person','church','community','organization'],capabilities:['media','video','live'],sso:true,targetable:true,order:170,state:'planned'}
  ]
});

export const EKODI_SERVICE_BY_ID = new Map(EKODI_SERVICE_MANIFEST.services.map(service=>[service.id,service]));
export const EKODI_SERVICE_BY_HOST = new Map(EKODI_SERVICE_MANIFEST.services.map(service=>[new URL(service.url).hostname,service]));

export function serviceForHost(hostname){return EKODI_SERVICE_BY_HOST.get(String(hostname||'').toLowerCase())||null;}
export function serviceForId(id){return EKODI_SERVICE_BY_ID.get(String(id||'').toLowerCase())||null;}
