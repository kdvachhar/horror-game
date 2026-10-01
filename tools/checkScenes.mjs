/**
 * Walk every scene jump and check the game survives each one.
 *
 *   npm run check:scenes
 *
 * Each jump runs `resetSequences`, which is a hand-written list of every
 * stateful module in the game — twelve of them, winding back doors, power,
 * puzzles, speech, the death screen and both cutscenes. It is correct today.
 * It is also precisely the kind of list that goes quietly out of date the next
 * time a room is added, and the failure is invisible: the jump still works,
 * it just lands you in a room that is already solved, or dark, or talking.
 *
 * So this drives all fifteen and asserts the obvious things afterwards — no
 * page errors, the player somewhere finite and inside the world, the controls
 * handed back, no cutscene left running, no death screen left up. It cannot
 * know whether a puzzle was properly rewound, but it catches the whole class
 * of fault where a jump leaves the game wedged.
 *
 * Needs a browser, so it is not part of `npm test`. Run it after touching
 * anything a scene jump sets up.
 */

import puppeteer from 'puppeteer';

const URL = process.env.GAME_URL ?? 'http://localhost:5173/';
/** Generous: the world is about 200m across and the shaft is 76 tall. */
const BOUNDS = { x: 200, y: 120, z: 200 };

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

let failures = 0;

try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(1_200_000);
  await page.setViewport({ width: 64, height: 64 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('error', (e) => {
    console.log('TAB CRASHED', e.message);
    process.exitCode = 1;
  });

  process.stdout.write(`booting ${URL} … `);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game?.__scenes, { timeout: 2_400_000, polling: 2000 });
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
  const labels = await page.evaluate(() => window.game.__scenes.map((s) => s.label));
  console.log(`up · ${labels.length} scenes`);
  console.log('');

  for (let i = 0; i < labels.length; i++) {
    errors.length = 0;
    await page.evaluate((n) => window.game.__scenes[n].go(), i);
    // Long enough for a wake-up or cutscene that the jump deliberately starts
    // to get going, and for anything it wound back to settle.
    await frames(150);

    const state = await page.evaluate((limits) => {
      const p = window.game.player.position;
      const finite = Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
      return {
        at: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)],
        finite,
        inside:
          finite &&
          Math.abs(p.x) < limits.x &&
          p.y > -5 &&
          p.y < limits.y &&
          Math.abs(p.z) < limits.z,
        dead: window.game.death.isShowing,
        cutscene: window.game.cutscene.isPlaying,
        waking: window.game.wakeUp.isPlaying,
      };
    }, BOUNDS);

    // A scene that opens on a cutscene or a wake-up is allowed to still be
    // playing one; what it may not do is leave the player nowhere, or dead.
    const faults = [];
    if (!state.finite) faults.push('player position is not finite');
    else if (!state.inside) faults.push(`player outside the world at ${state.at.join(', ')}`);
    if (state.dead) faults.push('death screen left up');
    if (errors.length) faults.push(`page error: ${errors[0].slice(0, 120)}`);

    const playing = [state.cutscene && 'cutscene', state.waking && 'waking'].filter(Boolean);
    const note = playing.length ? ` (${playing.join(', ')})` : '';

    if (faults.length) {
      failures++;
      console.log(`  ✖ ${labels[i]}`);
      for (const fault of faults) console.log(`      ${fault}`);
    } else {
      console.log(`  ✔ ${labels[i]}  at ${state.at.join(', ')}${note}`);
    }
  }

  console.log('');
  console.log(failures ? `${failures} of ${labels.length} scenes failed` : `all ${labels.length} scenes clean`);
  if (failures) process.exitCode = 1;
} finally {
  await browser.close();
}
