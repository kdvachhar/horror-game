/**
 * That the collider check actually rejects things.
 *
 * A validator which passes on its first run is only reassuring if it would
 * have said something had it not. Each case here is a mistake that is
 * plausible in this codebase rather than a synthetic one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCollider, validateColliders } from '../src/collision.js';

const box = (extra = {}) => ({ minX: 0, maxX: 1, minZ: 0, maxZ: 1, ...extra });

test('a plain wall passes', () => {
  assert.deepEqual(checkCollider(box()), []);
});

test('a deck, a lid and a gated box all pass', () => {
  assert.deepEqual(checkCollider(box({ top: 3, bottom: 2.98 })), []);
  assert.deepEqual(checkCollider(box({ bottom: 3.6 })), []);
  assert.deepEqual(checkCollider(box({ top: 1, enabled: () => true })), []);
  assert.deepEqual(checkCollider(box({ top: 1, rise: 0.4 })), []);
  assert.deepEqual(checkCollider(box({ passHeight: 1.2 })), []);
  assert.deepEqual(checkCollider(box({ stopsFriend: true })), []);
});

test('a field nobody reads is caught', () => {
  // The one that earns the whole function. `ceiling` existed for two days on
  // thirteen boxes, honoured by one body and unknown to the other.
  const faults = checkCollider(box({ bottom: 3.6, ceiling: 3.6 }));
  assert.ok(
    faults.some((f) => f.includes('ceiling')),
    `expected the unknown field to be reported, got ${JSON.stringify(faults)}`
  );
});

test('a missing or bent edge is caught', () => {
  assert.ok(checkCollider({ minX: 0, maxX: 1, minZ: 0 }).some((f) => f.includes('maxZ')));
  assert.ok(checkCollider(box({ minX: 5 })).some((f) => f.includes('minX is past maxX')));
  assert.ok(checkCollider(box({ maxZ: NaN })).some((f) => f.includes('maxZ')));
});

test('an underside above its own surface is caught', () => {
  assert.ok(
    checkCollider(box({ top: 2, bottom: 3 })).some((f) => f.includes('above top')),
    'a plate cannot have its bottom over its top'
  );
});

test('rise without a top is caught', () => {
  // `rise` is how far `top` moved. Without one it describes nothing, which is
  // the shape a half-finished moving platform would take.
  assert.ok(checkCollider(box({ rise: 0.4 })).some((f) => f === 'rise without top'));
});

test('a gate that is not callable is caught', () => {
  assert.ok(checkCollider(box({ enabled: true })).some((f) => f.includes('not a function')));
});

test('validateColliders reports every fault and says how many', () => {
  const said = [];
  const faults = validateColliders(
    [box(), box({ nonsense: 1 }), box({ top: 1, bottom: 2 })],
    (...args) => said.push(args.join(' '))
  );
  assert.equal(faults.length, 2);
  assert.ok(said[0].includes('2 bad colliders'), said[0]);
});

test('a clean world says nothing at all', () => {
  const said = [];
  const faults = validateColliders([box(), box({ top: 1 })], (...a) => said.push(a));
  assert.deepEqual(faults, []);
  assert.deepEqual(said, [], 'a clean run must be silent');
});
