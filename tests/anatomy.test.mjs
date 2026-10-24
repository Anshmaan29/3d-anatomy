import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const data=JSON.parse(readFileSync(new URL('public/data/anatomy.json',root),'utf8'));
const ids=new Set(data.structures.map(s=>s.id));
function glb(path){const b=readFileSync(path);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());}
test('catalog IDs and anatomy metadata are complete and unique',()=>{
 assert.ok(data.structures.length>500,'real multi-system anatomy required');assert.equal(ids.size,data.structures.length);
 for(const s of data.structures){assert.match(s.id,/^FMA\d+$/);assert.ok(s.name.trim());assert.ok(s.system);assert.ok(s.region);assert.ok(s.bounds?.length===2);assert.ok(s.bounds.flat().every(Number.isFinite));assert.ok(s.bounds[0].every((n,i)=>n<=s.bounds[1][i]));}
});
test('every selectable catalog entry matches exactly one exported mesh',()=>{
 const occurrences=new Map();const systems=new Set(data.structures.map(s=>s.system));assert.ok(systems.size>=9);
 for(const system of systems){const path=new URL(`public/models/${system}.glb`,root);assert.ok(statSync(path).size<25*1024*1024,`${system} exceeds static host limit`);const doc=glb(path);for(const node of doc.nodes||[]){if(node.mesh===undefined)continue;assert.ok(ids.has(node.name),`unknown node ${node.name}`);assert.equal(data.structures.find(s=>s.id===node.name).system,system);occurrences.set(node.name,(occurrences.get(node.name)||0)+1);const mesh=doc.meshes[node.mesh];for(const primitive of mesh.primitives){const pos=doc.accessors[primitive.attributes.POSITION];assert.equal(pos.type,'VEC3');assert.ok(pos.count>=3);assert.ok(pos.min.every(Number.isFinite));assert.ok(pos.max.every(Number.isFinite));assert.ok(primitive.indices!==undefined);assert.ok(primitive.attributes.NORMAL!==undefined,'normals required');}}}
 assert.equal(occurrences.size,ids.size);assert.ok([...occurrences.values()].every(n=>n===1),'duplicate compound geometry');
});
test('source model preserves patient laterality and anterior direction',()=>{
 const find=name=>data.structures.find(s=>s.name.toLowerCase()===name);const mid=s=>s.bounds[0].map((n,i)=>(n+s.bounds[1][i])/2);
 const right=find('right femur'),left=find('left femur');assert.ok(right&&left,'bilateral femurs needed');assert.ok(mid(right)[0]<mid(left)[0],'patient right must render viewer left');
 const sternum=find('body of sternum')||find('manubrium')||find('sternum');const vertebra=data.structures.find(s=>/thoracic vertebra/i.test(s.name));assert.ok(sternum&&vertebra);assert.ok(mid(sternum)[2]>mid(vertebra)[2],'sternum should be anterior to thoracic spine');
});
test('application bundle has no oversized static files or copied proprietary app assets',()=>{
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);const publicRoot=new URL('public/',root);
 for(const file of walk(fileURLToPath(publicRoot))){assert.ok(statSync(file).size<25*1024*1024,file);assert.ok(!/\.casdb$|\.resS$|\.dylib$|\.assets$/.test(file));}
 assert.ok(existsSync(new URL('public/manifest.webmanifest',root)));assert.ok(existsSync(new URL('public/sw.js',root)));
});
test('balanced geometry preserves every named structure with fewer triangles',()=>{
 let high=0,balanced=0;
 for(const system of new Set(data.structures.map(s=>s.system))){const a=glb(new URL(`public/models/${system}.glb`,root)),b=glb(new URL(`public/models/balanced/${system}.glb`,root));assert.deepEqual(a.nodes.filter(n=>n.mesh!==undefined).map(n=>n.name).sort(),b.nodes.filter(n=>n.mesh!==undefined).map(n=>n.name).sort());for(const [doc,type] of [[a,'high'],[b,'balanced']])for(const mesh of doc.meshes)for(const p of mesh.primitives){const count=doc.accessors[p.indices].count/3;if(type==='high')high+=count;else balanced+=count;}}
 assert.ok(balanced<high*.7);assert.ok(balanced>0);
});
test('supplementary organs retain a separate licence and a disclosed alignment limitation',()=>{
 const supplement=JSON.parse(readFileSync(new URL('public/data/supplement.json',root),'utf8'));assert.equal(supplement.structures.length,6);const got=new Set();
 for(const path of new Set(supplement.structures.map(s=>s.assetPath))){const doc=glb(new URL('public'+path,root));for(const node of doc.nodes.filter(n=>n.mesh!==undefined))got.add(node.name);}
 for(const s of supplement.structures){assert.ok(got.has(s.id));assert.ok(!ids.has(s.id));assert.equal(s.sourceLicense,'CC-BY-SA-4.0');assert.ok(s.reviewStatus);assert.ok(s.bounds.flat().every(Number.isFinite));}
 assert.equal(got.size,6);assert.ok(existsSync(new URL('public/models/supplement/LICENSE.txt',root)));
});
