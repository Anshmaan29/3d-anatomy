import type {Structure} from './types';

export interface PracticeQuestion {target:Structure;options:Structure[];answer:null}

/** Make every answer label unique, even when the source contains duplicate specimens. */
export function makePracticeQuestion(pool:Structure[],previousId?:string,random:()=>number=Math.random):PracticeQuestion|null {
  const unique=new Map<string,Structure>();
  for(const structure of pool){
    const name=structure.name.trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
    if(name&&!unique.has(name))unique.set(name,structure);
  }
  const choices=[...unique.values()];if(choices.length<4)return null;
  const candidates=choices.filter(item=>item.id!==previousId);
  const target=candidates[Math.floor(random()*candidates.length)];
  const shuffled=(items:Structure[])=>{
    const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;
  };
  const rest=choices.filter(item=>item.id!==target.id);
  // Nearby structures make better alternatives, while allowing small systems to participate.
  const similar=shuffled(rest.filter(item=>item.system===target.system&&item.region===target.region&&(!target.groupName||item.groupName===target.groupName)));
  const sameRegion=shuffled(rest.filter(item=>item.system===target.system&&item.region===target.region&&target.groupName&&item.groupName!==target.groupName));
  const sameSystem=shuffled(rest.filter(item=>item.system===target.system&&item.region!==target.region));
  const other=shuffled(rest.filter(item=>item.system!==target.system));
  return {target,options:shuffled([target,...[...similar,...sameRegion,...sameSystem,...other].slice(0,3)]),answer:null};
}

/** In practice, keep all assets loaded but display only the target unless context is requested. */
export function practiceEntryVisible(id:string,targetId:string|null|undefined,practice:boolean,showContext:boolean):boolean {
  return !practice||!targetId||showContext||id===targetId;
}

/** Fit a bounding sphere to the limiting (vertical or horizontal) camera field of view. */
export function focusDistance(radius:number,aspect:number,fov=34):number {
  const vertical=(Number.isFinite(fov)?Math.min(179,Math.max(1,fov)):34)*Math.PI/360;
  const safeAspect=Number.isFinite(aspect)&&aspect>0?aspect:1;
  const horizontal=Math.atan(Math.tan(vertical)*Math.max(.1,safeAspect));
  const safeRadius=Number.isFinite(radius)?Math.max(0,radius):0;
  return Math.max(.16,safeRadius/Math.sin(Math.min(vertical,horizontal))*1.12);
}
