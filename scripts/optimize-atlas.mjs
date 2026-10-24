// Preserve every selectable node while compressing owner-authorized Atlas assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO,Format} from '../data-source/tooling/node_modules/@gltf-transform/core/dist/index.js';
import {ALL_EXTENSIONS} from '../data-source/tooling/node_modules/@gltf-transform/extensions/dist/index.js';
import {dedup,prune,meshopt,simplifyPrimitive,weld} from '../data-source/tooling/node_modules/@gltf-transform/functions/dist/index.js';
import {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier} from '../data-source/tooling/node_modules/meshoptimizer/index.js';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const base='data-source/atlas-analysis';
const catalog=JSON.parse(await fs.readFile('public/data/atlas.json','utf8'));
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const triangles=doc=>doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||0)/3,0),0);
const manifest=[];
for(const task of catalog.systems){
 const dir=task.quality==='balanced'?'public/models/atlas/balanced':'public/models/atlas';
 // Source image hashes are unique across qualities, so both can share this read directory.
 await fs.mkdir(`${base}/web-raw/textures`,{recursive:true});
 for(const textureDir of ['public/models/atlas/textures','public/models/atlas/balanced/textures'])for(const file of await fs.readdir(textureDir)){
   const dest=path.resolve(`${base}/web-raw/textures/${file}`);try{await fs.symlink(path.resolve(`${textureDir}/${file}`),dest);}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 const doc=await io.read(task.rawPath);
 const names=doc.getRoot().listNodes().map(n=>n.getName()).filter(Boolean).sort();
 const before=triangles(doc);
 if(task.quality==='balanced'&&!['cardiovascular','nervous','lymphatic'].includes(task.id)){
   await doc.transform(weld({overwrite:false}));
   for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
     // Keep fine anatomy untouched. Bound simplification error on larger surfaces.
     if((prim.getIndices()?.getCount()||0)>12000)simplifyPrimitive(prim,{simplifier:MeshoptSimplifier,ratio:.65,error:.0003,lockBorder:true});
   }
 }
 await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12,quantizeTexcoord:14}));
 const afterNames=doc.getRoot().listNodes().map(n=>n.getName()).filter(Boolean).sort();
 if(JSON.stringify(names)!==JSON.stringify(afterNames))throw new Error('Lost selectable node '+task.file);
 // Write compressed geometry in GLB while retaining shared, content-addressed images.
 // The second buffer is EXT_meshopt's declared fallback; it intentionally has no URI.
 const {json,resources}=await io.writeJSON(doc,{format:Format.GLTF});
 const geometryURI=json.buffers[0].uri;
 if(!geometryURI||!resources[geometryURI])throw new Error('Missing GLB buffer');
 const bin=Buffer.from(resources[geometryURI]);delete json.buffers[0].uri;
 for(const [uri,bytes] of Object.entries(resources))if(uri!==geometryURI){
   const dest=path.join(dir,uri);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);
 }
 let meta=Buffer.from(JSON.stringify(json));meta=Buffer.concat([meta,Buffer.alloc((4-meta.length%4)%4,32)]);
 const binary=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+meta.length+binary.length,8);header.writeUInt32LE(meta.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
 const payload=Buffer.concat([header,meta,bh,binary]);
 if(payload.length>=25*1024*1024)throw new Error('Static asset size limit '+task.file);
 const output=path.join(dir,task.file);await fs.writeFile(output,payload);
 const check=await io.read(output);const checked=check.getRoot().listNodes().map(n=>n.getName()).filter(Boolean).sort();
 if(JSON.stringify(checked)!==JSON.stringify(names))throw new Error('Read-back identity mismatch');
 manifest.push({id:task.id,quality:task.quality,path:output.replace(/^public/,''),count:names.length,originalTriangles:before,triangles:triangles(check),bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex')});
 console.log(`${task.quality} ${task.file}: ${names.length} structures, ${(payload.length/1e6).toFixed(2)} MB, ${triangles(check)} triangles`);
}
catalog.systems=manifest;await fs.writeFile('public/data/atlas.json',JSON.stringify(catalog));
const decode=JSON.parse(await fs.readFile(`${base}/decoded/summary.json`,'utf8'));
const labels=JSON.parse(await fs.readFile(`${base}/labels/summary.json`,'utf8'));
const texture=JSON.parse(await fs.readFile(`${base}/textures/summary.json`,'utf8'));
const sourceFiles=decode.files.map(({file,sha256,bytes})=>({file,sha256,bytes}));
await fs.writeFile('public/data/atlas-provenance.json',JSON.stringify({version:catalog.version,source:catalog.source,permissionBasis:catalog.permissionBasis,structures:catalog.structures.length,unmappedCodes:catalog.unmappedCodes,registration:catalog.registration,limitations:catalog.limitations,sourceFiles,geometry:{meshes:decode.meshObjects,vertices:decode.decodedVertices,triangles:decode.decodedTriangles,archiveBytes:decode.geometryBytes,failures:decode.failures},catalog:{modelRecords:labels.modelRows,landmarkRecords:labels.pinRows,musclesWithEnglishDetails:labels.muscleEnglishDetailsRows,evidence:labels.evidence},texture,systems:manifest},null,2));
console.log('ATLAS WEB GEOMETRY BYTES',manifest.reduce((n,m)=>n+m.bytes,0));
