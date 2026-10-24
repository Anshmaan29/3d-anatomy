export interface ProjectedLabel {id:string;x:number;y:number;height:number;}
export interface PlacedLabel extends ProjectedLabel {left:number;top:number;width:number;side:'left'|'right';}
/** Two stable label rails keep leader lines readable while preserving a clear centre. */
export function layoutLabels(labels:ProjectedLabel[],width:number,height:number):PlacedLabel[]{
  const margin=12,gap=8,cardWidth=Math.min(190,Math.max(100,width*.3));
  const visible=labels.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height);
  const output:PlacedLabel[]=[];
  for(const side of ['left','right'] as const){
    const candidates=visible.filter(p=>(p.x<width/2?'left':'right')===side).sort((a,b)=>a.y-b.y);
    let bottom=margin;
    for(const item of candidates){if(item.height>height-margin*2||bottom+item.height>height-margin)continue;const top=Math.max(bottom,Math.min(item.y-item.height/2,height-margin-item.height));output.push({...item,left:side==='left'?margin:width-margin-cardWidth,top,width:cardWidth,side});bottom=top+item.height+gap;}
    const column=output.filter(p=>p.side===side);
    if(column.length){let ceiling=height-margin;for(let i=column.length-1;i>=0;i--){column[i].top=Math.min(column[i].top,ceiling-column[i].height);ceiling=column[i].top-gap;}}
  }
  return output;
}
