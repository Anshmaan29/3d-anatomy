// Selected, independently licensed anatomical geometry only. No upstream app code.
// Run from project root. Tool dependencies are kept out of application packages.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Document, NodeIO } from '../data-source/tooling/node_modules/@gltf-transform/core/dist/index.js';
import { ALL_EXTENSIONS } from '../data-source/tooling/node_modules/@gltf-transform/extensions/dist/index.js';
import { dedup, prune, meshopt } from '../data-source/tooling/node_modules/@gltf-transform/functions/dist/index.js';
import { MeshoptEncoder, MeshoptDecoder } from '../data-source/tooling/node_modules/meshoptimizer/index.js';
import draco from '../data-source/z-supplement/tooling/node_modules/draco3dgltf/draco3dgltf.js';
import { Matrix3, Matrix4, Vector3 } from 'three';
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule(),'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const bp=JSON.parse(await fs.readFile('public/data/anatomy.json','utf8'));
const transform=(p,m)=>new Vector3(...p).applyMatrix4(new Matrix4().fromArray(m)).toArray();
function bounds(n){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];const mesh=n.getMesh();if(!mesh)return null;const m=n.getWorldMatrix();for(const prim of mesh.listPrimitives()){const a=prim.getAttribute('POSITION');for(let i=0;i<a.getCount();i++){const p=transform(a.getElement(i,[]),m);for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}}}return {min,max,center:min.map((v,k)=>(v+max[k])/2)};}
const skeletal=await io.read('data-source/z-supplement/skeletal.glb');
function pair(za,name){const n=skeletal.getRoot().listNodes().find(n=>n.getExtras().za_name===za);const b=bp.structures.find(s=>s.name===name);if(!n||!b)throw new Error('Missing fit landmark '+name);return {za,bpName:name,zaBounds:bounds(n),bpBounds:b.bounds,bpCenter:b.center};}
const fitPairs=[['Femur.l','Left femur'],['Femur.r','Right femur'],['Humerus.l','Left humerus'],['Humerus.r','Right humerus'],['Mandible','Mandible']].map(p=>pair(...p));
const holdoutPairs=[['Tibia.l','Left tibia'],['Tibia.r','Right tibia'],['Clavicle.l','Left clavicle'],['Clavicle.r','Right clavicle'],['Body of sternum','Body of sternum'],['Vertebra T4','Fourth thoracic vertebra']].map(p=>pair(...p));
const a=fitPairs.map(p=>p.zaBounds.center),b=fitPairs.map(p=>p.bpCenter);const mean=pts=>[0,1,2].map(k=>pts.reduce((s,p)=>s+p[k],0)/pts.length),ca=mean(a),cb=mean(b);const aa=a.map(p=>p.map((v,k)=>v-ca[k])),bb=b.map(p=>p.map((v,k)=>v-cb[k]));
// Bilateral symmetry fixes patient right/left; fit uniform scale and sagittal rotation.
const A=aa.reduce((s,p,i)=>s+p[1]*bb[i][1]+p[2]*bb[i][2],0),B=aa.reduce((s,p,i)=>s+p[1]*bb[i][2]-p[2]*bb[i][1],0),angle=Math.atan2(B,A),c=Math.cos(angle),sn=Math.sin(angle);const rot=p=>[p[0],c*p[1]-sn*p[2],sn*p[1]+c*p[2]];
const scale=aa.reduce((s,p,i)=>s+rot(p).reduce((v,x,k)=>v+x*bb[i][k],0),0)/aa.reduce((s,p)=>s+p.reduce((v,x)=>v+x*x,0),0),translation=cb.map((x,k)=>x-scale*rot(ca)[k]);
const alignment=new Matrix4().makeRotationX(angle);alignment.scale(new Vector3(scale,scale,scale));alignment.setPosition(...translation);
for(const p of [...fitPairs,...holdoutPairs]){const predicted=transform(p.zaBounds.center,alignment.elements);p.predictedCenter=predicted;p.residualWorld=Math.hypot(...predicted.map((v,k)=>v-p.bpCenter[k]));p.residualMm=p.residualWorld/bp.transform.scale;}
console.log(JSON.stringify({fit:fitPairs.map(p=>({name:p.bpName,mm:p.residualMm})),heldout:holdoutPairs.map(p=>({name:p.bpName,mm:p.residualMm}))}));
const maximumHoldoutMm=Math.max(...holdoutPairs.map(p=>p.residualMm));const thoracicHoldout=holdoutPairs.filter(p=>!/tibia/i.test(p.bpName));if(Math.max(...thoracicHoldout.map(p=>p.residualMm))>10)throw new Error('Thoracic alignment insufficient: held-out center error exceeds 10 mm');
const visceral=await io.read('data-source/z-supplement/visceral.glb');
const selects=[
{id:'ZA_LUNG_LEFT_INFERIOR',name:'Inferior lobe of left lung',system:'respiratory',region:'Thorax',sourceNames:['Inferior lobe of left lung'],color:[.66,.42,.47,1],laterality:'left'},
{id:'ZA_LUNG_LEFT_SUPERIOR',name:'Superior lobe of left lung',system:'respiratory',region:'Thorax',sourceNames:['Superior lobe of left lung'],color:[.66,.42,.47,1],laterality:'left'},
{id:'ZA_LUNG_RIGHT_INFERIOR',name:'Inferior lobe of right lung',system:'respiratory',region:'Thorax',sourceNames:['Inferior lobe of right lung'],color:[.66,.42,.47,1],laterality:'right'},
{id:'ZA_LUNG_RIGHT_MIDDLE',name:'Middle lobe of right lung',system:'respiratory',region:'Thorax',sourceNames:['Middle lobe of right lung'],color:[.66,.42,.47,1],laterality:'right'},
{id:'ZA_LUNG_RIGHT_SUPERIOR',name:'Superior lobe of right lung',system:'respiratory',region:'Thorax',sourceNames:['Superior lobe of right lung'],color:[.66,.42,.47,1],laterality:'right'},
{id:'ZA_LIVER',name:'Liver',system:'digestive',region:'Abdomen',sourceNames:['Liver'],color:[.47,.23,.23,1],laterality:'midline / bilateral'}];
const structures=[],systems=[];
for(const system of ['respiratory','digestive']){
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(system+'-supplement');let triangles=0,vertices=0;
 for(const selected of selects.filter(s=>s.system===system)){
  const mesh=doc.createMesh(selected.id),node=doc.createNode(selected.id).setMesh(mesh),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const mat=doc.createMaterial(selected.id+'-material').setBaseColorFactor(selected.color).setRoughnessFactor(.6).setMetallicFactor(0).setDoubleSided(true);
  for(const sourceName of selected.sourceNames){
   const original=visceral.getRoot().listNodes().find(n=>n.getExtras().za_name===sourceName);if(!original?.getMesh())throw new Error('Missing exact source organ: '+sourceName);
   const world=new Matrix4().multiplyMatrices(alignment,new Matrix4().fromArray(original.getWorldMatrix())),normal=new Matrix3().getNormalMatrix(world);
   // Deliberately copy only the named node's own geometry, never children or siblings.
   for(const sourcePrimitive of original.getMesh().listPrimitives()){
    const primitive=doc.createPrimitive().setMaterial(mat);const position=sourcePrimitive.getAttribute('POSITION'),points=new Float32Array(position.getCount()*3);
    for(let i=0;i<position.getCount();i++){const p=new Vector3(...position.getElement(i,[])).applyMatrix4(world);p.toArray(points,i*3);for(let k=0;k<3;k++){min[k]=Math.min(min[k],p.getComponent(k));max[k]=Math.max(max[k],p.getComponent(k));}}
    primitive.setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(points).setBuffer(buffer));vertices+=position.getCount();
    const sourceNormals=sourcePrimitive.getAttribute('NORMAL');if(sourceNormals){const normals=new Float32Array(sourceNormals.getCount()*3);for(let i=0;i<sourceNormals.getCount();i++)new Vector3(...sourceNormals.getElement(i,[])).applyMatrix3(normal).normalize().toArray(normals,i*3);primitive.setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer));}
    const sourceIndices=sourcePrimitive.getIndices();if(sourceIndices){const arr=sourceIndices.getArray().slice();if(world.determinant()<0)for(let i=0;i<arr.length;i+=3)[arr[i+1],arr[i+2]]=[arr[i+2],arr[i+1]];primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(arr).setBuffer(buffer));triangles+=arr.length/3;}else triangles+=position.getCount()/3;
    mesh.addPrimitive(primitive);
   }
  }
  scene.addChild(node);
  structures.push({id:selected.id,name:selected.name,system,region:selected.region,laterality:selected.laterality,source:'Z-Anatomy adaptation',sourceId:selected.sourceNames.join(' + '),sourceNames:selected.sourceNames,sourceLicense:'CC-BY-SA-4.0',assetPath:`/models/supplement/${system}.glb`,bounds:[min,max],center:min.map((x,k)=>(x+max[k])/2),synonyms:[selected.name.toLowerCase(),...selected.sourceNames.map(n=>n.toLowerCase())],reviewStatus:'Alignment requires anatomy review'});
 }
 await doc.transform(dedup(),prune(),meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:16,quantizeNormal:12}));
 const path=`public/models/supplement/${system}.glb`;await io.write(path,doc);const data=await fs.readFile(path),check=await io.read(path);const ids=check.getRoot().listNodes().map(n=>n.getName()).filter(Boolean);if(ids.length!==selects.filter(s=>s.system===system).length)throw new Error('Node identity lost');
 systems.push({id:system,path:path.replace(/^public/,''),count:ids.length,triangles,vertices,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const attributions=['BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan','Z-Anatomy - The open source atlas of anatomy - CC-BY-SA 4.0'];
const provenance={version:'z-anatomy-gross-organs-2026-10-24',source:'Z-Anatomy via nqwrc public GLB exports',sourceUrls:['https://github.com/Z-Anatomy/Models-of-human-anatomy','https://github.com/nqwrc/3d-anatomy/tree/master/public/models'],license:'CC-BY-SA-4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',attributions,changes:'Extracted exact five lung lobe nodes and Liver node only; baked source hierarchy transforms; fitted to BodyParts3D with uniform scale, sagittal rotation and translation; replaced materials; Meshopt compressed. No source text or software copied.',excluded:'Kidneys, inner-ear structures, brain and white-matter models, source definitions and all other source structures excluded.',alignment:{status:'approximate; qualified anatomical review pending',method:'least squares bound-center fit: bilateral femora, bilateral humeri, mandible; independent tibiae, clavicles, sternum and T4 validation',scale,rotationXDegrees:angle*180/Math.PI,translation,matrixColumnMajor:alignment.elements,fitPairs,holdoutPairs,maximumHoldoutMm,maximumThoracicHoldoutMm:Math.max(...thoracicHoldout.map(p=>p.residualMm)),limitation:'Distal tibia bound centers differ by about 25 mm across releases. Torso organs use an approximate global skeletal registration, not exact patient correspondence.'},sourceFiles:[]};
for(const name of ['visceral.glb','skeletal.glb','License.txt','Z-Anatomy-License.txt','LICENSE','NOTICE']){const bytes=await fs.readFile(`data-source/z-supplement/${name}`);provenance.sourceFiles.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await fs.writeFile('public/data/supplement.json',JSON.stringify({version:provenance.version,source:provenance.source,license:provenance.license,attributions,systems,structures,alignmentNotice:'Models are aligned across source releases using skeletal landmarks. Fit/held-out residuals are recorded in supplement-provenance.json. Medical review is pending.'},null,2));
await fs.writeFile('public/data/supplement-provenance.json',JSON.stringify(provenance,null,2));
await fs.copyFile('data-source/z-supplement/License.txt','public/models/supplement/Z-Anatomy-upstream-notice.txt');
await fs.writeFile('public/models/supplement/LICENSE.txt',`SELECTED GROSS ORGAN GEOMETRY\n\n${attributions.join('\n')}\n\nSelected lung and liver geometry and this adaptation: Creative Commons Attribution-ShareAlike 4.0 International.\nhttps://creativecommons.org/licenses/by-sa/4.0/\n\nOriginal mesh export carrier: https://github.com/nqwrc/3d-anatomy/tree/master/public/models\nSource anatomical work: https://github.com/Z-Anatomy/Models-of-human-anatomy\n\n${provenance.changes}\n${provenance.excluded}\n\nThese models are educational source-labelled geometry. Spatial alignment is approximate; medical review is pending.\nSee /data/supplement-provenance.json for fit residuals and source SHA-256 records.\n`);
console.log(JSON.stringify({systems,structures:structures.map(s=>({id:s.id,name:s.name,bounds:s.bounds})),fitResidualMm:fitPairs.map(p=>({name:p.bpName,mm:p.residualMm})),holdoutResidualMm:holdoutPairs.map(p=>({name:p.bpName,mm:p.residualMm}))},null,2));
