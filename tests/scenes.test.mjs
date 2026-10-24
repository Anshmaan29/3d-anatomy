import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../public/data/atlas-scenes.json',import.meta.url),'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../public/data/atlas.json',import.meta.url),'utf8'));
const structures = new Map(catalog.structures.map(s=>[s.id,s]));
const presets = new Map([...manifest.scenes,...manifest.collections].map(p=>[p.id,p]));

test('all native catalog scenes and POV markers are represented without invented camera poses',()=>{
 assert.equal(manifest.scenes.length,70);
 assert.equal(manifest.scenes.filter(p=>p.sourceEvidence.catalogSceneId!==null).length,69);
 const viewpoints=manifest.scenes.flatMap(p=>p.viewpoints);
 assert.equal(viewpoints.length,82);
 assert.equal(new Set(viewpoints.map(v=>v.id)).size,82);
 for(const p of manifest.scenes){
  assert.match(p.sourceEvidence.sha256,/^[a-f0-9]{64}$/);
  assert.equal(p.sourceEvidence.canonicalPlacementAgreement,1);
  assert.ok(p.visibleIds.every(id=>p.memberIds.includes(id)));
  assert.ok(p.sourceHiddenIds.every(id=>!p.visibleIds.includes(id)));
  for(const v of p.viewpoints){
   assert.equal(v.sourceEvidence.markerFound,true);
   assert.equal(v.target.length,3);
   assert.ok(v.target.every(Number.isFinite));
   assert.ok(v.focusIds.length>0);
   assert.ok(v.focusIds.every(id=>p.visibleIds.includes(id)));
   assert.equal(v.camera,undefined);
  }
 }
});

test('every dissection and guided step resolves exact source IDs and matching systems',()=>{
 assert.equal(presets.size,manifest.scenes.length+manifest.collections.length);
 for(const p of presets.values()){
  assert.ok(p.name&&p.region&&p.category&&p.description);
  assert.equal(p.cameraMode,'fit-bounds');
  assert.ok(p.visibleIds.length>0);
  assert.equal(new Set(p.visibleIds).size,p.visibleIds.length);
  assert.ok(p.visibleIds.every(id=>structures.has(id)),p.id);
  assert.deepEqual([...new Set(p.visibleIds.map(id=>structures.get(id).system))].sort(),p.systems);
  assert.ok((p.focusIds||[]).every(id=>p.visibleIds.includes(id)));
  for(const step of p.steps||[]){
   assert.ok(step.name&&step.description&&step.visibleIds.length);
   assert.ok(step.visibleIds.every(id=>structures.has(id)));
   assert.ok(step.visibleIds.every(id=>p.systems.includes(structures.get(id).system)));
  }
 }
 for(const g of manifest.groups)assert.ok(g.sceneIds.every(id=>presets.has(id)));
});

test('inside-organ presets expose source interiors and remove obstructing shells',()=>{
 const brain=presets.get('study-brain-deep');
 assert.ok(brain.visibleIds.includes('ATLAS_Bra_M1016'));
 assert.ok(!brain.visibleIds.includes('ATLAS_Bra_M1001'));
 assert.ok(!brain.visibleIds.includes('ATLAS_Bra_M1002'));
 assert.ok(!brain.visibleIds.includes('ATLAS_Bra_M1003'));
 const heart=presets.get('study-heart-interior');
 assert.ok(heart.visibleIds.includes('ATLAS_Ventricle_Int_Sez_L'));
 assert.ok(heart.visibleIds.includes('ATLAS_Atrium_Int_Sez_R'));
 assert.ok(heart.visibleIds.includes('ATLAS_Hea_M7'));
 assert.ok(!heart.visibleIds.includes('ATLAS_Hea_M101'));
 const kidney=presets.get('study-kidney-interior');
 assert.ok(kidney.visibleIds.includes('ATLAS_Uro_M103'));
 assert.ok(kidney.visibleIds.includes('ATLAS_Uro_M107'));
 assert.ok(!kidney.visibleIds.includes('ATLAS_Uro_M102'));
 assert.ok(!kidney.visibleIds.includes('ATLAS_Uro_M110'));
 const eye=presets.get('study-eye-interior');
 assert.ok(eye.visibleIds.includes('ATLAS_Eye_M1004'));
 assert.ok(!eye.visibleIds.includes('ATLAS_Eye_M1001'));
 assert.ok(presets.get('study-ear-inner').visibleIds.includes('ATLAS_Ear_M1005'));
 assert.ok(presets.get('study-lung-segments').visibleIds.every(id=>!['ATLAS_Res_M122','ATLAS_Res_M123'].includes(id)));
});

test('independent kidney teaching specimen does not leak into whole-body composition',()=>{
 assert.equal(manifest.specimenOnlyIds.length,10);
 const wholeBody=presets.get('atlas-full-body');
 for(const id of manifest.specimenOnlyIds){
  assert.ok(structures.has(id));
  assert.ok(!wholeBody.memberIds.includes(id));
  assert.deepEqual(manifest.scenes.filter(s=>s.memberIds.includes(id)).map(s=>s.id),['atlas-603']);
 }
});
