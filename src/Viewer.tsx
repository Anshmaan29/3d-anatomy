import { Component, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { Structure, SystemId, ViewerHandle, ViewerProps } from './types';
import { useTheme } from './ThemeProvider';
import AnchoredLabels from './AnchoredLabels';
import type { AnchoredLabel } from './AnchoredLabels';
import { createLoadQueue, fitViewDistance, requestedModelAssets, sectionCoordinate, sectionCut } from './viewer-utils';
import type { ViewDirection } from './viewer-utils';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import './viewer.css';

const cache = new Map<string, Promise<THREE.Group>>();
const scheduleLoad = createLoadQueue(2);
THREE.Mesh.prototype.raycast = acceleratedRaycast;
// Leases protect mounted geometry and current requests across overlapping viewer lifecycles.
const assetLeases=new Map<symbol,{requests:Set<string>;scenes:Set<THREE.Group>}>();
function sweepCache(){
  for(const [key,pending] of cache)pending.then(scene=>{
    const retained=[...assetLeases.values()].some(lease=>lease.requests.has(key)||lease.scenes.has(scene));
    if(!retained&&cache.get(key)===pending){cache.delete(key);disposeScene(scene);}
  }).catch(()=>{});
}
const accelerationJobs=new Map<THREE.BufferGeometry,()=>void>();
function scheduleAcceleration(scene:THREE.Group){
  scene.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const geometry=node.geometry;
    if(geometry.boundsTree||accelerationJobs.has(geometry)||(geometry.index?.count??geometry.attributes.position.count)<15000)return;
    let cancelled=false;let idle:number|undefined;
    const run=()=>{accelerationJobs.delete(geometry);if(cancelled||geometry.boundsTree)return;try{computeBoundsTree.call(geometry,{maxLeafTris:12});}catch{/* Unsupported geometry keeps Three.js's standard raycaster. */}};
    const frame=requestAnimationFrame(()=>{if(cancelled)return;idle=window.requestIdleCallback?window.requestIdleCallback(run,{timeout:1500}):window.setTimeout(run,64);});
    accelerationJobs.set(geometry,()=>{cancelled=true;cancelAnimationFrame(frame);if(idle!==undefined){if(window.cancelIdleCallback)window.cancelIdleCallback(idle);else clearTimeout(idle);}});
  });
}
// Shared immutable images avoid uploading the same atlas texture once per chunk.
const texturePool=new Map<string,{texture:THREE.Texture;scenes:number}>();
const sceneTextureKeys=new WeakMap<THREE.Group,Set<string>>();
function disposeScene(scene:THREE.Group){
  const materials=new Set<THREE.Material>();
  scene.traverse(node=>{if(node instanceof THREE.Mesh){accelerationJobs.get(node.geometry)?.();accelerationJobs.delete(node.geometry);disposeBoundsTree.call(node.geometry);node.geometry.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material])materials.add(mat);}});
  materials.forEach(mat=>mat.dispose());
  for(const key of sceneTextureKeys.get(scene)||[]){const pooled=texturePool.get(key);if(pooled&&--pooled.scenes===0){pooled.texture.dispose();texturePool.delete(key);}}
  sceneTextureKeys.delete(scene);
}

