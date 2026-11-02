self.addEventListener('push',event=>{
  if(!event.data)return;
  event.waitUntil((async()=>{
    let data;try{data=event.data.json()}catch{return}
    if(!data||typeof data.title!=='string'||typeof data.targetPath!=='string')return;
    const url=new URL(data.targetPath,self.location.origin);
    if(url.origin!==self.location.origin)return;
    await self.registration.showNotification(data.title.slice(0,100),{
      body:String(data.body||'').slice(0,240),tag:'ekodi-'+String(data.service||'news'),
      data:{targetPath:url.pathname+url.search},renotify:false
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.targetPath||'/',self.location.origin);
  if(url.origin!==self.location.origin)return;
  event.waitUntil(clients.openWindow(url.href));
});