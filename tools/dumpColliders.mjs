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
import puppeteer from 'puppeteer';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../test/fixtures/colliders.json');
const URL = process.env.GAME_URL ?? 'http://localhost:5173/';

/** Geometry rounded hard enough that float noise cannot show up as a diff. */
const PLACES = 4;

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 2_400_000,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(1_200_000);
  await page.setViewport({ width: 64, height: 64 });

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

  // Which boxes hold still. Two seconds is longer than any door takes to
  // swing and long enough for the hoist and the cube to have moved.
  const first = await page.evaluate(() => window.__snap());
  await frames(120);
  const second = await page.evaluate(() => window.__snap());

  if (first.length !== second.length) {
    throw new Error(`the collider list changed length while idling: ${first.length} -> ${second.length}`);
  }

  const key = (box) =>
    JSON.stringify([
      box.minX, box.maxX, box.minZ, box.maxZ,
      box.top, box.bottom, box.ceiling, box.passHeight, box.stopsFriend,
    ]);

  const staticIndices = [];
  for (let i = 0; i < first.length; i++) {
    if (key(first[i]) === key(second[i])) staticIndices.push(i);
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

  if (errors.length) throw new Error(`page errors during the dump:\n  ${errors.join('\n  ')}`);

  const fixture = {
    note: 'Generated by tools/dumpColliders.mjs. Do not edit by hand; regenerate and diff.',
    counts: { total: first.length, static: boxes.length, dynamic },
    places: PLACES,
    scenarioOrder: Object.keys(scenarios),
    boxes,
    scenarios,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(fixture, null, 1)}\n`, 'utf8');

  console.log(`${boxes.length} static colliders, ${dynamic} dynamic, ${Object.keys(scenarios).length} scenarios`);
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
}
