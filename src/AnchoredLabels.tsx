import {useRef} from 'react';
import {Html} from '@react-three/drei';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {layoutLabels} from './label-layout';
import './anchored-labels.css';
export interface AnchoredLabel {id:string;text:string;point:THREE.Vector3;kind:'note'|'landmark'|'selection'|'context';}
export default function AnchoredLabels({items}:{items:AnchoredLabel[]}){
 const root=useRef<HTMLDivElement>(null);const {size}=useThree();const scratch=useRef(new THREE.Vector3());
 useFrame(({camera})=>{
  if(!root.current)return;
  const projected=items.map(item=>{const p=scratch.current.copy(item.point).project(camera);return{id:item.id,x:(p.x+1)*size.width/2,y:(1-p.y)*size.height/2,height:item.kind==='note'?Math.min(150,36+Math.ceil(item.text.length/24)*15):Math.max(34,16+Math.ceil(item.text.length/25)*15),inFront:p.z>=-1&&p.z<=1};}).filter(item=>item.inFront);
  const placed=new Map(layoutLabels(projected,size.width,size.height).map(item=>[item.id,item]));
  for(const card of root.current.querySelectorAll<HTMLElement>('[data-label-card]')){const p=placed.get(card.dataset.labelCard!);card.style.display=p?'block':'none';if(p){card.style.transform=`translate3d(${p.left}px,${p.top}px,0)`;card.style.width=`${p.width}px`;}}
  for(const line of root.current.querySelectorAll<SVGPathElement>('[data-label-line]')){const p=placed.get(line.dataset.labelLine!);line.style.display=p?'block':'none';if(p){const endX=p.side==='left'?p.left+p.width:p.left,endY=p.top+p.height/2;line.setAttribute('d',`M${p.x},${p.y} L${endX+(p.side==='left'?12:-12)},${endY} L${endX},${endY}`);}}
  for(const dot of root.current.querySelectorAll<SVGCircleElement>('[data-label-dot]')){const p=placed.get(dot.dataset.labelDot!);dot.style.display=p?'block':'none';if(p){dot.setAttribute('cx',String(p.x));dot.setAttribute('cy',String(p.y));}}
 });
 if(!items.length)return null;
 return <Html fullscreen zIndexRange={[8,0]} style={{pointerEvents:'none'}}><div className="anchored-labels" ref={root} aria-label="Anatomical labels"><svg width={size.width} height={size.height} aria-hidden="true">{items.map(item=><g key={item.id}><path data-label-line={item.id}/><circle r="3" data-label-dot={item.id}/></g>)}</svg>{items.map(item=><div key={item.id} className={`anchored-card anchored-${item.kind}`} data-label-card={item.id}>{item.kind==='note'&&<small>STUDY NOTE</small>}<span>{item.text}</span></div>)}</div></Html>;
}
