/**
 * Write down the shape of the world, so a refactor has to prove it did not
 * change it.
 *
 * Phases of the architecture work that are meant to be behaviour-preserving —
 * sharing the two bodies' collision queries, formalising the collider schema,
 * adding a broad phase — all have the same failure mode: nothing crashes, a
 * body just quietly disagrees by two centimetres about what it can stand on,
 * and you find out forty metres up a shaft. This turns that into a diff.
 *
 *   npm run dump:colliders   # rewrites test/fixtures/colliders.json
 *   git diff                 # empty means the world is unchanged
 *
 * Run it after any change that should not have moved anything. The fixture is
 * also what test/world.test.js floods, so the climb is checked offline from
 * here on rather than behind a browser.
 *
 * Two things make the file stable enough to diff:
 *
 * Dynamic boxes are left out. Doors swing, the hoist deck rides, and the
 * flesh cube climbs the shaft continuously, so their numbers are different
 * every boot. They are found by sampling twice two seconds apart and dropping
 * anything that moved, rather than by a list someone has to maintain — and
 * the count of them is recorded, so a static box becoming dynamic still shows
 * up as a diff.
 *
 * And the static ones are sorted by their own geometry rather than left in
 * creation order, because a refactor is allowed to register them in a
 * different order and that is not a change to the world.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, preparePage, bootGame } from './browser.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test/fixtures/colliders.json');
const URL = process.env.GAME_URL ?? 'http://localhost:5173/';

/** Geometry rounded hard enough that float noise cannot show up as a diff. */
const PLACES = 4;

const browser = await launchBrowser();

