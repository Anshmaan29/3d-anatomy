import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadQueue, fitViewDistance, requestedModelAssets, sectionCoordinate, sectionCut } from '../src/viewer-utils.ts';

const structure = (id, system, assetPath, balancedAssetPath) => ({ id, system, assetPath, balancedAssetPath, name: id, region: 'whole body' });
const structures = [structure('bone', 'skeletal'), structure('muscle', 'muscular', '/muscle.glb'), structure('brain', 'nervous', '/brain.glb', '/brain-small.glb'), structure('nerve', 'nervous', '/nerve.glb', '/nerve-small.glb')];
test('chunk selection excludes hidden and non-isolated anatomy and uses the requested detail', () => {
  const request = { structures, activeSystems: ['skeletal', 'nervous'], hiddenIds: ['nerve'], isolatedIds: [], dataset: 'atlas', quality: 'balanced' };
  assert.deepEqual(requestedModelAssets(request), [{ system: 'nervous', assetPath: '/brain-small.glb' }]);
  assert.deepEqual(requestedModelAssets({ ...request, hiddenIds: [], isolatedIds: ['nerve'], quality: 'high' }), [{ system: 'nervous', assetPath: '/nerve.glb' }]);
  assert.deepEqual(requestedModelAssets({ ...request, isolatedIds: ['muscle'] }), []);
});
test('open anatomy retains its base system model and separately requested supplements', () => {
  assert.deepEqual(requestedModelAssets({ structures: [...structures, structure('extra-bone', 'skeletal', '/supplement.glb')], activeSystems: ['skeletal'], hiddenIds: [], isolatedIds: [], dataset: 'open', quality: 'high' }), [{ system: 'skeletal' }, { system: 'skeletal', assetPath: '/supplement.glb' }]);
});
test('section axes correspond to anatomy coordinates and cut positions stay inside model bounds', () => {
  assert.equal(sectionCoordinate('sagittal'), 0);
  assert.equal(sectionCoordinate('axial'), 1);
  assert.equal(sectionCoordinate('coronal'), 2);
  assert.equal(sectionCut(-3, 7, .25), -.5);
  assert.equal(sectionCut(-3, 7, -1), -3);
  assert.equal(sectionCut(-3, 7, 2), 7);
  assert.equal(sectionCut(-3, 7, NaN), 2);
});
test('asset queue bounds concurrent decodes and continues after a rejected asset', async () => {
  const schedule = createLoadQueue(2);
  let active = 0, maximum = 0;
  const release = [];
  const tasks = Array.from({ length: 6 }, (_, index) => schedule(async () => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => release.push(resolve));
    active--;
    if (index === 1) throw new Error('missing chunk');
    return index;
  }));
  const result = Promise.allSettled(tasks);
  for (let pass = 0; pass < 10; pass++) {
    await new Promise(resolve => setImmediate(resolve));
    release.splice(0).forEach(resolve => resolve());
  }
  const settled = await result;
  assert.equal(maximum, 2);
  assert.equal(active, 0);
  assert.equal(settled.filter(item => item.status === 'fulfilled').length, 5);
  assert.equal(settled[1].status, 'rejected');
});

test('remapped structures sharing one GLB request and decode it only once', () => {
  const shared = [structure('kidney', 'urinary', '/shared.glb'), structure('duct', 'reproductive', '/shared.glb')];
  const assets = requestedModelAssets({structures:shared,activeSystems:['urinary','reproductive'],hiddenIds:[],isolatedIds:[],dataset:'atlas',quality:'high'});
  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetPath, '/shared.glb');
});
test('directional home fits side views using anatomical depth as screen width', () => {
  const sagittalBrain = [.01, 1, 2];
  const side = fitViewDistance(sagittalBrain, 1, 'left');
  const front = fitViewDistance(sagittalBrain, 1, 'anterior');
  assert.ok(side > front);
  assert.equal(side, fitViewDistance(sagittalBrain, 1, 'right'));
  assert.equal(front, fitViewDistance(sagittalBrain, 1, 'posterior'));
  assert.ok(fitViewDistance(sagittalBrain, .5, 'left') > side);
});
