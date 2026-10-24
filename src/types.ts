export type SystemId = 'skeletal'|'muscular'|'cardiovascular'|'nervous'|'respiratory'|'digestive'|'urinary'|'reproductive'|'lymphatic'|'endocrine';
export interface Structure {assetPath?:string;sourceLicense?:string;reviewStatus?:string;id:string;name:string;system:SystemId;region:string;laterality?:string;sourceId?:string;source?:string;bounds?:number[][];synonyms?:string[];}
export interface AnatomyData {structures:Structure[];systems?:unknown;[key:string]:unknown;}
export interface CameraState { position:[number,number,number]; target:[number,number,number]; }
export interface ViewerHandle { getCamera:()=>CameraState; restoreCamera:(state:CameraState)=>void; home:()=>void; focus:(id?:string)=>void; view:(direction:'anterior'|'posterior'|'left'|'right'|'superior')=>void; zoom:(delta:number)=>void; screenshot:()=>void; }
export interface ViewerProps {annotations?:Annotation[];placingAnnotation?:boolean;onAnnotationAnchor?:(anchor:AnnotationAnchor)=>void;structures:Structure[];activeSystems:SystemId[];selectedId:string|null;hiddenIds:string[];isolatedId:string|null;opacity:number;exploded:boolean;labels:boolean;quality:'high'|'balanced';section:boolean;onSelect:(id:string|null)=>void;onOrientationChange?:(view:'anterior'|'posterior'|'left'|'right'|'superior'|'custom')=>void;onReady?:(metrics:{meshes:number;triangles:number})=>void;onLoading?:(loading:boolean)=>void;onError?:(message:string)=>void;}

export interface AnnotationAnchor { structureId:string;point:[number,number,number]; }
export interface Annotation extends AnnotationAnchor {id:string;text:string;created:string;}
