import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PerspectiveCamera,Vector3,Mesh,BoxGeometry,MeshBasicMaterial,Raycaster} from 'three';
import {OrbitControls} from 'three-stdlib';

const code=ts.transpileModule(readFileSync(new URL('../src/camera-motion.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {CameraMotion,interactionRaycast}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function scene(){const camera=new PerspectiveCamera(34,1,.005,50);camera.position.set(0,0,6);const controls=new OrbitControls(camera);controls.enableDamping=true;controls.update();return{camera,controls,motion:new CameraMotion(camera,()=>controls)};}

test('manual orbit and zoom retain control after interrupting system auto-fit',()=>{
  const {camera,controls,motion}=scene();motion.start(new Vector3(0,1,2),new Vector3(0,1,0));motion.step(1/60);
  motion.beginInteraction(); // OrbitControls start event, before applying the user's movement.
  camera.position.set(2,2,3);controls.target.set(.2,.3,0);controls.update();
  const position=camera.position.clone(),target=controls.target.clone();
  for(let n=0;n<120;n++){motion.step(1/60);controls.update();}
  assert.ok(camera.position.distanceTo(position)<1e-9);assert.ok(controls.target.distanceTo(target)<1e-9);assert.equal(controls.enableDamping,true);
});

test('late model readiness cannot start auto-fit during an active gesture',()=>{
  const {camera,motion}=scene();motion.beginInteraction();const position=camera.position.clone();
  motion.start(new Vector3(0,0,2),new Vector3());assert.equal(motion.step(1/60),false);assert.deepEqual(camera.position,position);
  motion.endInteraction();motion.start(new Vector3(0,0,2),new Vector3());assert.equal(motion.step(1/60),true);
});

test('residual orbit momentum cannot pull an automated fit away from its destination',()=>{
  const {camera,controls,motion}=scene();controls.setAzimuthalAngle(.8); // Leaves real OrbitControls damping momentum.
  const position=new Vector3(0,.5,3),target=new Vector3(0,.5,0);motion.start(position,target);
  for(let n=0;n<180;n++){controls.update();motion.step(1/60);}
  assert.ok(camera.position.distanceTo(position)<1e-9);assert.ok(controls.target.distanceTo(target)<1e-9);assert.equal(motion.destination,null);assert.equal(controls.enableDamping,true);
});

test('first frame after a long idle does not snap the camera to the new system',()=>{
  const {camera,motion}=scene();motion.start(new Vector3(0,0,2),new Vector3());motion.step(60);
  assert.ok(camera.position.z>4);assert.ok(camera.position.z<6);assert.notEqual(motion.destination,null);
});

test('reduced motion arrives exactly and leaves manual damping enabled',()=>{
  const {camera,controls,motion}=scene();motion.start(new Vector3(0,0,2),new Vector3(),true);
  assert.equal(camera.position.z,2);assert.equal(motion.destination,null);assert.equal(controls.enableDamping,true);assert.equal(motion.step(1),false);
});

test('anatomy hit testing pauses during gestures and resumes for selection',()=>{
  let active=false,calls=0;const geometry=new BoxGeometry(),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material);
  mesh.raycast=interactionRaycast(()=>active,function(ray,hits){calls++;Mesh.prototype.raycast.call(this,ray,hits);});
  const ray=new Raycaster(new Vector3(0,0,3),new Vector3(0,0,-1));let hits=[];mesh.raycast(ray,hits);assert.ok(hits.length);assert.equal(calls,1);
  active=true;hits=[];mesh.raycast(ray,hits);assert.equal(hits.length,0);assert.equal(calls,1);
  active=false;mesh.raycast(ray,hits);assert.ok(hits.length);assert.equal(calls,2);geometry.dispose();material.dispose();
});
