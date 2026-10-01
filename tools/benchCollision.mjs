/**
 * How long the collision scan actually takes, so phase 3 is a decision rather
 * than a hunch.
 *
 *   npm run bench:collision
 *
 * The three queries are pure functions over a plain array now, so the cost can
 * be measured here instead of guessed at from a collider count. Node is a fair
 * proxy for the browser on this particular question: it is the same engine
 * doing the same arithmetic over the same data, and none of it touches the
 * GPU. What this cannot tell you is whether the *game* is slow — only what
 * share of a frame the scan is asking for.
 *
 * The budget is 16.7ms at 60fps. Two bodies ask three questions each, every
 * frame, so the number to compare against the budget is the "per frame" line.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as collision from '../src/collision.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(HERE, '../test/fixtures/colliders.json'), 'utf8'));

/**
 * The fixture with its gates put back.
 *
 * `enabled` cannot be serialised, so the dump records whether a box had one
 * and the bitmap records what it answered. Restoring real closures matters
 * for the measurement: 783 of these call one on every pass, and a property
 * read and a function call are not the same price.
 */
function world(scenario) {
  const bits = fixture.scenarios[scenario];
  return fixture.boxes.map((box, i) => {
    const { gated, ...rest } = box;
    if (gated) {
      const on = bits[i] === '1';
      rest.enabled = () => on;
    }
    return rest;
  });
}

const colliders = world('wall4');
const gated = colliders.filter((b) => b.enabled).length;

const PLAYER = { kind: collision.PLAYER, radius: 0.42, height: 1.8, stepHeight: 0.9 };
const FRIEND = { kind: collision.FRIEND, radius: 0.22, height: 0.82, stepHeight: 0.25 };

/** Somewhere in the tall room, standing on a deck, which is the busy case. */
const spot = () => ({
  x: -73.4 + (Math.random() - 0.5) * 12,
  z: -56.04 + (Math.random() - 0.5) * 11,
  feetY: 3.47,
  grounded: true,
  previousFeetY: 3.47,
  previousHeadY: 3.47 + 1.8,
});

function time(label, work, iterations) {
  // Warm up, so the first measured pass is not paying for the optimiser.
  for (let i = 0; i < Math.min(2000, iterations); i++) work();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) work();
  const each = (performance.now() - started) / iterations;
  return { label, each };
}

const ITERATIONS = 20000;
const at = spot();

const results = [
  time('pushOut        (player)', () => collision.pushOut(colliders, PLAYER, { ...at }), ITERATIONS),
  time('supportHeight  (player)', () => collision.supportHeight(colliders, PLAYER, at), ITERATIONS),
  time('ceilingHeight  (player)', () => collision.ceilingHeight(colliders, PLAYER, at), ITERATIONS),
  time('pushOut        (friend)', () => collision.pushOut(colliders, FRIEND, { ...at }), ITERATIONS),
  time('supportHeight  (friend)', () => collision.supportHeight(colliders, FRIEND, at), ITERATIONS),
  time('ceilingHeight  (friend)', () => collision.ceilingHeight(colliders, FRIEND, at), ITERATIONS),
];

console.log(`${colliders.length} colliders, ${gated} of them gated by a closure`);
console.log('');
for (const { label, each } of results) {
  console.log(`  ${label}  ${(each * 1000).toFixed(1)} us`);
}

const perFrame = results.reduce((sum, r) => sum + r.each, 0);
const budget = 1000 / 60;
console.log('');
console.log(`  per frame (both bodies, all six)  ${perFrame.toFixed(3)} ms`);
console.log(`  share of a 60fps frame            ${((perFrame / budget) * 100).toFixed(2)}%`);
console.log(`  frames per second if this were all the game did  ${Math.round(1000 / perFrame)}`);
