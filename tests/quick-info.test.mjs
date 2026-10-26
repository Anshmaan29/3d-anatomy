import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const encode=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=file=>ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {getQuickInfo,structureKind}=await import(encode(compile('quick-info.ts').replace("'./study'",JSON.stringify(encode(compile('study.ts'))))));
const catalogs=['atlas','anatomy','supplement'].map(name=>{const data=JSON.parse(readFileSync(new URL('../public/data/'+name+'.json',import.meta.url)));return data.structures||data;});
const make=(name,system,extra={})=>({id:'TEST',name,system,region:'Head',...extra});

test('every current catalog entry has a concise, sourced, explicitly unreviewed explanation',()=>{
  assert.equal(catalogs.flat().length,3885);
  for(const structure of catalogs.flat()){
    const info=getQuickInfo(structure);assert.ok(info.sentences.length>=2&&info.sentences.length<=3,structure.id);
    for(const sentence of info.sentences)assert.ok(sentence.length>10&&sentence.length<260,structure.name+': '+sentence);
    assert.ok(info.sentences.join(' ').split(/\s+/).length<=75,structure.name);
    assert.equal(info.reviewed,false);assert.ok(info.reference.title);assert.match(info.reference.url,/^https:\/\/|^\/data\//);
  }
});
test('vessels keep their function even when catalogued inside organ systems',()=>{
  assert.equal(structureKind(make('Renal artery','urinary')),'artery');
  assert.equal(getQuickInfo(make('Renal artery','urinary')).topic,'general-artery');
  assert.equal(getQuickInfo(make('Renal vein','urinary')).topic,'general-vein');
  assert.equal(getQuickInfo(make('Thyroid artery','endocrine')).topic,'general-artery');
  assert.equal(getQuickInfo(make('Aorta','cardiovascular')).topic,'aorta');
  assert.match(getQuickInfo(make('Pulmonary artery','cardiovascular')).sentences.join(' '),/low in oxygen/);
  assert.match(getQuickInfo(make('Pulmonary vein','cardiovascular')).sentences.join(' '),/rich in oxygen/);
});
test('brain, heart and similarly named supporting tissues do not exchange explanations',()=>{
  assert.equal(getQuickInfo(make('Ventricle (right)','nervous',{groupName:'Brain'})).topic,'brain-ventricles');
  assert.equal(getQuickInfo(make('Right ventricle','cardiovascular')).topic,'heart-ventricle');
  assert.equal(getQuickInfo(make('Choroid plexus (4° ventricle)','nervous',{groupName:'Brain'})).topic,'choroid-plexus');
  assert.notEqual(getQuickInfo(make('Thyroid cartilage','respiratory')).topic,'thyroid');
  assert.notEqual(getQuickInfo(make('Ligament of ovary','reproductive')).topic,'ovary');
  assert.notEqual(getQuickInfo(make('Liver ligaments','digestive')).topic,'liver');
  assert.equal(getQuickInfo(make('Sinoatrial node (SA node)','nervous',{groupName:'Nerves'})).topic,'sa-node');
  assert.equal(getQuickInfo(make('His bundle','nervous',{groupName:'Nerves'})).topic,'conduction');
  assert.equal(getQuickInfo(make('Dura mater','nervous',{groupName:'Nerves'})).topic,'meninges');
  assert.equal(getQuickInfo(make('Spinal cord','nervous',{groupName:'Nerves'})).topic,'spinal-cord');
});
test('small branches get honest general context, without a guessed territory or function',()=>{
  const info=getQuickInfo(make('Small unnamed branch of femoral nerve','nervous'));
  assert.equal(info.scope,'general');assert.equal(info.topic,'general-nerve');
  assert.doesNotMatch(info.sentences.join(' '),/thigh|knee|Head/);
  assert.equal(getQuickInfo(make('Kidney (right)','urinary')).topic,'kidney');
  assert.doesNotMatch(getQuickInfo(make('Kidney (right)','urinary')).sentences.join(' '),/head/i);
});
test('source muscle actions are shortened without guessing absent actions or losing sex-specific context',()=>{
  const muscle=make('Biceps brachii','muscular',{details:{action:'Flexes forearm; Supinates forearm'}});
  assert.equal(getQuickInfo(muscle).scope,'source-action');
  assert.equal(getQuickInfo(muscle).sentences[1],'It bends the forearm.');
  for(const action of ['N/A','Male: Compresses bulb of penis | Female: Constricts vaginal orifice','Abducts arm'])
    assert.equal(getQuickInfo({...muscle,details:{action}}).scope,'general');
});
test('unresolved identities are disclosed instead of assigned a medical function',()=>{
  const info=getQuickInfo(make('Art_M1234','cardiovascular',{id:'ATLAS_Art_M1234',reviewStatus:'Unresolved English label'}));
  assert.equal(info.scope,'unresolved');assert.match(info.sentences.join(' '),/identity needs checking/);
});
