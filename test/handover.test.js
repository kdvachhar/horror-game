import test from 'node:test';
import assert from 'node:assert/strict';
import { nextInOrder } from '../src/climbLanes.js';

/**
 * The handle in a refuge, as arithmetic.
 *
 * What it has to get right is not "a sensible wall" but "the wall carrying
 * the next stretch of the route", and the cost of a wrong answer is a climb
 * that cannot be continued from where the player is standing. See tallRoom.js
 * for the handles themselves and the argument for putting them in the holes.
 */
const ORDER = [3, 0, 2, 1];

test('with nothing out, it calls the first wall of the climb', () => {
  assert.equal(nextInOrder(ORDER, null), 4);
  assert.equal(nextInOrder(ORDER, undefined), 4);
});

test('it walks the climb order and then wraps', () => {
  const seen = [];
  let wall = null;
  for (let i = 0; i < 5; i++) {
    wall = nextInOrder(ORDER, wall);
    seen.push(wall);
  }
  assert.deepEqual(seen, [4, 1, 3, 2, 4]);
});

test('every wall is one press from every other', () => {
  // The safety on a handle you can only reach from inside a pocket: whatever
  // is out, pressing enough times brings your own wall back under you.
  for (const start of [1, 2, 3, 4]) {
    const reached = new Set();
    let wall = start;
    for (let i = 0; i < 4; i++) {
      wall = nextInOrder(ORDER, wall);
      reached.add(wall);
    }
    assert.deepEqual([...reached].sort(), [1, 2, 3, 4], `from wall ${start}`);
  }
});

test('a wall that is not in the order falls back to the first', () => {
  assert.equal(nextInOrder(ORDER, 9), 4);
});

test('it takes the wall number as a string, which is what the treads send', () => {
  assert.equal(nextInOrder(ORDER, '4'), 1);
});
