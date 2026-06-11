const CACHE='prestacontrol-v4';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-180.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=e.request.url;
  const sameOrigin=url.startsWith(self.location.origin);
  const fbScript=url.includes('gstatic.com/firebasejs');
  // no interceptar el tráfico de Firestore (tiempo real); solo app y SDK
  if(!sameOrigin&&!fbScript)return;
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      const copy=resp.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return resp;
    }).catch(()=>sameOrigin?caches.match('./index.html'):undefined))
  );
});
