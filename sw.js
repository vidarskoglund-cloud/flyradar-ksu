self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{ data=event.data?event.data.json():{}; }catch(e){
    data={title:'Flyradar KSU',body:event.data?event.data.text():'Nytt flyvarsel'};
  }
  const title=data.title||'Flyradar KSU';
  const options={
    body:data.body||'Nytt flyvarsel',
    tag:data.tag||'flyradar-ksu',
    data:{url:data.url||'./'}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||'./';
  event.waitUntil((async()=>{
    const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(clientsList.length){
      const client=clientsList[0];
      if('navigate' in client)try{await client.navigate(target)}catch(e){}
      if('focus' in client)await client.focus();
      return;
    }
    if(self.clients.openWindow)await self.clients.openWindow(target);
  })());
});
