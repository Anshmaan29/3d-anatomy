import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/offline.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {currentViewAssets,glbDependencies,isAnatomyAssetUrl,downloadAnatomyView,clearAnatomyAssetCaches,prepareOfflineShell}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const origin='https://anatomy.example';
function glb(doc){const text=Buffer.from(JSON.stringify(doc));const length=Math.ceil(text.length/4)*4;const bytes=Buffer.alloc(20+length,32);bytes.writeUInt32LE(0x46546c67);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(length,12);bytes.writeUInt32LE(0x4e4f534a,16);text.copy(bytes,20);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}
function memoryCache(){const entries=new Map();return{entries,async match(url){return entries.get(String(url))?.clone();},async put(url,response){entries.set(String(url),response.clone());}};}

test('offline requests match renderer quality, exact version and shared model chunk deduplication',()=>{
 const items=[{id:'a',system:'muscular',assetPath:'/models/a.glb',balancedAssetPath:'/models/balanced/a.glb'},{id:'b',system:'muscular',assetPath:'/models/a.glb',balancedAssetPath:'/models/balanced/a.glb'},{id:'c',system:'skeletal'}];
 assert.deepEqual(currentViewAssets(items,['a','b','c'],'balanced','digest',origin),[origin+'/models/balanced/a.glb?v=digest',origin+'/models/balanced/skeletal.glb?v=digest']);
 assert.deepEqual(currentViewAssets(items,['a'],'high','digest',origin),[origin+'/models/a.glb?v=digest']);
});
test('GLB dependency parser preserves relative texture URLs and rejects malformed or external resources',()=>{
 const model=origin+'/models/atlas/muscular.glb?v=123';
 assert.deepEqual(glbDependencies(glb({images:[{uri:'textures/123.jpg'},{uri:'textures/123.jpg'},{uri:'data:image/png;base64,AA=='}],buffers:[{uri:'geometry.bin'}]}),model),[origin+'/models/atlas/textures/123.jpg',origin+'/models/atlas/geometry.bin']);
 assert.throws(()=>glbDependencies(new ArrayBuffer(4),model));
 assert.throws(()=>glbDependencies(glb({images:[{uri:'https://other.example/image.jpg'}]}),model),/outside/);
 assert.equal(isAnatomyAssetUrl(origin+'/models/a.glb',origin),true);
 assert.equal(isAnatomyAssetUrl(origin+'/login',origin),false);
 assert.equal(isAnatomyAssetUrl(origin+'/models/%2e%2e%2fsecret',origin),false);
});
test('offline downloader discovers textures, retries missing files and reuses successful cache entries',async()=>{
 const cache=memoryCache(),model=origin+'/models/a.glb?v=1',texture=origin+'/models/textures/a.jpg';let fail=true,calls=[];
 const fetcher=async url=>{calls.push(url);if(url===model)return new Response(glb({images:[{uri:'textures/a.jpg'}]}),{headers:{'content-type':'model/gltf-binary'}});if(fail)throw new Error('Network unavailable');return new Response('image',{headers:{'content-type':'image/jpeg'}});};
 let result=await downloadAnatomyView({urls:[model],origin,cache,signal:new AbortController().signal,fetcher});
 assert.equal(result.total,2);assert.equal(result.completed,1);assert.deepEqual(result.failed,[texture]);
 fail=false;calls=[];result=await downloadAnatomyView({urls:[model],origin,cache,signal:new AbortController().signal,fetcher});
 assert.deepEqual(calls,[texture]);assert.equal(result.cached,1);assert.equal(result.completed,2);assert.deepEqual(result.failed,[]);
});
test('HTML fallbacks are rejected and cancellation does not report a successful download',async()=>{
 const cache=memoryCache(),url=origin+'/models/a.glb?v=1';
 const result=await downloadAnatomyView({urls:[url],origin,cache,signal:new AbortController().signal,fetcher:async()=>new Response('<html>Login</html>',{headers:{'content-type':'text/html'}})});
 assert.equal(result.completed,0);assert.equal(cache.entries.size,0);assert.deepEqual(result.failed,[url]);
 const controller=new AbortController();controller.abort();
 await assert.rejects(downloadAnatomyView({urls:[url],origin,cache,signal:controller.signal}));
});
test('download concurrency is bounded and clearing touches only anatomy asset caches',async()=>{
 let active=0,maximum=0;
 await downloadAnatomyView({urls:Array.from({length:8},(_,i)=>origin+`/data/${i}.json`),origin,cache:memoryCache(),signal:new AbortController().signal,fetcher:async()=>{active++;maximum=Math.max(active,maximum);await new Promise(resolve=>setTimeout(resolve,2));active--;return new Response('{}',{headers:{'content-type':'application/json'}});}});
 assert.equal(maximum,3);
 const removed=[];
 await clearAnatomyAssetCaches({keys:async()=>['anatomy-studio-0123456789abcdef','anatomy-studio-0123456789abcdef-assets','unrelated-cache','anatomy-studio-dev-assets'],delete:async name=>{removed.push(name);return true;}});
 assert.deepEqual(removed,['anatomy-studio-0123456789abcdef-assets','anatomy-studio-dev-assets']);
});

