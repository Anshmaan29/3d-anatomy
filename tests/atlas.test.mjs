import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, statSync} from 'node:fs';
import {dirname, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Matrix4, Quaternion, Vector3} from 'three';
import {MeshoptDecoder} from 'meshoptimizer';

const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const catalog=JSON.parse(readFileSync(resolve(publicRoot,'data/atlas.json'),'utf8'));
const structures=new Map(catalog.structures.map(s=>[s.id,s]));
const manifests=new Map(catalog.systems.map(s=>[s.path,s]));
const limit=25*1024*1024;

function publicPath(path){
 const absolute=resolve(publicRoot,'.'+path);
 assert.ok(!relative(publicRoot,absolute).startsWith('..'+sep),'asset escapes public directory');
 assert.ok(existsSync(absolute),`missing public asset ${path}`);
 assert.ok(statSync(absolute).size<limit,`static asset too large: ${path}`);
 return absolute;
}
function readGLB(path){
 const b=readFileSync(publicPath(path));
 assert.equal(b.readUInt32LE(0),0x46546c67,`${path} magic`);
 assert.equal(b.readUInt32LE(4),2,`${path} version`);
 assert.equal(b.readUInt32LE(8),b.length,`${path} byte length`);
 let json,bin;
 for(let offset=12;offset<b.length;){
  const size=b.readUInt32LE(offset),type=b.readUInt32LE(offset+4);
  assert.ok(offset+8+size<=b.length,`${path} chunk overflow`);
  if(type===0x4e4f534a)json=JSON.parse(b.subarray(offset+8,offset+8+size).toString());
  if(type===0x004e4942)bin=b.subarray(offset+8,offset+8+size);
  offset+=8+size;
 }
 assert.ok(json&&bin,`${path} JSON and binary chunks required`);
 return {json,bin};
}
const components={5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function geometryReader(doc,bin){
 const decoded=new Map();
 function view(i){
  if(decoded.has(i))return decoded.get(i);
  const v=doc.bufferViews[i],ext=v.extensions?.EXT_meshopt_compression;
  let bytes;
  if(ext){
   assert.equal(ext.buffer,0,'meshopt source must refer to GLB binary');
   assert.ok(ext.byteOffset+ext.byteLength<=bin.length,'compressed view overflow');
   bytes=new Uint8Array(ext.count*ext.byteStride);
   MeshoptDecoder.decodeGltfBuffer(bytes,ext.count,ext.byteStride,bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);
  }else{
   assert.equal(v.buffer,0,'uncompressed accessor cannot use absent fallback data');
   bytes=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  }
  assert.equal(bytes.length,v.byteLength,'decoded buffer length');
  decoded.set(i,bytes);return bytes;
 }
 return index=>{
  const a=doc.accessors[index];assert.ok(a&&!a.sparse,'non-sparse accessor required');
  const format=components[a.componentType],width=widths[a.type];assert.ok(format&&width,'supported accessor format');
  const data=view(a.bufferView),buffer=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const stride=doc.bufferViews[a.bufferView].byteStride||format[0]*width,offset=a.byteOffset||0;
  assert.ok(offset+(a.count-1)*stride+format[0]*width<=buffer.byteLength,'accessor out of bounds');
  return {count:a.count,width,value(i,c=0){let n=buffer[format[1]](offset+i*stride+c*format[0],true);if(a.normalized)n=Math.max(-1,n/format[2]);return n;}};
 };
}
function matrices(nodes){
 const parents=new Map();
 nodes.forEach((n,i)=>(n.children||[]).forEach(child=>{assert.ok(!parents.has(child),'node has multiple parents');parents.set(child,i);}));
 const worlds=new Map(),active=new Set();
 const world=i=>{
  if(worlds.has(i))return worlds.get(i);
  assert.ok(!active.has(i),'scene graph cycle');active.add(i);
  const n=nodes[i],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));
  if(parents.has(i))m.premultiply(world(parents.get(i)));
  active.delete(i);worlds.set(i,m);return m;
 };
 return world;
}