function loadSystem(system: SystemId, quality: ViewerProps['quality'],assetPath?:string): Promise<THREE.Group> {
  const key=assetPath||`${quality}/${system}`;
  const existing = cache.get(key); if (existing) return existing;
  const path=assetPath||`/models/${quality==='balanced'?'balanced/':''}${system}.glb`;
  const pending = scheduleLoad(async () => {
    const response = await fetch(`${path}?v=${import.meta.env.VITE_MODEL_VERSION||'dev'}`);
    if (!response.ok) {const issue=response.status===503?await response.clone().json().catch(()=>null):null;throw new Error(issue?.error==='This anatomy file is not available offline.'?'This view is not saved for offline study. Reconnect and download it from Settings.':`The ${system} model could not be loaded (${response.status}).`);}
    const bytes = await response.arrayBuffer();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, path.slice(0,path.lastIndexOf('/')+1));
    const keys=new Set<string>();
    gltf.scene.traverse(node=>{
      if(!(node instanceof THREE.Mesh))return;
      for(const material of Array.isArray(node.material)?node.material:[node.material]){
        const maps=material as unknown as Record<string,unknown>;
        for(const slot of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap']){
          const texture=maps[slot];if(!(texture instanceof THREE.Texture))continue;
          const association=gltf.parser.associations.get(texture);
          const textureIndex=association?.textures;
          const source=textureIndex===undefined?undefined:gltf.parser.json.textures?.[textureIndex]?.source;
          const uri=source===undefined?undefined:gltf.parser.json.images?.[source]?.uri;
          if(!uri)continue;
          const key=path.slice(0,path.lastIndexOf('/')+1)+uri+':'+texture.colorSpace+':'+texture.wrapS+':'+texture.wrapT+':'+texture.repeat.toArray()+':'+texture.offset.toArray();
          const pooled=texturePool.get(key);
          if(pooled){maps[slot]=pooled.texture;if(texture!==pooled.texture)texture.dispose();}
          else texturePool.set(key,{texture,scenes:0});
          keys.add(key);
        }
      }
    });
    for(const key of keys)texturePool.get(key)!.scenes++;
    sceneTextureKeys.set(gltf.scene,keys);
    gltf.scene.updateMatrixWorld(true); return gltf.scene;
  }).catch(error => {cache.delete(key); throw error;});
  cache.set(key, pending); return pending;
}
const PALETTE: Record<SystemId,string> = {skeletal:'#b9a589',muscular:'#ad6260',cardiovascular:'#ba5355',nervous:'#d5b55b',respiratory:'#c799a2',digestive:'#b98e6b',urinary:'#b47a70',reproductive:'#ba9ca4',lymphatic:'#86a685',endocrine:'#b79bd0'};
interface Entry {sourceMaterial?:THREE.Material|THREE.Material[];id:string; geometry:THREE.BufferGeometry; matrix:THREE.Matrix4; center:THREE.Vector3; system:SystemId; name:string;}
interface SceneProps extends ViewerProps { apiRef:React.ForwardedRef<ViewerHandle>; }

