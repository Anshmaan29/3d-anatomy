import { Component, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { Structure, SystemId, ViewerHandle, ViewerProps } from './types';

const cache = new Map<string, Promise<THREE.Group>>();
function loadSystem(system: SystemId, quality: ViewerProps['quality'],assetPath?:string): Promise<THREE.Group> {
  const key=assetPath||`${quality}/${system}`;
  const existing = cache.get(key); if (existing) return existing;
  const pending = fetch(assetPath||`/models/${quality==='balanced'?'balanced/':''}${system}.glb`).then(async response => {
    if (!response.ok) throw new Error(`The ${system} model could not be loaded (${response.status}).`);
    const bytes = await response.arrayBuffer();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, '/models/');
    gltf.scene.updateMatrixWorld(true); return gltf.scene;
  }).catch(error => {cache.delete(key); throw error;});
  cache.set(key, pending); return pending;
}
const PALETTE: Record<SystemId,string> = {skeletal:'#b9a589',muscular:'#ad6260',cardiovascular:'#ba5355',nervous:'#d5b55b',respiratory:'#c799a2',digestive:'#b98e6b',urinary:'#b47a70',reproductive:'#ba9ca4',lymphatic:'#86a685',endocrine:'#b79bd0'};
interface Entry {id:string; geometry:THREE.BufferGeometry; matrix:THREE.Matrix4; center:THREE.Vector3; system:SystemId; name:string;}
interface SceneProps extends ViewerProps { apiRef:React.ForwardedRef<ViewerHandle>; }

