const CACHE='prestacontrol-v46';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-180.png','./jspdf.umd.min.js'];
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
  // la página principal va SIEMPRE a internet primero (así las actualizaciones llegan solas);
  // si no hay conexión, se usa la copia guardada y la app sigue funcionando offline
  if(e.request.mode==='navigate'||url.endsWith('/index.html')||url===self.location.origin+'/'){
    e.respondWith(
      fetch(e.request).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
        return resp;
      }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }
  // el resto de los archivos: primero caché (rápido y offline), red como respaldo
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      const copy=resp.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return resp;
    }).catch(()=>sameOrigin?caches.match('./index.html'):undefined))
  );
});
