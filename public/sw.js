const CACHE='annapurna-v6';
const CORE=['/','/manifest.webmanifest','/logo.svg','/order.css','/v2.css','/browser-alerts.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // Supabase/API/private cross-origin requests always bypass the PWA cache.
  if(url.origin!==self.location.origin) return;

  // Always try the newest app shell first so an installed Home Screen PWA updates
  // without needing to be removed/reinstalled. Offline mode falls back to cache.
  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          if(response&&response.ok)caches.open(CACHE).then(cache=>cache.put('/',response.clone()));
          return response;
        })
        .catch(()=>caches.match('/'))
    );
    return;
  }

  const cacheable=['style','script','image','font','manifest'].includes(event.request.destination);
  if(!cacheable) return;

  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        if(response&&response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{}
  const isNewOrder=data.type==='NEW_ORDER';
  event.waitUntil(
    self.registration.showNotification(data.title||'Annapurna Panipuri',{
      body:data.body||'You have an order update.',
      icon:'/logo.svg',
      badge:'/logo.svg',
      vibrate:[300,100,300,100,700],
      requireInteraction:isNewOrder,
      silent:false,
      renotify:Boolean(data.order_id),
      tag:data.order_id?'order-'+data.order_id:undefined,
      data:{url:data.url||'/?orders=1'}
    })
  );
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url||'/?orders=1';
  event.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const client of list){
        if('focus' in client){client.navigate(url);return client.focus()}
      }
      return clients.openWindow?clients.openWindow(url):undefined;
    })
  );
});