function AnatomyScene(props:SceneProps) {
  const {structures,activeSystems,selectedId,hiddenIds,isolatedId,opacity,exploded,labels,section,apiRef} = props;
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
  const systemsKey=props.quality+':'+[...activeSystems].sort().join(',');
  const structureMap=useMemo(()=>new Map(structures.map(s=>[s.id,s])),[structures]);
  useEffect(()=>{
    let cancelled=false;
    propsRef.current.onLoading?.(true);
    Promise.all(activeSystems.flatMap(system=>{const supplements=[...new Set(structures.filter(s=>s.system===system&&s.assetPath).map(s=>s.assetPath!))];return [undefined,...supplements].map(async assetPath=>({system,scene:await loadSystem(system,props.quality,assetPath)}));})).then(value=>{
      if(cancelled)return;setScenes(value);propsRef.current.onLoading?.(false);
    }).catch(error=>{if(!cancelled){propsRef.current.onLoading?.(false);propsRef.current.onError?.(String(error.message||error));}});
    return()=>{cancelled=true;};
  // Only a change in requested assets starts loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[systemsKey]);
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
      list.push({id:structure.id,geometry,matrix:node.matrixWorld.clone(),center,system,name:structure.name});
    });
    return list;
  },[scenes,structureMap]);
  const hiddenSet=useMemo(()=>new Set(hiddenIds),[hiddenIds]);
  const visible=useMemo(()=>entries.filter(e=>activeSystems.includes(e.system)&&!hiddenSet.has(e.id)&&(!isolatedId||e.id===isolatedId)),[entries,activeSystems,hiddenSet,isolatedId]);
  const selected=entries.find(e=>e.id===selectedId);
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
  useEffect(()=>{if(!initialFocusDone.current&&entries.length){initialFocusDone.current=true;if(selectedRef.current)focus(selectedRef.current);}},[entries]);
  const home=()=>travel(new THREE.Vector3(0,.08,6.5),new THREE.Vector3(0,0,0));
  // Capture the same rendered scene and include attribution in the download.
  const scene=useThree(state=>state.scene);
  useImperativeHandle(apiRef,()=>({getCamera:()=>({position:camera.position.toArray() as [number,number,number],target:(controls.current?.target.toArray()||[0,0,0]) as [number,number,number]}),restoreCamera:(state)=>{if(state.position.every(Number.isFinite)&&state.target.every(Number.isFinite))travel(new THREE.Vector3(...state.position),new THREE.Vector3(...state.target));},home,focus,view:(direction)=>{
    const target=controls.current?.target.clone()||new THREE.Vector3();const distance=Math.max(1,camera.position.distanceTo(target));
    const directions:Record<string,[number,number,number]>={anterior:[0,0,1],posterior:[0,0,-1],left:[1,0,0],right:[-1,0,0],superior:[0,1,.001]};
    travel(new THREE.Vector3(...directions[direction]).multiplyScalar(distance).add(target),target);
  },zoom:(delta)=>{const target=controls.current?.target.clone()||new THREE.Vector3();const offset=camera.position.clone().sub(target).multiplyScalar(delta<0?.8:1.25).clampLength(.15,12);travel(target.clone().add(offset),target);},screenshot:()=>{
    gl.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=gl.domElement.width;canvas.height=gl.domElement.height+70;
    const context=canvas.getContext('2d');if(!context)return;context.fillStyle='#f4f3ee';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(gl.domElement,0,0);
    for(const note of propsRef.current.annotations||[]){
      const entry=visible.find(item=>item.id===note.structureId);if(!entry)continue;
      const offset=exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3();
      const projection=new THREE.Vector3(...note.point).add(offset).project(camera);if(Math.abs(projection.x)>1||Math.abs(projection.y)>1||projection.z>1)continue;
      const px=(projection.x+1)/2*gl.domElement.width,py=(1-projection.y)/2*gl.domElement.height;
      const cardWidth=Math.min(250,canvas.width*.37),font=Math.max(10,Math.min(16,canvas.width/70));
      context.font=`${font}px sans-serif`;const words=note.text.split(' '),lines:string[]=[];let line='';
      for(const word of words){if(context.measureText(line+' '+word).width>cardWidth-24&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);
      const height=lines.length*(font+5)+27,x=Math.max(12,Math.min(px+38,canvas.width-cardWidth-12)),y=Math.max(12,Math.min(py-24,gl.domElement.height-height-10));
      context.strokeStyle='#6b9a83';context.lineWidth=1.5;context.beginPath();context.moveTo(px,py);context.lineTo(x,y+height/2);context.stroke();
      context.fillStyle='#fffffff2';context.fillRect(x,y,cardWidth,height);context.strokeRect(x,y,cardWidth,height);context.fillStyle='#244c3e';
      lines.forEach((text,index)=>context.fillText(text,x+12,y+19+index*(font+5)));
      context.beginPath();context.arc(px,py,4,0,Math.PI*2);context.fill();
    }
    context.fillStyle='#314846';context.font=`${Math.max(8,Math.min(14,canvas.width/65))}px sans-serif`;context.fillText('Anatomy Studio · BodyParts3D © DBCLS · CC BY 4.0',14,canvas.height-39);context.fillText('Lung/liver adaptations: Z-Anatomy · CC BY-SA 4.0 · anatomy review pending',14,canvas.height-17);
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='anatomy-studio.png';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),3000);});
  }}));
  useFrame((_state,delta)=>{
    if(!move.current||!controls.current)return;
    const alpha=1-Math.exp(-delta*9);camera.position.lerp(move.current.position,alpha);controls.current.target.lerp(move.current.target,alpha);controls.current.update();
    if(camera.position.distanceTo(move.current.position)<.0005){camera.position.copy(move.current.position);controls.current.target.copy(move.current.target);move.current=null;}
    invalidate();
  });
  useEffect(()=>{document.body.style.cursor=props.placingAnnotation?'crosshair':hovered?'pointer':'';return()=>{document.body.style.cursor='';};},[hovered,props.placingAnnotation]);
  const clipPlane=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,0,-1),0),[]);
  const landmarkEntries=useMemo(()=>{
    if(!labels)return[];
    const preferred=[/frontal bone/i,/sternum/i,/left humerus/i,/right radius/i,/left femur/i,/right tibia/i,/heart$/i,/liver$/i,/left lung$/i,/brain$/i];
    return preferred.map(regex=>visible.find(e=>regex.test(e.name))).filter((e):e is Entry=>!!e&&e.id!==selectedId).slice(0,6);
  },[labels,visible,selectedId]);
  return <>
    <ambientLight intensity={.24}/><hemisphereLight args={['#fff9e9','#778a83',.85]}/>
    <directionalLight position={[-3,5,5]} intensity={2.7} color="#fff1d8"/>
    <directionalLight position={[4,1,-3]} intensity={1.7} color="#c7dedd"/>
    <directionalLight position={[0,2,5]} intensity={.35}/>
    <group>
    {visible.map((entry,index)=><AnatomyMesh key={`${entry.system}-${entry.id}-${index}`} entry={entry} selected={entry.id===selectedId} hovered={entry.id===hovered} opacity={entry.id===selectedId?1:opacity} exploded={exploded} clipPlane={section?clipPlane:null} onHover={setHovered} onSelect={props.onSelect} onFocus={focus} placing={!!props.placingAnnotation} onAnchor={props.onAnnotationAnchor}/>)}
    </group>
    {(props.annotations||[]).filter(note=>visible.some(e=>e.id===note.structureId)).map(note=>{const entry=visible.find(e=>e.id===note.structureId)!;const offset=exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3();return <Html key={note.id} position={new THREE.Vector3(...note.point).add(offset)} zIndexRange={[7,0]} style={{pointerEvents:'none'}}><div className="annotation-pin"><span className="annotation-pin-dot"/><div className="annotation-pin-note"><small>STUDY NOTE</small><p>{note.text}</p></div></div></Html>;})}
    {landmarkEntries.map(entry=><Html key={entry.id} position={entry.center} zIndexRange={[5,0]} style={{pointerEvents:'none'}}><div className={`model-label ${entry.center.x<0?'label-left':'label-right'}`}><span/>{entry.name}</div></Html>)}
    {selected&&labels&&<Html position={selected.center.clone().add(exploded?selected.center.clone().normalize().multiplyScalar(.24):new THREE.Vector3())} zIndexRange={[6,0]} style={{pointerEvents:'none'}}><div className="model-label selected-label"><span/>{selected.name}</div></Html>}
    <OrbitControls onChange={()=>{const direction=camera.position.clone().sub(controls.current?.target||new THREE.Vector3()).normalize();const candidates:Record<string,THREE.Vector3>={anterior:new THREE.Vector3(0,0,1),posterior:new THREE.Vector3(0,0,-1),left:new THREE.Vector3(1,0,0),right:new THREE.Vector3(-1,0,0),superior:new THREE.Vector3(0,1,0)};const orientation=Object.entries(candidates).find(([,vector])=>vector.dot(direction)>.999)?.[0]||'custom';if(orientation!==orientationRef.current){orientationRef.current=orientation;propsRef.current.onOrientationChange?.(orientation as 'anterior'|'posterior'|'left'|'right'|'superior'|'custom');}}} ref={controls} makeDefault enableDamping dampingFactor={.09} rotateSpeed={.65} zoomSpeed={.7} panSpeed={.7} minDistance={.12} maxDistance={12} target={[0,0,0]} touches={{ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN}}/>
    <SceneDiagnostics meshes={visible.length} size={size}/>
  </>;
}
function AnatomyMesh({entry,selected,hovered,opacity,exploded,clipPlane,onHover,onSelect,onFocus,placing,onAnchor}:{placing:boolean;onAnchor?:ViewerProps['onAnnotationAnchor'];entry:Entry;selected:boolean;hovered:boolean;opacity:number;exploded:boolean;clipPlane:THREE.Plane|null;onHover:(id:string|null)=>void;onSelect:(id:string|null)=>void;onFocus:(id?:string)=>void}) {
  const ref=useRef<THREE.Mesh>(null);const invalidate=useThree(s=>s.invalidate);
  const material=useMemo(()=>new THREE.MeshStandardMaterial({color:PALETTE[entry.system],roughness:.58,metalness:.02,side:THREE.DoubleSide}),[entry.system]);
  const base=useMemo(()=>new THREE.Vector3().setFromMatrixPosition(entry.matrix),[entry.matrix]);
  const rotation=useMemo(()=>new THREE.Quaternion().setFromRotationMatrix(entry.matrix),[entry.matrix]);
  const scale=useMemo(()=>new THREE.Vector3().setFromMatrixScale(entry.matrix),[entry.matrix]);
  const target=useMemo(()=>base.clone().add(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3()),[base,exploded,entry.center]);
  useEffect(()=>{
    const color=selected?'#4aaf9c':hovered?'#e0ce9b':entry.system==='cardiovascular'&&/vein|venous/i.test(entry.name)?'#6487ad':PALETTE[entry.system];material.color.set(color);material.emissive.set(selected?'#193d33':'#000000');material.emissiveIntensity=selected?.2:0;
    material.opacity=opacity;material.transparent=opacity<1;material.depthWrite=opacity>=.99;material.clippingPlanes=clipPlane?[clipPlane]:[];material.needsUpdate=true;invalidate();
  },[material,selected,hovered,opacity,clipPlane,invalidate,entry.system]);
  useEffect(()=>()=>{material.dispose();entry.geometry.dispose();},[material,entry.geometry]);
  useFrame((_state,delta)=>{if(ref.current&&ref.current.position.distanceToSquared(target)>.0000001){ref.current.position.lerp(target,1-Math.exp(-delta*10));invalidate();}});
  return <mesh ref={ref} geometry={entry.geometry} material={material} position={base} quaternion={rotation} scale={scale} dispose={null}
    onPointerOver={event=>{event.stopPropagation();onHover(entry.id);}}
    onPointerOut={()=>onHover(null)}
    onClick={event=>{if(event.delta>5)return;event.stopPropagation();if(placing){const point=event.point.clone().sub(exploded?entry.center.clone().normalize().multiplyScalar(.26):new THREE.Vector3());onAnchor?.({structureId:entry.id,point:point.toArray() as [number,number,number]});}onSelect(entry.id);}}
    onDoubleClick={event=>{event.stopPropagation();if(!placing){onSelect(entry.id);onFocus(entry.id);}}}/>;
}
function SceneDiagnostics({meshes,size}:{meshes:number;size:{width:number;height:number}}){
  const {gl}=useThree();useEffect(()=>{const target=window as unknown as {__anatomyMetrics?:unknown};target.__anatomyMetrics={meshes,width:size.width,height:size.height,renderer:gl.capabilities.isWebGL2?'WebGL2':'WebGL',geometries:gl.info.memory.geometries,textures:gl.info.memory.textures};},[meshes,size,gl]);return null;
}
class ViewerBoundary extends Component<{children:ReactNode;onError?:(message:string)=>void},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return{error:true};}
  componentDidCatch(error:Error){this.props.onError?.(`3D rendering stopped: ${error.message}. Reload the workspace to retry.`);}
  render(){return this.state.error?<div className="viewer-unavailable">The 3D renderer could not start. Enable WebGL in your browser and reload.</div>:this.props.children;}
}
const Viewer=forwardRef<ViewerHandle,ViewerProps>((props,ref)=><ViewerBoundary onError={props.onError}><Canvas className="anatomy-canvas" camera={{position:[0,.08,6.5],fov:34,near:.005,far:50}} dpr={props.quality==='high'?[1,2]:[1,1.25]} frameloop="demand" gl={{antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance',localClippingEnabled:true}} onCreated={({gl})=>{gl.setClearColor('#f4f3ee',0);gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.05;}} onPointerMissed={()=>props.onSelect(null)} fallback={<div className="viewer-unavailable">WebGL is required to explore this atlas.</div>}><AnatomyScene {...props} apiRef={ref}/></Canvas></ViewerBoundary>);
Viewer.displayName='Viewer';export default Viewer;
