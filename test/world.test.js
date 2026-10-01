/**
 * The shape of the built world, checked offline.
 *
 * Everything here runs against test/fixtures/colliders.json, which is written
 * by tools/dumpColliders.mjs out of the running game. That indirection is the
 * point: these were all browser harnesses that got thrown away after they
 * answered their question once, and every one of them covered an invariant
 * that then regressed. Against a fixture they cost milliseconds and can run on
 * every save.
 *
 * When one of these fails, it means either the world changed or the rule did.
 * Regenerate the fixture and read the diff before deciding which.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(HERE, 'fixtures/colliders.json'), 'utf8'));

/** The tall room, which is the only part of the world with a climb in it. */
const SHAFT = { minX: -80.9, maxX: -65.9, minZ: -63.04, maxZ: -49.04 };

/**
 * What a body here can do, measured rather than chosen.
 *
 * The jump peaks at 1.31 and an airborne body is allowed another 0.02, so
 * 1.33 is the tallest thing it can mount. The standing jump carries about
 * 2.1 along the ground.
 */
const UP = 1.33;
const OVER = 2.1;
/** Player height, for the headroom check. */
const BODY = 1.8;

/** The boxes that are solid in one state of the room. */
function live(scenario) {
  const bits = fixture.scenarios[scenario];
  assert.ok(bits, `no such scenario: ${scenario}`);
  return fixture.boxes.filter((_, i) => bits[i] === '1');
}

/** Standable surfaces inside the shaft, plus its floor as the starting rung. */
function rungs(scenario) {
  const out = [{ top: 0, ...SHAFT }];
  for (const box of live(scenario)) {
    if (box.top === undefined) continue;
    if (box.top < 0.2 || box.top > 80) continue;
    if (box.maxX < SHAFT.minX - 3 || box.minX > SHAFT.maxX + 3) continue;
    if (box.maxZ < SHAFT.minZ - 3 || box.minZ > SHAFT.maxZ + 3) continue;
    // The flesh cube is fifteen metres across and travels the shaft. It is
    // excluded from the fixture as dynamic, but guard anyway: a floor the
    // width of the room would make everything trivially reachable.
    if (box.maxX - box.minX > 10) continue;
    out.push(box);
  }
  return out;
}

const gap = (a, b) =>
  Math.hypot(
    Math.max(a.minX - b.maxX, b.minX - a.maxX, 0),
    Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0)
  );

/** Everything reachable from `seeds` by stepping up at most UP and across at most OVER. */
function flood(boxes, seeds) {
  const seen = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const i = queue.pop();
    for (let j = 0; j < boxes.length; j++) {
      if (seen.has(j)) continue;
      if (boxes[j].top - boxes[i].top > UP) continue;
      if (gap(boxes[i], boxes[j]) > OVER) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return [...seen];
}

const highest = (boxes, reached) => Math.max(...reached.map((i) => boxes[i].top));

test('the fixture is present and the world is the size it was', () => {
  assert.ok(fixture.boxes.length > 500, 'suspiciously few colliders in the fixture');
  assert.equal(
    fixture.counts.static,
    fixture.boxes.length,
    'the fixture disagrees with its own count'
  );
  for (const name of fixture.scenarioOrder) {
    assert.equal(
      fixture.scenarios[name].length,
      fixture.boxes.length,
      `scenario ${name} has the wrong number of bits`
    );
  }
});

test('no wall but the first gets you off the floor', () => {
  // The whole point of cutting the ladder into four. Calling the wrong wall
  // has to give you a wall that comes all the way out and still will not take
  // you anywhere.
  for (const wall of [1, 2, 3]) {
    const boxes = rungs(`wall${wall}`);
    const reached = flood(boxes, [0]);
    assert.equal(
      highest(boxes, reached),
      0,
      `wall ${wall} alone lifts you off the floor, which defeats the banding`
    );
  }
});

test('wall 4 carries you off the floor to the first landing', () => {
  const boxes = rungs('wall4');
  const reached = flood(boxes, [0]);
  assert.ok(
    Math.abs(highest(boxes, reached) - 18.17) < 0.01,
    `wall 4 reaches ${highest(boxes, reached)}, expected the 18.17 landing`
  );
});

test('the four walls in order chain to the hub', () => {
  // 4 -> 1 -> 3 -> 2, carrying your footing across each switch. The landings
  // are what you stand on while the walls swap, so each leg has to start from
  // exactly where the last one ended.
  const order = [4, 1, 3, 2];
  const expected = [18.17, 34.97, 51.77, 73.28];

  let standing = null;
  order.forEach((wall, leg) => {
    const boxes = rungs(`wall${wall}`);
    let seeds;
    if (!standing) {
      seeds = [0];
    } else {
      seeds = boxes
        .map((_, i) => i)
        .filter((i) => Math.abs(boxes[i].top - standing.top) < 0.01 && gap(boxes[i], standing) < 0.01);
      assert.ok(seeds.length, `stranded at ${standing.top} when wall ${wall} came out`);
    }
    const reached = flood(boxes, seeds);
    const best = reached.reduce((m, i) => (boxes[i].top > boxes[m].top ? i : m), reached[0]);
    assert.ok(
      Math.abs(boxes[best].top - expected[leg]) < 0.01,
      `leg ${leg + 1} on wall ${wall} reached ${boxes[best].top}, expected ${expected[leg]}`
    );
    standing = boxes[best];
  });
});

test('every ceiling leaves a body room to stand under it', () => {
  // A ceiling below head height is a room you cannot be in. The lowest in the
  // game is 2.9 against a body of 1.8.
  // A lid is a box with an underside and nothing to climb onto.
  const lids = fixture.boxes.filter((b) => b.bottom !== undefined && b.top === undefined);
  assert.ok(lids.length >= 10, `only ${lids.length} ceilings have colliders`);
  for (const lid of lids) {
    assert.ok(lid.bottom > BODY, `a ceiling at ${lid.bottom} is below head height`);
  }
});

/*
 * There was a test here asserting that nothing standable floats with no way
 * down to it. It is a reasonable-sounding rule and this room does not obey it,
 * which is the point of the room: the openings are "all identical and all out
 * of reach", and a refuge's threshold is cut into the wall so it is solid
 * whether or not the wall it belongs to has been called. The first thing the
 * assertion caught was a refuge sill at 37.23 standing over the deck that
 * serves it, with that deck retracted — which is the room working.
 *
 * Left as a note rather than deleted silently, because the next person to
 * think of it should know it was tried.
 */