test('Atlas catalog has source identities, usable names and finite registered bounds',()=>{
 assert.ok(catalog.structures.length>=2200,'full source anatomy expected');
 assert.equal(structures.size,catalog.structures.length,'duplicate source identity');
 assert.equal(catalog.unmappedCodes.length,0,'unresolved source labels must not ship');
 for(const s of catalog.structures){
  assert.equal(s.id,'ATLAS_'+s.sourceCode);
  assert.ok(s.name?.trim()&&!/structure · [A-Za-z]+_M/.test(s.name),'coded placeholder label');
  assert.ok(s.region?.trim()&&s.groupName?.trim()&&s.reviewStatus?.trim());
  assert.ok(s.latinName?.trim()||s.dataQualityNotes?.length,`missing Latin label without source discrepancy note ${s.id}`);
  assert.match(s.sourceId,/^\d+$/,'numeric source catalog id');
  const suffix=s.sourceCode.match(/_MH?(\d+)$/);
  if(suffix)assert.equal(s.sourceId,suffix[1],`source code/id mismatch ${s.id}`);
  else assert.match(s.name,/internal surface/,`uncategorized non-code mesh ${s.id}`);
  assert.equal(s.bounds.length,2);assert.ok(s.bounds.every(p=>p.length===3));
  assert.ok(s.bounds.flat().every(v=>Number.isFinite(v)&&Math.abs(v)<10),`unregistered bounds ${s.id}`);
  assert.ok(s.bounds[0].every((v,i)=>v<=s.bounds[1][i]),`inverted bounds ${s.id}`);
  for(const [asset,quality] of [[s.assetPath,'high'],[s.balancedAssetPath,'balanced']]){
   const manifest=manifests.get(asset);assert.ok(manifest,`missing asset manifest ${asset}`);
   assert.match(manifest.id,/^(skeletal|muscular|cardiovascular|nervous|respiratory|digestive|urinary|reproductive|lymphatic|endocrine)$/);assert.equal(manifest.quality,quality);publicPath(asset); // Storage chunks can span corrected clinical system labels.
  }
  assert.equal(s.assetPath.split('/').at(-1),s.balancedAssetPath.split('/').at(-1),'quality chunk identities differ');
  if(s.latinName){
   const englishLeft=/\bleft\b/i.test(s.name),englishRight=/\bright\b/i.test(s.name);
   const latinRight=/\bdextr\w*/i.test(s.latinName),latinLeft=/\bsinistr\w*/i.test(s.latinName);
   if((englishLeft&&latinRight&&!latinLeft)||(englishRight&&latinLeft&&!latinRight)){
    assert.ok(s.dataQualityNotes?.length,`unflagged English/Latin laterality conflict ${s.id}`);
   }
  }
 }
});

test('Both Atlas qualities decode with valid topology, exact identities and matching spatial bounds',async()=>{
 await MeshoptDecoder.ready;
 const occurrences={high:new Map(),balanced:new Map()},triangles={high:0,balanced:0};
 for(const task of catalog.systems){
  const bytes=readFileSync(publicPath(task.path));assert.equal(bytes.length,task.bytes,'manifest size mismatch');assert.equal(createHash('sha256').update(bytes).digest('hex'),task.sha256,'manifest hash mismatch');
  const {json:doc,bin}=readGLB(task.path),read=geometryReader(doc,bin),world=matrices(doc.nodes||[]);
  const ids=[];let taskTriangles=0;
  for(const image of doc.images||[]){
   if(image.uri){assert.ok(!/^\w+:|^\//.test(image.uri),'texture URI must be a relative local asset');publicPath('/'+relative(publicRoot,resolve(dirname(publicPath(task.path)),decodeURIComponent(image.uri))));}
   else assert.ok(image.bufferView!==undefined,'image has neither pixels nor URI');
  }
  for(const material of doc.materials||[]){
   for(const reference of [material.pbrMetallicRoughness?.baseColorTexture,material.pbrMetallicRoughness?.metallicRoughnessTexture,material.normalTexture,material.occlusionTexture,material.emissiveTexture].filter(Boolean)){
    const texture=doc.textures?.[reference.index];assert.ok(texture,'material references absent texture');assert.ok(doc.images?.[texture.source],'texture references absent image');
   }
  }
  for(let i=0;i<(doc.nodes||[]).length;i++){
   const node=doc.nodes[i];if(node.mesh===undefined)continue;
   const s=structures.get(node.name);assert.ok(s,`unknown selectable node ${node.name}`);
   assert.equal(task.path,task.quality==='high'?s.assetPath:s.balancedAssetPath);
   occurrences[task.quality].set(node.name,(occurrences[task.quality].get(node.name)||0)+1);ids.push(node.name);
   const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]],v=new Vector3(),matrix=world(i);
   for(const p of doc.meshes[node.mesh].primitives){
    assert.equal(p.mode??4,4,'anatomical surfaces must be triangles');
    assert.ok(p.material!==undefined&&doc.materials?.[p.material],'surface references absent material');
    assert.ok(p.indices!==undefined&&p.attributes.POSITION!==undefined&&p.attributes.NORMAL!==undefined,'indexed surface with normals required');
    const pos=read(p.attributes.POSITION),normal=read(p.attributes.NORMAL),indices=read(p.indices);
    assert.equal(pos.width,3);assert.equal(pos.count,normal.count);assert.ok(pos.count>=3);
    assert.ok(indices.count>0&&indices.count%3===0,'invalid triangle count');triangles[task.quality]+=indices.count/3;taskTriangles+=indices.count/3;
    for(let n=0;n<indices.count;n++){const index=indices.value(n);assert.ok(Number.isInteger(index)&&index>=0&&index<pos.count,`index outside positions ${node.name}`);}
    for(let n=0;n<pos.count;n++){
     v.set(pos.value(n,0),pos.value(n,1),pos.value(n,2)).applyMatrix4(matrix);
     for(let axis=0;axis<3;axis++){const x=v.getComponent(axis);assert.ok(Number.isFinite(x),'non-finite position');bounds[0][axis]=Math.min(bounds[0][axis],x);bounds[1][axis]=Math.max(bounds[1][axis],x);assert.ok(Number.isFinite(normal.value(n,axis)),'non-finite normal');}
    }
    if(p.attributes.TEXCOORD_0!==undefined)assert.equal(read(p.attributes.TEXCOORD_0).count,pos.count,'UV/vertex count mismatch');
   }
   for(let end=0;end<2;end++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(bounds[end][axis]-s.bounds[end][axis])<=.001,`${task.quality} bounds mismatch ${node.name} axis${axis}: ${bounds[end][axis]} vs ${s.bounds[end][axis]}`);
  }
  assert.equal(ids.length,task.count,`manifest count ${task.path}`);
  assert.equal(taskTriangles,task.triangles,`manifest triangle count ${task.path}`);
 }
 for(const quality of ['high','balanced']){
  assert.equal(occurrences[quality].size,structures.size,`${quality} missing selectable structures`);
  for(const [id,n] of occurrences[quality])assert.equal(n,1,`${quality} duplicate ${id}`);
 }
 assert.ok(triangles.balanced>0&&triangles.balanced<=triangles.high,'balanced geometry must not grow');
});

