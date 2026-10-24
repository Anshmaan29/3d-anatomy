import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/revision.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createRevisionCards, scheduleReview, dueRevisionCards, parseRevisionState, readRevisionState, exactRelatedStructures, DAY } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const muscle = { id: 'ATLAS_Mus_1', name: 'Test muscle', latinName: 'Musculus test', system: 'muscular', region: 'Upper limb', source: 'Test source', details: { origin: 'Source origin', insertion: 'n/a', innervation: 'Test nerve', action: 'Source action' } };

test('revision cards preserve source answers and stable unique IDs without filling missing facts', () => {
  const cards = createRevisionCards([muscle, muscle, { ...muscle, id: 'unresolved', name: 'Mus_M100' }]);
  assert.equal(cards.length, 4);
  assert.equal(new Set(cards.map(card => card.id)).size, cards.length);
  assert.deepEqual(cards.map(card => card.kind), ['latin', 'origin', 'innervation', 'action']);
  assert.equal(cards.find(card => card.kind === 'origin').answer, muscle.details.origin);
  assert.ok(cards.every(card => card.source === 'Test source'));
  assert.deepEqual(createRevisionCards([muscle]).map(card => card.id), cards.map(card => card.id));
  assert.equal(createRevisionCards([{ ...muscle, reviewStatus: 'unresolved label' }]).length, 0);
});

test('review scheduling handles learning, recall growth, lapses and bounded long intervals', () => {
  const now = 1000000;
  const first = scheduleReview(undefined, 'good', now);
  assert.equal(first.due, now + DAY);
  assert.equal(first.repetitions, 1);
  const repeated = scheduleReview(first, 'easy', now + DAY);
  assert.equal(repeated.intervalDays, 3.5);
  const lapse = scheduleReview(repeated, 'again', now + 2 * DAY);
  assert.equal(lapse.due - lapse.reviewedAt, 600000);
  assert.equal(lapse.lapses, 1);
  assert.equal(lapse.repetitions, 3);
  assert.equal(scheduleReview({ ...repeated, intervalDays: 350 }, 'easy', now).intervalDays, 365);
});

test('due queue prioritizes overdue cards, includes unseen cards and excludes future reviews', () => {
  const cards = createRevisionCards([muscle]);
  const reviews = { [cards[0].id]: { due: 200 }, [cards[1].id]: { due: 50 }, [cards[2].id]: { due: 40 } };
  assert.deepEqual(dueRevisionCards(cards, reviews, 100).map(card => card.id), [cards[2].id, cards[1].id, cards[3].id]);
});

test('revision storage rejects malformed state and survives storage access failures', () => {
  const good = scheduleReview(undefined, 'good', 100);
  const parsed = parseRevisionState({ version: 1, deck: [muscle.id, muscle.id, 42, ''], reviews: { 'ATLAS_Mus_1::origin': good, '__proto__': good, 'bad::action': { ...good, due: -2 }, 'bad::latin': { ...good, repetitions: 1.5 } } });
  assert.deepEqual(parsed.deck, [muscle.id]);
  assert.deepEqual(Object.keys(parsed.reviews), ['ATLAS_Mus_1::origin']);
  assert.deepEqual(readRevisionState({ getItem() { throw new Error('Storage blocked'); } }), { version: 1, deck: [], reviews: {} });
  assert.deepEqual(readRevisionState({ getItem() { return '{bad'; } }), { version: 1, deck: [], reviews: {} });
  assert.equal(parseRevisionState({ version: 2, deck: [muscle.id] }).deck.length, 0);
});

test('related nerve links require complete source terms rather than guessed relationships', () => {
  const nerves = [{ id: 'nerve', name: 'Test nerve', system: 'nervous' }, { id: 'other', name: 'Other nerve', system: 'nervous' }];
  assert.deepEqual(exactRelatedStructures('Test nerve', nerves).map(item => item.id), ['nerve']);
  assert.deepEqual(exactRelatedStructures('Branches of test nerve (C5)', nerves), []);
  assert.deepEqual(exactRelatedStructures('Test nerve; Other nerve', nerves).map(item => item.id), ['nerve', 'other']);
});

test('actual Atlas cards have unique IDs and only populated source content', () => {
  const { structures } = JSON.parse(readFileSync(new URL('../public/data/atlas.json', import.meta.url), 'utf8'));
  const cards = createRevisionCards(structures);
  assert.ok(cards.length > 1000);
  assert.equal(new Set(cards.map(card => card.id)).size, cards.length);
  const source = new Map(structures.map(structure => [structure.id, structure]));
  for (const card of cards) {
    const structure = source.get(card.structureId);
    assert.equal(card.answer, card.kind === 'latin' ? structure.name.trim() : structure.details[card.kind].trim());
    assert.ok(card.answer && !/^n\/?a$/i.test(card.answer));
  }
});
