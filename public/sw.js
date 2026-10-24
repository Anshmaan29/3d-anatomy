/* Build replaces this token with the dataset digest shared by the renderer. */
const CACHE='anatomy-studio-v1';
const ASSET_CACHE=`${CACHE}-assets`;
const SCOPE=new URL(self.registration.scope);
const insideScope=url=>url.origin===SCOPE.origin&&url.pathname.startsWith(SCOPE.pathname);
const localPath=pathname=>new URL(pathname.replace(/^\//,''),SCOPE).href;
const safeResponse=response=>response.ok&&response.type!=='opaque'&&!/text\/html|application\/xhtml/i.test(response.headers.get('content-type')||'');
const isAnatomy=url=>/\/(?:models|data)\//.test(url.pathname);
const isImmutable=url=>/\/models\//.test(url.pathname)&&(/\.[a-f0-9]{16,}\./i.test(url.pathname)||url.searchParams.has('v')||/\/textures\/[a-f0-9]{16,}\./i.test(url.pathname));
const missing=url=>new Response(JSON.stringify({error:'This anatomy file is not available offline.',path:url.pathname}),{status:503,statusText:'Offline asset unavailable',headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const save=async(name,request,response)=>{try{const cache=await caches.open(name);await cache.put(request,response.clone());}catch{/* Full or unavailable storage must not break online use. */}};

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(['/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'].map(path=>cache.add(localPath(path)).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>/^anatomy-studio-(?:[a-f0-9]{16}|dev|v1)(?:-assets)?$/.test(key)&&key!==CACHE&&key!==ASSET_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(!insideScope(url))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        // Cache the compiled app shell only, never a gateway/login page or redirect.
        if(response.ok&&!response.redirected&&/text\/html/i.test(response.headers.get('content-type')||'')){
          const html=await response.clone().text();
          if(/id=["']root["']/.test(html)&&/<script\b[^>]*src=["'][^"']*\/assets\//i.test(html))await save(CACHE,localPath('/'),response);
        }
        return response;
      }catch{return(await caches.open(CACHE)).match(localPath('/'),{ignoreVary:true}).then(hit=>hit||new Response('Open Anatomy Studio online once before studying offline.',{status:503,headers:{'Content-Type':'text/plain'}}));}
    })());return;
  }
  if(isAnatomy(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(ASSET_CACHE);
      if(isImmutable(url)){const hit=await cache.match(request,{ignoreVary:true});if(hit&&safeResponse(hit))return hit;}
      try{
        const response=await fetch(request);
        if(safeResponse(response)){await save(ASSET_CACHE,request,response);return response;}
        const fallback=await cache.match(request,{ignoreVary:true});
        return fallback&&safeResponse(fallback)?fallback:(response.ok?missing(url):response);
      }catch{const hit=await cache.match(request,{ignoreVary:true});return hit&&safeResponse(hit)?hit:missing(url);}
    })());return;
  }
  // Hashed application bundles and local PWA files; no unrelated private routes.
  if(/\/assets\/[^/]+\.(?:js|css|woff2?)$/i.test(url.pathname)||/\/fonts\/[^/]+\.(?:ttf|otf|woff2?)$/i.test(url.pathname)||/\/(?:icon(?:-192|-512)?\.(?:svg|png)|manifest\.webmanifest)$/.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE),hit=await cache.match(request,{ignoreVary:true});
      if(hit&&safeResponse(hit))return hit;
      try{const response=await fetch(request);if(safeResponse(response))await save(CACHE,request,response);return response;}catch{return new Response('This application file is not available offline.',{status:503,headers:{'Content-Type':'text/plain'}});}
    })());
  }
});