test('Atlas registration preserves patient right and anterior skeletal landmarks',()=>{
 const find=name=>catalog.structures.find(s=>s.name===name),mid=s=>s.bounds[0].map((v,i)=>(v+s.bounds[1][i])/2);
 const right=find('Femur, Right'),left=find('Femur, Left'),sternum=find('Sternum'),spine=find('Thoracic Vertebra, T6');
 assert.ok(right&&left&&sternum&&spine,'required spatial reference structures');
 assert.ok(mid(right)[0]<0&&mid(left)[0]>0,'patient right must lie at negative X');
 assert.ok(mid(sternum)[2]>mid(spine)[2],'sternum must lie anterior to thoracic spine');
 assert.ok(Math.abs(mid(right)[1]-mid(left)[1])<.03,'bilateral femurs must share registration');
});

test('Atlas landmarks reference exported structures and finite surface positions',t=>{
 const path=resolve(publicRoot,'data/atlas-landmarks.json');
 if(!existsSync(path)){t.skip('landmark export has not been produced');return;}
 const data=JSON.parse(readFileSync(path,'utf8'));
 const rows=Array.isArray(data)?data:data.landmarks;
 assert.ok(Array.isArray(rows)&&rows.length>900,'full source landmark coverage expected');
 const ids=new Set();
 for(const mark of rows){
  assert.ok(!ids.has(mark.id),'duplicate landmark id');ids.add(mark.id);
  assert.ok(mark.name?.trim(),'landmark name');
  assert.ok(structures.has(mark.structureId),`unresolved landmark structure ${mark.structureId}`);
  assert.ok(mark.point?.length===3&&mark.point.every(v=>Number.isFinite(v)&&Math.abs(v)<10),'registered landmark position');
 }
});

 test('source-labeled urogenital teaching parts route to their anatomical systems',()=>{for(const [code,system] of Object.entries({Uro_M104:'urinary',Uro_M105:'urinary',Uro_M107:'urinary',Uro_M101:'endocrine',Uro_M21:'urinary',Uro_M253:'digestive',Uro_M52:'reproductive',Uro_M53:'reproductive'}))assert.equal(structures.get('ATLAS_'+code).system,system);for(const code of ['Uro_M11','Uro_M12',...Array.from({length:10},(_,i)=>'Uro_M'+(101+i))])assert.equal(structures.get('ATLAS_'+code).defaultHidden,true);});
