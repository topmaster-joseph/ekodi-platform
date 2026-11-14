self.addEventListener('push',event=>{
  if(!event.data)return;
  event.waitUntil((async()=>{
    let data;try{data=event.data.json()}catch{return}
    if(!data||typeof data.title!=='string'||typeof data.targetPath!=='string')return;
    const url=new URL(data.targetPath,self.location.origin);
    if(url.origin!==self.location.origin)return;
    const service=String(data.service||'news');
    // 운영 알림은 건마다 별도 표시: 같은 태그로 조용히 덮어쓰면 휴대폰에 새 알림이 안 뜬 것처럼 보인다.
    const operator=service==='operator';
    await self.registration.showNotification(data.title.slice(0,100),{
      body:String(data.body||'').slice(0,240),
      tag:operator?'ekodi-operator-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6):'ekodi-'+service,
      data:{targetPath:url.pathname+url.search},renotify:!operator
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.targetPath||'/',self.location.origin);
  if(url.origin!==self.location.origin)return;
  event.waitUntil(clients.openWindow(url.href));
});