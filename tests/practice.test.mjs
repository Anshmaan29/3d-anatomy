import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makePracticeQuestion,practiceEntryVisible,focusDistance} from '../src/practice.ts';

const part=(id,name,system='skeletal',region='arm')=>({id,name,system,region});
test('practice choices have distinct visible names even with duplicate source specimens',()=>{
  const pool=[part('a','Femur'),part('a2',' femur '),part('b','Tibia'),part('c','Fibula'),part('d','Patella'),part('e','Humerus')];
  const question=makePracticeQuestion(pool,'a',()=>0);
  assert.ok(question);assert.notEqual(question.target.id,'a');assert.equal(question.options.length,4);
  assert.equal(new Set(question.options.map(item=>item.name.trim().toLowerCase())).size,4);
  assert.equal(question.options.filter(item=>item.id===question.target.id).length,1);
  assert.equal(makePracticeQuestion(pool.slice(0,4)),null);
});
test('practice displays its target alone by default and restores context when requested',()=>{
  assert.equal(practiceEntryVisible('target','target',true,false),true);
  assert.equal(practiceEntryVisible('other','target',true,false),false);
  assert.equal(practiceEntryVisible('other','target',true,true),true);
  assert.equal(practiceEntryVisible('other','target',false,false),true);
  assert.equal(practiceEntryVisible('other',null,true,false),true);
});
test('focus fits a structure in narrow as well as wide viewports',()=>{
  assert.ok(focusDistance(.5,.5)>focusDistance(.5,1));
  assert.equal(focusDistance(0,1),.16);
  assert.ok(Number.isFinite(focusDistance(1,NaN)));
  for(const aspect of [.3,.6,1,2]){
    const distance=focusDistance(1,aspect),halfAngle=Math.min(17*Math.PI/180,Math.atan(Math.tan(17*Math.PI/180)*aspect));
    assert.ok(distance*Math.sin(halfAngle)>1);
  }
});
test('questions from the actual catalogue always have four distinct options',()=>{
  for(const file of ['atlas','anatomy']){
    const data=JSON.parse(readFileSync(new URL(`../public/data/${file}.json`,import.meta.url)));
    for(const system of new Set(data.structures.map(item=>item.system))){
      const pool=data.structures.filter(item=>item.system===system&&!item.defaultHidden);
      const unique=new Set(pool.map(item=>item.name.trim().toLowerCase()));if(unique.size<4)continue;
      for(let i=0;i<10;i++){
        const question=makePracticeQuestion(pool);assert.ok(question,`${file} ${system}`);
        assert.equal(new Set(question.options.map(item=>item.name.trim().toLowerCase())).size,4);
      }
    }
  }
});
