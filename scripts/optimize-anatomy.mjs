// npm install --prefix data-source/tooling --no-save --package-lock=false --ignore-scripts @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire(new URL('../data-source/tooling/node_modules/placeholder.js', import.meta.url));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {dedup,prune,meshopt}=require('@gltf-transform/functions');
const {MeshoptEncoder,MeshoptDecoder}=require('meshoptimizer');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const root=path.resolve(import.meta.dirname,'..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const dataPath=path.join(root,'public/data/anatomy.json');
const data=JSON.parse(await fs.readFile(dataPath,'utf8'));
const manifestPath=path.join(root,'public/data/licenses.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
for(const system of data.systems){
 const input=path.join(root,'data-source/generated',system.id+'.glb');
 const output=path.join(root,'public/models',system.id+'.glb');
 const doc=await io.read(input);
 const names=doc.getRoot().listNodes().map(n=>n.getName()).sort();
 await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 await io.write(output,doc);
 const check=await io.read(output);
 const after=check.getRoot().listNodes().map(n=>n.getName()).filter(Boolean).sort();
 if(JSON.stringify(names)!==JSON.stringify(after))throw new Error('Mesh name preservation failed '+system.id);
 const stat=await fs.stat(output);system.bytes=stat.size;
 if(stat.size>25*1024*1024)throw new Error('Static asset limit exceeded '+output);
 const manifestSystem=manifest.systems.find(s=>s.id===system.id);manifestSystem.bytes=stat.size;manifestSystem.sha256=createHash('sha256').update(await fs.readFile(output)).digest('hex');
 console.log(`${system.id}: ${names.length} nodes, ${(stat.size/1024/1024).toFixed(2)} MiB`);
}
await fs.writeFile(dataPath,JSON.stringify(data));await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(root,'public/data/provenance.json'),JSON.stringify(manifest,null,2));