try {
  const page = await preparePage(browser);

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  process.stdout.write(`booting ${URL} … `);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game?.tallRoom, { timeout: 2_400_000, polling: 2000 });
  await page.evaluate(() => {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'none';
  });
  await page.waitForFunction(
    () => !window.game.wakeUp.isPlaying && !window.game.cutscene.isPlaying,
    { timeout: 900_000, polling: 1000 }
  );

  const frames = (n) =>
    page.evaluate(
      (count) =>
        new Promise((done) => {
          let seen = 0;
          const step = () => (++seen > count ? done() : requestAnimationFrame(step));
          step();
        }),
      n
    );

  await frames(60);
  console.log('up');

  await page.evaluate((places) => {
    const round = (v) => (v === undefined ? undefined : +v.toFixed(places));
    /** One collider, as the plain data it is under the closures. */
    window.__snap = () =>
      window.game.room.colliders.map((box) => ({
        minX: round(box.minX),
        maxX: round(box.maxX),
        minZ: round(box.minZ),
        maxZ: round(box.maxZ),
        top: round(box.top),
        bottom: round(box.bottom),
        ceiling: round(box.ceiling),
        passHeight: round(box.passHeight),
        stopsFriend: box.stopsFriend ? true : undefined,
        // Whether it can gate itself, not what it answers right now — that is
        // the scenarios' job below.
        gated: typeof box.enabled === 'function' ? true : undefined,
        on: box.enabled?.() !== false,
      }));
    window.__geom = (box) =>
      JSON.stringify([
        box.minX, box.maxX, box.minZ, box.maxZ,
        box.top, box.bottom, box.ceiling, box.passHeight, box.stopsFriend,
      ]);
  }, PLACES);

  /**
   * Which boxes hold still — watched over seconds, not frames.
   *
   * This used to take two samples 120 frames apart, on the reasoning that
   * 120 frames is two seconds and two seconds is longer than any door takes
   * to swing. The arithmetic was right and the assumption underneath it was
   * a renderer running at sixty. These harnesses spent a long time on
   * Chrome's software rasteriser at a handful of frames a second, where 120
   * frames was minutes and everything in the building had moved by the end
   * of it. The moment they were put back on the GPU, 120 frames became the
   * two seconds it always claimed to be — and the flesh cube, which waits at
   * the bottom of its shaft for longer than that, held perfectly still
   * across both samples and was written into the fixture as a static floor.
   *
   * A fifteen by fourteen metre floor at 14.53, in a shaft whose whole
   * subject is what you can and cannot reach. (The climb tests survived it
   * only because `rungs` in world.test.js throws out anything over ten
   * metres wide, which is a guard against exactly this and is the reason
   * this was a wrong fixture rather than a wrong answer.)
   *
   * So: sampled on a clock, over a window longer than the longest pause any
   * moving thing in this building takes, and a box has to be identical in
   * every sample to count as still. The window is the number that matters
   * and it is written down rather than derived, because what it has to clear
   * is the cube's dwell, and that is a dramatic beat rather than a constant
   * anybody can import.
   */
  const WATCH = { seconds: 14, samples: 8 };

  const snaps = [await page.evaluate(() => window.__snap())];
  for (let i = 1; i < WATCH.samples; i++) {
    await new Promise((done) => setTimeout(done, (WATCH.seconds * 1000) / (WATCH.samples - 1)));
    const snap = await page.evaluate(() => window.__snap());
    if (snap.length !== snaps[0].length) {
      throw new Error(`the collider list changed length while idling: ${snaps[0].length} -> ${snap.length}`);
    }
    snaps.push(snap);
  }
  const first = snaps[0];
  const second = snaps[snaps.length - 1];

  const key = (box) =>
    JSON.stringify([
      box.minX, box.maxX, box.minZ, box.maxZ,
      box.top, box.bottom, box.ceiling, box.passHeight, box.stopsFriend,
    ]);

  const staticIndices = [];
  for (let i = 0; i < first.length; i++) {
    if (snaps.every((snap) => key(snap[i]) === key(first[i]))) staticIndices.push(i);
  }
  const dynamic = first.length - staticIndices.length;

  // Sorted by geometry so that registering them in another order is not a
  // diff, and ties broken completely so the sort is total.
  staticIndices.sort((a, b) => (key(first[a]) < key(first[b]) ? -1 : key(first[a]) > key(first[b]) ? 1 : 0));

  const boxes = staticIndices.map((i) => {
    const out = {};
    for (const [k, v] of Object.entries(second[i])) {
      if (v !== undefined && k !== 'on') out[k] = v;
    }
    return out;
  });

  /**
   * And which of them are solid in each state of the room.
   *
   * A bitmap per scenario rather than a copy of every box per scenario: 783
   * of these gate themselves, the geometry does not move when a wall is
   * called, and the only thing that differs between the five states is which
   * ones answer true.
   */
  const settle = async (wall) => {
    await page.evaluate((n) => window.game.tallRoom.showWall(n), wall);
    for (let i = 0; i < 60; i++) {
      await frames(6);
      const done = await page.evaluate(
        (n) =>
          window.game.tallRoom.wallState.every((s) =>
            s.wall === n ? s.out >= 0.999 : s.out <= 0.001
          ),
        wall
      );
      if (done) return true;
    }
    return false;
  };

  const enabledBits = async () => {
    const on = await page.evaluate(
      (idx) => idx.map((i) => (window.game.room.colliders[i].enabled?.() !== false ? '1' : '0')).join(''),
      staticIndices
    );
    return on;
  };

  const scenarios = {};
  await page.evaluate(() => window.game.tallRoom.showWall(0));
  await frames(180);
  scenarios.rest = await enabledBits();
  for (const wall of [1, 2, 3, 4]) {
    if (!(await settle(wall))) throw new Error(`wall ${wall} never settled`);
    scenarios[`wall${wall}`] = await enabledBits();
  }

  /**
   * And where the refuges are, which the geometry alone cannot tell you.
   *
   * A refuge is an absence — the gap left between two slabs — so there is no
   * box in the list that *is* one, and nothing offline can pick them out of
   * nine hundred others. Without this, "can you get into every hole" is not
   * a question the fixture can be asked, and that question went unasked
   * long enough for two of them to be filled in with somebody else's
   * concrete.
   */
  const refuges = await page.evaluate((places) => {
    const round = (v) => +v.toFixed(places);
    return window.game.tallRoom.refuges
      .map((r) => ({ wall: r.wall, x: round(r.x), y: round(r.y), z: round(r.z) }))
      .sort((a, b) => a.wall - b.wall || a.y - b.y || a.x - b.x);
  }, PLACES);

  if (errors.length) throw new Error(`page errors during the dump:\n  ${errors.join('\n  ')}`);

  const fixture = {
    note: 'Generated by tools/dumpColliders.mjs. Do not edit by hand; regenerate and diff.',
    counts: { total: first.length, static: boxes.length, dynamic, refuges: refuges.length },
    places: PLACES,
    scenarioOrder: Object.keys(scenarios),
    boxes,
    refuges,
    scenarios,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(fixture, null, 1)}\n`, 'utf8');

  console.log(
    `${boxes.length} static colliders, ${dynamic} dynamic, ${refuges.length} refuges, ${Object.keys(scenarios).length} scenarios`
  );
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
