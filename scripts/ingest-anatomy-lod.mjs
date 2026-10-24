// Generate a mobile-friendly LOD while retaining all source-labelled structures.
// Run after ingest-anatomy.py and optimize-anatomy.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../data-source/tooling/node_modules/placeholder.js',import.meta.url));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dedup,prune,weld,simplifyPrimitive,meshopt}=require('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder,MeshoptSimplifier}=require('meshoptimizer');
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
const root=path.resolve(import.meta.dirname,'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const dataPath=path.join(root,'public/data/anatomy.json');
const data=JSON.parse(await fs.readFile(dataPath,'utf8'));
const manifestPath=path.join(root,'public/data/licenses.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
await fs.mkdir(path.join(root,'public/models/balanced'),{recursive:true});
const metrics=[];
for(const system of data.systems){
 const doc=await io.read(path.join(root,'data-source/generated',system.id+'.glb'));
 const names=doc.getRoot().listNodes().map(n=>n.getName()).sort();
 await doc.transform(weld());
 let originalTriangles=0,balancedTriangles=0,simplified=0,retainedSmall=0;
 for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
  const before=prim.getIndices().getCount()/3;originalTriangles+=before;
  const p=prim.getAttribute('POSITION');const min=p.getMin([]),max=p.getMax([]);
  const extent=Math.max(...min.map((x,i)=>max[i]-x));
  // Preserve small structures and low-poly vessels. For larger surfaces the
  // error ceiling, topology and locked borders take precedence over the ratio.
  if(before>=2048 && extent>=0.03){
   simplifyPrimitive(prim,{simplifier:MeshoptSimplifier,ratio:0.4,error:0.002,lockBorder:true});simplified++;
  }else retainedSmall++;
  if(!prim.getIndices().getCount())throw new Error('LOD removed structure '+mesh.getName());
  balancedTriangles+=prim.getIndices().getCount()/3;
 }
 await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 const output=path.join(root,'public/models/balanced',system.id+'.glb');await io.write(output,doc);
 const check=await io.read(output);
 const after=check.getRoot().listNodes().map(n=>n.getName()).filter(Boolean).sort();
 if(JSON.stringify(names)!==JSON.stringify(after))throw new Error('LOD lost a named structure '+system.id);
 const bytes=await fs.readFile(output);
 if(bytes.length>25*1024*1024)throw new Error('LOD exceeds static hosting limit');
 const record={system:system.id,nodes:names.length,originalTriangles,balancedTriangles,ratio:balancedTriangles/originalTriangles,simplifiedPrimitives:simplified,retainedSmallPrimitives:retainedSmall,path:'/models/balanced/'+system.id+'.glb',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 metrics.push(record);system.balancedPath=record.path;system.balancedBytes=record.bytes;system.balancedTriangles=balancedTriangles;
 console.log(`${system.id}: ${originalTriangles} -> ${balancedTriangles} triangles, ${(bytes.length/1024/1024).toFixed(2)} MiB, ${names.length} structures preserved`);
}
manifest.balancedLOD={method:'Meshopt simplification from original float geometry before compression, ratio target 0.4, error ceiling 0.002 relative to mesh radius, lockBorder true. All named nodes retained; primitives below 2048 triangles or 0.03 world units maximum extent remain unsimplified. No clinical validation of LOD geometry.',metrics};
manifest.modifications=manifest.modifications.replace('No further polygon decimation.','High-detail GLBs preserve original source triangles.')+' Balanced LOD additionally uses bounded meshopt simplification; high-detail GLBs retain original source triangles.';
manifest.limits.push('Gross lung parenchyma and full liver surfaces are not supplied as separate element meshes in this archive; respiratory and liver compounds contain bronchial, vascular or biliary elements. Spinal cord source compound maps the central canal only. Thyroid gland surface is absent.');
await fs.writeFile(dataPath,JSON.stringify(data));
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(root,'public/data/provenance.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(root,'data-source/lod-metrics.json'),JSON.stringify(metrics,null,2));