function AnatomyScene(props:SceneProps) {
  const {structures,activeSystems,selectedId,hiddenIds,isolatedId,opacity,exploded,labels,section,apiRef} = props;
  const { resolvedTheme } = useTheme();
  const selectedSet = useMemo(() => new Set(props.selectedIds?.length ? props.selectedIds : selectedId ? [selectedId] : []), [props.selectedIds, selectedId]);
  const isolatedSet = useMemo(() => new Set(props.isolatedIds?.length ? props.isolatedIds : isolatedId ? [isolatedId] : []), [props.isolatedIds, isolatedId]);
  const leaseToken=useRef(Symbol('anatomy-viewer'));
  const lease=useRef({requests:new Set<string>(),scenes:new Set<THREE.Group>()});
  const controls = useRef<OrbitControlsImpl>(null);
  const {camera,gl,invalidate,size} = useThree();
  const [scenes,setScenes]=useState<Array<{system:SystemId;scene:THREE.Group}>>([]);
  const [hovered,setHovered]=useState<string|null>(null);
  const propsRef=useRef(props); propsRef.current=props;
  const move=useRef<{position:THREE.Vector3;target:THREE.Vector3}|null>(null);
  const pendingFocus=useRef<string|null>(null);
  const initialFocusDone=useRef(false);
  const orientationRef=useRef('anterior');
  const selectedRef=useRef(selectedId); selectedRef.current=selectedId;
  const requestedAssets=requestedModelAssets({structures,activeSystems,hiddenIds,isolatedIds:[...isolatedSet],dataset:props.dataset,quality:props.quality});
  const systemsKey=props.dataset+':'+props.quality+':'+requestedAssets.map(a=>a.system+':'+a.assetPath).sort().join(',');
  const structureMap=useMemo(()=>new Map(structures.map(s=>[s.id,s])),[structures]);
  useEffect(()=>{
    let cancelled=false;
    lease.current.requests=new Set(requestedAssets.map(({system,assetPath})=>assetPath||`${props.quality}/${system}`));
    assetLeases.set(leaseToken.current,lease.current);sweepCache();
    propsRef.current.onLoading?.(true);let completed=0;propsRef.current.onProgress?.({loaded:0,total:requestedAssets.length});
    Promise.all(requestedAssets.map(async ({system,assetPath})=>{const scene=await loadSystem(system,props.quality,assetPath);if(!cancelled)propsRef.current.onProgress?.({loaded:++completed,total:requestedAssets.length});return{system,scene};})).then(value=>{
      if(cancelled)return;setScenes(value);propsRef.current.onLoading?.(false);
    }).catch(error=>{if(!cancelled){propsRef.current.onLoading?.(false);propsRef.current.onError?.(String(error.message||error));}});
    return()=>{cancelled=true;};
  // Only a change in requested assets starts loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[systemsKey]);
  useEffect(()=>{
    lease.current.scenes=new Set(scenes.map(item=>item.scene));
    assetLeases.set(leaseToken.current,lease.current);
    for(const item of scenes)scheduleAcceleration(item.scene);
    sweepCache();
  },[scenes]);
  useEffect(()=>()=>{assetLeases.delete(leaseToken.current);sweepCache();},[]);
  const entries=useMemo(()=>{
    const list:Entry[]=[];
    for(const {system,scene} of scenes) scene.traverse(node=>{
      if(!(node instanceof THREE.Mesh))return;
      let parent:THREE.Object3D|null=node;let structure:Structure|undefined;
      while(parent&&!structure){structure=structureMap.get(parent.name);parent=parent.parent;}
      if(!structure)return;
      const geometry=node.geometry as THREE.BufferGeometry;
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const center=new THREE.Vector3();geometry.boundingBox?.getCenter(center);center.applyMatrix4(node.matrixWorld);
      list.push({sourceMaterial:props.dataset==='atlas'?node.material:undefined,id:structure.id,geometry,matrix:node.matrixWorld.clone(),center,system:structure.system,name:structure.name});
    });
    return list;
  },[scenes,structureMap,props.dataset]);
  useEffect(()=>{initialFocusDone.current=false;},[props.dataset]);
  const hiddenSet=useMemo(()=>new Set(hiddenIds),[hiddenIds]);
  const visible=useMemo(()=>entries.filter(e=>activeSystems.includes(e.system)&&!hiddenSet.has(e.id)&&(!isolatedSet.size||isolatedSet.has(e.id))),[entries,activeSystems,hiddenSet,isolatedSet]);
  useEffect(()=>{
    propsRef.current.onReady?.({meshes:visible.length,triangles:visible.reduce((n,e)=>n+(e.geometry.index?.count??e.geometry.attributes.position.count)/3,0)});
    invalidate();
  },[visible,invalidate]);
  const travel=(position:THREE.Vector3,target:THREE.Vector3)=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(position);controls.current?.target.copy(target);controls.current?.update();invalidate();}
    else {move.current={position,target};invalidate();}
  };
  const focus=(id?:string)=>{
    const focusId=id||selectedRef.current;const items=entries.filter(e=>e.id===focusId);if(!items.length){pendingFocus.current=focusId;return;}pendingFocus.current=null;
    const box=new THREE.Box3();for(const e of items){const b=e.geometry.boundingBox?.clone().applyMatrix4(e.matrix);if(b)box.union(b);}
    const center=box.getCenter(new THREE.Vector3());
    const radius=box.getSize(new THREE.Vector3()).length()/2;
    const distance=Math.max(.24,radius/Math.tan(THREE.MathUtils.degToRad(17))*1.3);
    const direction=camera.position.clone().sub(controls.current?.target||new THREE.Vector3()).normalize();
    travel(center.clone().addScaledVector(direction,distance),center);
  };
  useEffect(()=>{if(pendingFocus.current&&entries.some(e=>e.id===pendingFocus.current))focus(pendingFocus.current);},[entries]);
  useEffect(()=>{
    const landmark=props.landmarks?.find(item=>item.id===props.focusedLandmarkId);
    if(!landmark||!entries.some(entry=>entry.id===landmark.structureId))return;
    const point=new THREE.Vector3(...landmark.point);
    const distance=Math.max(.75,Math.min(1.4,camera.position.distanceTo(controls.current?.target||point)));
    const direction=camera.position.clone().sub(controls.current?.target||new THREE.Vector3()).normalize();
    travel(point.clone().addScaledVector(direction,distance),point);
  },[props.focusedLandmarkId,props.landmarks,entries]);

  useEffect(()=>{if(!initialFocusDone.current&&entries.length){initialFocusDone.current=true;if(selectedRef.current)focus(selectedRef.current);else home();}},[entries]);
  const home=(direction:ViewDirection='anterior')=>{
    const box=new THREE.Box3();for(const entry of visible){const bounds=entry.geometry.boundingBox?.clone().applyMatrix4(entry.matrix);if(bounds)box.union(bounds);}
    if(box.isEmpty()){travel(new THREE.Vector3(0,.08,6.5),new THREE.Vector3());return;}
    const center=box.getCenter(new THREE.Vector3()),extent=box.getSize(new THREE.Vector3());
    const distance=fitViewDistance(extent.toArray() as [number,number,number],size.width/size.height,direction);
    const directions:Record<ViewDirection,[number,number,number]>={anterior:[0,0,1],posterior:[0,0,-1],left:[1,0,0],right:[-1,0,0],superior:[0,1,.001]};
    travel(center.clone().add(new THREE.Vector3(...directions[direction]).normalize().multiplyScalar(distance)),center);
  };
  // Capture the same rendered scene and include attribution in the download.
  const scene=useThree(state=>state.scene);
  useImperativeHandle(apiRef,()=>({getCamera:()=>({position:camera.position.toArray() as [number,number,number],target:(controls.current?.target.toArray()||[0,0,0]) as [number,number,number]}),restoreCamera:(state)=>{if(state.position.every(Number.isFinite)&&state.target.every(Number.isFinite))travel(new THREE.Vector3(...state.position),new THREE.Vector3(...state.target));},home,focus,focusPoint:(coordinates)=>{if(!coordinates.every(Number.isFinite))return;const target=new THREE.Vector3(...coordinates),direction=camera.position.clone().sub(controls.current?.target||new THREE.Vector3()).normalize();const distance=Math.max(.3,Math.min(1.2,camera.position.distanceTo(controls.current?.target||target)));travel(target.clone().addScaledVector(direction,distance),target);},view:(direction)=>{
    const target=controls.current?.target.clone()||new THREE.Vector3();const distance=Math.max(1,camera.position.distanceTo(target));
    const directions:Record<string,[number,number,number]>={anterior:[0,0,1],posterior:[0,0,-1],left:[1,0,0],right:[-1,0,0],superior:[0,1,.001]};
    travel(new THREE.Vector3(...directions[direction]).multiplyScalar(distance).add(target),target);
  },zoom:(delta)=>{const target=controls.current?.target.clone()||new THREE.Vector3();const offset=camera.position.clone().sub(target).multiplyScalar(delta<0?.8:1.25).clampLength(.15,12);travel(target.clone().add(offset),target);},screenshot:()=>{
    gl.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=gl.domElement.width;canvas.height=gl.domElement.height+70;
    const context=canvas.getContext('2d');if(!context)return;context.fillStyle=resolvedTheme==='dark'?'#101b1b':'#f4f3ee';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(gl.domElement,0,0);
    for(const note of propsRef.current.annotations||[]){
      const entry=visible.find(item=>item.id===note.structureId);if(!entry)continue;
      const offset=exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3();
      const projection=new THREE.Vector3(...note.point).add(offset).project(camera);if(Math.abs(projection.x)>1||Math.abs(projection.y)>1||projection.z>1||projection.z< -1||(section&&clipPlane.distanceToPoint(new THREE.Vector3(...note.point))<0))continue;
      const px=(projection.x+1)/2*gl.domElement.width,py=(1-projection.y)/2*gl.domElement.height;
      const cardWidth=Math.min(250,canvas.width*.37),font=Math.max(10,Math.min(16,canvas.width/70));
      context.font=`${font}px sans-serif`;const words=note.text.split(' '),lines:string[]=[];let line='';
      for(const word of words){if(context.measureText(line+' '+word).width>cardWidth-24&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);
      const height=lines.length*(font+5)+27,x=Math.max(12,Math.min(px+38,canvas.width-cardWidth-12)),y=Math.max(12,Math.min(py-24,gl.domElement.height-height-10));
      context.strokeStyle='#6b9a83';context.lineWidth=1.5;context.beginPath();context.moveTo(px,py);context.lineTo(x,y+height/2);context.stroke();
      context.fillStyle=resolvedTheme==='dark'?'#1c302bf5':'#fffffff2';context.fillRect(x,y,cardWidth,height);context.strokeRect(x,y,cardWidth,height);context.fillStyle=resolvedTheme==='dark'?'#e2eee4':'#244c3e';
      lines.forEach((text,index)=>context.fillText(text,x+12,y+19+index*(font+5)));
      context.beginPath();context.arc(px,py,4,0,Math.PI*2);context.fill();
    }
    context.fillStyle=resolvedTheme==='dark'?'#b9cbbd':'#314846';context.font=`${Math.max(8,Math.min(14,canvas.width/65))}px sans-serif`;context.fillText(propsRef.current.dataset==='atlas'?'Anatomy Studio · Atlas source: Catfish Animation Studio':'Anatomy Studio · BodyParts3D © DBCLS · CC BY 4.0',14,canvas.height-39);context.fillText(propsRef.current.dataset==='atlas'?'Adapted with permission confirmed by project owner · anatomy review pending':'Lung/liver adaptations: Z-Anatomy · CC BY-SA 4.0 · anatomy review pending',14,canvas.height-17);
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='anatomy-studio.png';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),3000);});
  }}));
  useFrame((_state,delta)=>{
    if(!move.current||!controls.current)return;
    const alpha=1-Math.exp(-delta*9);camera.position.lerp(move.current.position,alpha);controls.current.target.lerp(move.current.target,alpha);controls.current.update();
    if(camera.position.distanceTo(move.current.position)<.0005){camera.position.copy(move.current.position);controls.current.target.copy(move.current.target);move.current=null;}
    invalidate();
  });
  useEffect(()=>{document.body.style.cursor=props.placingAnnotation?'crosshair':hovered?'pointer':'';return()=>{document.body.style.cursor='';};},[hovered,props.placingAnnotation]);
  const clipPlane=useMemo(()=>{
    const bounds=new THREE.Box3();
    for(const entry of visible){const box=entry.geometry.boundingBox?.clone().applyMatrix4(entry.matrix);if(box)bounds.union(box);}
    const coordinate=sectionCoordinate(props.sectionAxis||'coronal');
    const axis=['x','y','z'][coordinate] as 'x'|'y'|'z';
    const cut=bounds.isEmpty()?0:sectionCut(bounds.min[axis],bounds.max[axis],props.sectionPosition??.5);
    const normal=new THREE.Vector3();normal.setComponent(coordinate,props.sectionFlip?1:-1);
    return new THREE.Plane(normal,props.sectionFlip?-cut:cut);
  },[visible,props.sectionAxis,props.sectionPosition,props.sectionFlip]);
  const inSection=(point:THREE.Vector3)=>!section||clipPlane.distanceToPoint(point)>=0;
  useEffect(()=>{gl.setClearColor(resolvedTheme==='dark'?'#101b1b':'#f4f3ee',0);invalidate();},[resolvedTheme,gl,invalidate]);
  const landmarkEntries=useMemo(()=>{
    if(!labels)return[];
    const preferred=[/frontal bone/i,/sternum/i,/left humerus/i,/right radius/i,/left femur/i,/right tibia/i,/heart$/i,/liver$/i,/left lung$/i,/brain$/i];
    return preferred.map(regex=>visible.find(e=>regex.test(e.name))).filter((e):e is Entry=>!!e&&e.id!==selectedId).slice(0,6);
  },[labels,visible,selectedId]);
  const sourceLandmarks=useMemo(()=>{
    if(!labels||!selectedId)return[];
    const options=(props.landmarks||[]).filter(note=>note.structureId===selectedId&&visible.some(e=>e.id===note.structureId));
    const focused=options.find(note=>note.id===props.focusedLandmarkId);
    // Keep the focused feature readable; the inspector provides all other landmarks.
    return focused?[focused]:options.slice(0,6);
  },[labels,selectedId,props.landmarks,props.focusedLandmarkId,visible]);
  return <>
    <ambientLight intensity={resolvedTheme==='dark'?.3:.24}/><hemisphereLight args={['#fff9e9',resolvedTheme==='dark'?'#56665e':'#778a83',.85]}/>
    <directionalLight position={[-3,5,5]} intensity={2.7} color="#fff1d8"/>
    <directionalLight position={[4,1,-3]} intensity={1.7} color="#c7dedd"/>
    <directionalLight position={[0,2,5]} intensity={.35}/>
    <group>
    {visible.map((entry,index)=><AnatomyMesh key={`${entry.system}-${entry.id}-${index}`} entry={entry} selected={selectedSet.has(entry.id)} hovered={entry.id===hovered} opacity={Math.min(1,Math.max(0,props.structureOpacities?.[entry.id]??(selectedSet.has(entry.id)?1:opacity)))} exploded={exploded} clipPlane={section?clipPlane:null} onHover={setHovered} onSelect={props.onSelect} onFocus={focus} placing={!!props.placingAnnotation} onAnchor={props.onAnnotationAnchor}/>)}
    </group>
    <AnchoredLabels items={[
      ...(props.annotations||[]).filter(note=>visible.some(e=>e.id===note.structureId)&&inSection(new THREE.Vector3(...note.point))).map(note=>{const entry=visible.find(e=>e.id===note.structureId)!;return{id:note.id,text:note.text,kind:'note',point:new THREE.Vector3(...note.point).add(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3())} as AnchoredLabel;}),
      ...sourceLandmarks.filter(note=>inSection(new THREE.Vector3(...note.point))).map(note=>{const entry=visible.find(e=>e.id===note.structureId)!;return{id:note.id,text:note.name,kind:'landmark',point:new THREE.Vector3(...note.point).add(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3())} as AnchoredLabel;}),
      ...landmarkEntries.filter(entry=>inSection(entry.center)).map(entry=>({id:'context-'+entry.id,text:entry.name,kind:'context',point:entry.center.clone().add(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3())} as AnchoredLabel)),
      ...visible.filter(entry=>labels&&selectedSet.has(entry.id)&&inSection(entry.center)).slice(0,6).map(entry=>({id:'selection-'+entry.id,text:entry.name,kind:'selection',point:entry.center.clone().add(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3())} as AnchoredLabel))
    ]}/>
    <OrbitControls onChange={()=>{const direction=camera.position.clone().sub(controls.current?.target||new THREE.Vector3()).normalize();const candidates:Record<string,THREE.Vector3>={anterior:new THREE.Vector3(0,0,1),posterior:new THREE.Vector3(0,0,-1),left:new THREE.Vector3(1,0,0),right:new THREE.Vector3(-1,0,0),superior:new THREE.Vector3(0,1,0)};const orientation=Object.entries(candidates).find(([,vector])=>vector.dot(direction)>.999)?.[0]||'custom';if(orientation!==orientationRef.current){orientationRef.current=orientation;propsRef.current.onOrientationChange?.(orientation as 'anterior'|'posterior'|'left'|'right'|'superior'|'custom');}}} ref={controls} makeDefault enableDamping dampingFactor={.09} rotateSpeed={.65} zoomSpeed={.7} panSpeed={.7} minDistance={.12} maxDistance={12} target={[0,0,0]} touches={{ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN}}/>
    <SceneDiagnostics meshes={visible.length} size={size}/><GraphicsHealth/>
  </>;
}
function AnatomyMesh({entry,selected,hovered,opacity,exploded,clipPlane,onHover,onSelect,onFocus,placing,onAnchor}:{placing:boolean;onAnchor?:ViewerProps['onAnnotationAnchor'];entry:Entry;selected:boolean;hovered:boolean;opacity:number;exploded:boolean;clipPlane:THREE.Plane|null;onHover:(id:string|null)=>void;onSelect:ViewerProps['onSelect'];onFocus:(id?:string)=>void}) {
  const ref=useRef<THREE.Mesh>(null);const invalidate=useThree(s=>s.invalidate);
  const material=useMemo(()=>entry.sourceMaterial?(Array.isArray(entry.sourceMaterial)?entry.sourceMaterial.map(m=>m.clone()):entry.sourceMaterial.clone()):new THREE.MeshStandardMaterial({color:PALETTE[entry.system],roughness:.58,metalness:.02,side:THREE.DoubleSide}),[entry.sourceMaterial,entry.system]);
  const materials=useMemo(()=>Array.isArray(material)?material:[material],[material]);
  const baseColors=useMemo(()=>materials.map(m=>m instanceof THREE.MeshStandardMaterial?m.color.clone():new THREE.Color('white')),[materials]);
  const base=useMemo(()=>new THREE.Vector3().setFromMatrixPosition(entry.matrix),[entry.matrix]);
  const rotation=useMemo(()=>new THREE.Quaternion().setFromRotationMatrix(entry.matrix),[entry.matrix]);
  const scale=useMemo(()=>new THREE.Vector3().setFromMatrixScale(entry.matrix),[entry.matrix]);
  const target=useMemo(()=>base.clone().add(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3()),[base,exploded,entry.center]);
  useEffect(()=>{
    materials.forEach((mat,index)=>{
      if(mat instanceof THREE.MeshStandardMaterial){
        mat.color.copy(baseColors[index]);
        if(selected)mat.color.lerp(new THREE.Color('#4aaf9c'),.38);
        else if(hovered)mat.color.lerp(new THREE.Color('#e0ce9b'),.25);
        else if(!entry.sourceMaterial&&entry.system==='cardiovascular'&&/vein|venous/i.test(entry.name))mat.color.set('#6487ad');
        mat.emissive.set(selected?'#193d33':'#000000');mat.emissiveIntensity=selected?.35:0;
      }
      mat.opacity=opacity;mat.transparent=opacity<1;mat.depthWrite=opacity>=.99;mat.clippingPlanes=clipPlane?[clipPlane]:[];mat.needsUpdate=true;
    });invalidate();
  },[materials,baseColors,selected,hovered,opacity,clipPlane,invalidate,entry.sourceMaterial,entry.system,entry.name]);
  // Cached source geometry/textures are shared across mounts. Only instance materials are owned here.
  useEffect(()=>()=>{materials.forEach(mat=>mat.dispose());},[materials]);
  useFrame((_state,delta)=>{if(ref.current&&ref.current.position.distanceToSquared(target)>.0000001){ref.current.position.lerp(target,1-Math.exp(-delta*10));invalidate();}});
  return <mesh ref={ref} geometry={entry.geometry} material={material} position={base} quaternion={rotation} scale={scale} dispose={null}
    onPointerOver={event=>{if(clipPlane&&clipPlane.distanceToPoint(event.point)<0)return;event.stopPropagation();onHover(entry.id);}}
    onPointerOut={()=>onHover(null)}
    onClick={event=>{if(event.delta>5||(clipPlane&&clipPlane.distanceToPoint(event.point)<0))return;event.stopPropagation();if(placing){const point=event.point.clone().sub(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3());onAnchor?.({structureId:entry.id,point:point.toArray() as [number,number,number]});}onSelect(entry.id,event.shiftKey);}}
    onDoubleClick={event=>{if(clipPlane&&clipPlane.distanceToPoint(event.point)<0)return;event.stopPropagation();if(!placing){onSelect(entry.id);onFocus(entry.id);}}}/>;
}
function SceneDiagnostics({meshes,size}:{meshes:number;size:{width:number;height:number}}){
  const {gl}=useThree();useEffect(()=>{const target=window as unknown as {__anatomyMetrics?:unknown};target.__anatomyMetrics={meshes,width:size.width,height:size.height,renderer:gl.capabilities.isWebGL2?'WebGL2':'WebGL',geometries:gl.info.memory.geometries,textures:gl.info.memory.textures};gl.domElement.dataset.meshes=String(meshes);gl.domElement.dataset.geometries=String(gl.info.memory.geometries);gl.domElement.dataset.textures=String(gl.info.memory.textures);},[meshes,size,gl]);return null;
}
function GraphicsHealth(){
  const {gl,invalidate}=useThree();const [lost,setLost]=useState(false);
  useEffect(()=>{
    const canvas=gl.domElement;
    const onLost=(event:Event)=>{event.preventDefault();setLost(true);};
    const onRestored=()=>{setLost(false);invalidate();};
    canvas.addEventListener('webglcontextlost',onLost);canvas.addEventListener('webglcontextrestored',onRestored);
    return()=>{canvas.removeEventListener('webglcontextlost',onLost);canvas.removeEventListener('webglcontextrestored',onRestored);};
  },[gl,invalidate]);
  return lost?<Html fullscreen zIndexRange={[20,20]}><div className="viewer-context-notice" role="status"><strong>3D view paused</strong><p>Your device is restoring its graphics memory. If the view does not return, reload with the balanced model quality.</p><button type="button" onClick={()=>window.location.reload()}>Reload workspace</button></div></Html>:null;
}
class ViewerBoundary extends Component<{children:ReactNode;onError?:(message:string)=>void},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return{error:true};}
  componentDidCatch(error:Error){this.props.onError?.(`3D rendering stopped: ${error.message}. Reload the workspace to retry.`);}
  render(){return this.state.error?<div className="viewer-unavailable">The 3D renderer could not start. Enable WebGL in your browser and reload.</div>:this.props.children;}
}
const Viewer=forwardRef<ViewerHandle,ViewerProps>((props,ref)=><ViewerBoundary onError={props.onError}><Canvas className="anatomy-canvas" camera={{position:[0,.08,6.5],fov:34,near:.005,far:50}} dpr={props.lowPower?1:props.quality==='high'?[1,2]:[1,1.25]} frameloop="demand" gl={{antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:props.lowPower?'low-power':'high-performance',localClippingEnabled:true}} onCreated={({gl})=>{gl.setClearColor('#f4f3ee',0);gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.05;}} onPointerMissed={(event)=>{if(!event.shiftKey)props.onSelect(null);}} fallback={<div className="viewer-unavailable">WebGL is required to explore this atlas.</div>}><AnatomyScene {...props} apiRef={ref}/><GraphicsHealth/></Canvas></ViewerBoundary>);
Viewer.displayName='Viewer';export default Viewer;