test('service worker returns an asset failure rather than cached HTML when offline',async()=>{
 const handlers={},cache=memoryCache();
 const shell=new Response('<html>App shell</html>',{headers:{'content-type':'text/html'}});
 const cacheStorage={open:async name=>name.endsWith('-assets')?cache:{match:async()=>shell.clone()},keys:async()=>[]};
 const context={self:{registration:{scope:origin+'/'},location:{origin},addEventListener:(name,fn)=>handlers[name]=fn},caches:cacheStorage,URL,Response,fetch:async()=>{throw new Error('Offline');}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 for(const path of ['/models/a.glb?v=1','/data/atlas.json']){
  let response;
  handlers.fetch({request:{method:'GET',url:origin+path,mode:'cors'},respondWith:value=>response=value});
  const result=await response;assert.equal(result.status,503);assert.match(result.headers.get('content-type'),/json/);assert.doesNotMatch(await result.text(),/<html>/);
 }
});


test('first offline preparation saves built shell and exact JS/CSS dependencies, excluding sign-in HTML',async()=>{
 const cache=memoryCache(),controller=new AbortController(),requested=[];
 const shell='<html><div id="root"></div><script type="module" src="/assets/index-123.js"></script><link rel="modulepreload" href="/assets/three-456.js"><link rel="stylesheet" href="/assets/index-123.css"></html>';
 const fetcher=async url=>{requested.push(url);return new Response(url===origin+'/'?shell:'asset',{headers:{'content-type':url===origin+'/'?'text/html':'application/javascript'}});};
 await prepareOfflineShell({origin,cache,signal:controller.signal,fetcher});
 assert.equal(cache.entries.size,4);assert.ok(cache.entries.has(origin+'/'));
 assert.deepEqual(requested,[origin+'/',origin+'/assets/index-123.js',origin+'/assets/three-456.js',origin+'/assets/index-123.css']);
 const failedCache=memoryCache();
 await assert.rejects(prepareOfflineShell({origin,cache:failedCache,signal:controller.signal,fetcher:async()=>new Response('<html>Sign in</html>',{headers:{'content-type':'text/html'}})}),/built website/);
 assert.equal(failedCache.entries.size,0);
});

test('isolated organ downloads only request chunks containing visible structures',()=>{
 const structures=[{id:'organ',system:'cardiovascular',assetPath:'/models/atlas/heart-01.glb'},{id:'vessel',system:'cardiovascular',assetPath:'/models/atlas/heart-02.glb'},{id:'brain',system:'nervous',assetPath:'/models/atlas/brain.glb'}];
 assert.deepEqual(currentViewAssets(structures,['organ'],'high','1',origin),[origin+'/models/atlas/heart-01.glb?v=1']);
});

test('offline preparation follows same-origin font URLs inside the compiled stylesheet',async()=>{
 const cache=memoryCache(),requested=[];
 const shell='<html><div id="root"></div><script type="module" src="/assets/index.js"></script><link rel="stylesheet" href="/assets/index.css"></html>';
 const fetcher=async url=>{requested.push(url);return new Response(url===origin+'/'?shell:url.endsWith('.css')?"@font-face{src:url('/fonts/dm-sans-variable.ttf')} @font-face{src:url(\"/fonts/manrope-variable.ttf\")}":'asset',{headers:{'content-type':url===origin+'/'?'text/html':url.endsWith('.css')?'text/css':'application/octet-stream'}});};
 await prepareOfflineShell({origin,cache,signal:new AbortController().signal,fetcher});
 assert.ok(cache.entries.has(origin+'/fonts/dm-sans-variable.ttf'));
 assert.ok(cache.entries.has(origin+'/fonts/manrope-variable.ttf'));
 assert.equal(requested.length,5);
});

test('service worker static-cache hits survive Vary Origin when module/font requests add Origin',async()=>{
 const handlers={},checks=[];
 const cache={async match(request,options){
   const path=new URL(typeof request==='string'?request:request.url).pathname;
   checks.push({path,ignoreVary:options?.ignoreVary});
   // Reproduce a prefetched response stored from a no-Origin request with Vary: Origin.
   const requestOrigin=typeof request==='string'?null:request.headers.get('origin');
   if(requestOrigin&&!options?.ignoreVary)return undefined;
   return new Response('cached:'+path,{headers:{'content-type':path.endsWith('.css')?'text/css':path.endsWith('.js')?'application/javascript':'application/octet-stream','vary':'Origin'}});
 }};
 const context={self:{registration:{scope:origin+'/'},location:{origin},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache},URL,Response,fetch:async()=>{throw new Error('Server stopped');}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 for(const path of ['/assets/index.js','/assets/index.css','/fonts/manrope-variable.ttf','/models/heart.glb?v=1']){
  let response;
  handlers.fetch({request:new Request(origin+path,{headers:{Origin:origin}}),respondWith:value=>response=value});
  assert.ok(response,'service worker must handle '+path);
  const result=await response;assert.equal(result.status,200);assert.equal(await result.text(),'cached:'+new URL(origin+path).pathname);
 }
 assert.ok(checks.every(check=>check.ignoreVary===true));
});

test('offline preparation follows lazy viewer JavaScript and CSS before saving shell',async()=>{
 const root='https://anatomy.test/';const files=new Map([
 [root,new Response('<div id="root"></div><script src="/assets/index-main.js"></script>',{headers:{'content-type':'text/html'}})],
 [root+'assets/index-main.js',new Response('const table=["assets/Viewer-lazy.css"];const viewer=()=>import("./Viewer-lazy.js");',{headers:{'content-type':'text/javascript'}})],
 [root+'assets/Viewer-lazy.js',new Response('import "./three-core.js";',{headers:{'content-type':'text/javascript'}})],
 [root+'assets/Viewer-lazy.css',new Response('.notice{color:red}',{headers:{'content-type':'text/css'}})],
 [root+'assets/three-core.js',new Response('export const core=true;',{headers:{'content-type':'text/javascript'}})]
 ]);const stored=new Map();await prepareOfflineShell({origin:'https://anatomy.test',cache:{put:async(url,response)=>stored.set(url,response)},signal:new AbortController().signal,fetcher:async(url)=>{assert.ok(files.has(url),url);return files.get(url).clone();}});for(const path of files.keys())assert.ok(stored.has(path),path);
});

test('PWA manifest updates online and retains the last version offline',async()=>{
 const handlers={},stored=new Map();let online=true;
 const cache={put:async(request,response)=>stored.set(typeof request==='string'?request:request.url,response),match:async(request)=>stored.get(typeof request==='string'?request:request.url)?.clone()};
 const context={self:{registration:{scope:origin+'/'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache},URL,Response,fetch:async()=>{if(!online)throw new Error('Offline');return new Response('{"name":"Open Anatomy"}',{headers:{'content-type':'application/manifest+json'}});}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 for(const connected of [true,false]){online=connected;let response;handlers.fetch({request:new Request(origin+'/manifest.webmanifest'),respondWith:value=>response=value});assert.deepEqual(await(await response).json(),{name:'Open Anatomy'});}
});
