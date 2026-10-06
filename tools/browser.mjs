/**
 * One place that knows how to start a browser for these harnesses.
 *
 * It exists because of a single measured flag. Every harness here used to
 * launch with `--use-angle=swiftshader`, which is Chrome's CPU rasteriser:
 * no GPU, every triangle in software. For a scene of 6000 meshes and 62
 * lights that is the difference between a harness you run and a harness you
 * schedule.
 *
 *   swiftshader   the game up in about six minutes, a handful of frames a
 *                 second afterwards, and enough memory pressure that the
 *                 renderer gets killed part way through a long run.
 *   the GPU       up in 14.8s, settled at 16.9s, 59.8 fps.
 *
 * Which is roughly twenty to one on the one cost that dominates every
 * question anybody asks this game offline. Headless Chrome on a Mac reaches
 * the real device through ANGLE's Metal backend without being asked — the
 * swiftshader flag was not enabling software rendering as a fallback, it was
 * switching the GPU off.
 *
 * The flag is kept as a fallback rather than deleted, because the reason to
 * pin swiftshader is real: it is deterministic across machines and it works
 * where there is no GPU at all, which is what a CI box is. Set
 * `HARNESS_GL=swiftshader` for that. Nothing in these harnesses reads a
 * pixel — they ask the scene graph and the collider list — so the backend
 * cannot change an answer, only how long it takes to get one. The collider
 * fixture coming back byte-identical across the switch is the evidence.
 */

import puppeteer from 'puppeteer';

const SOFTWARE = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export function launchArgs() {
  const gl = process.env.HARNESS_GL;
  return [
    ...(gl === 'swiftshader' ? SOFTWARE : []),
    // The game starts its own audio; without this it waits for a gesture that
    // a headless run is never going to make.
    '--autoplay-policy=no-user-gesture-required',
  ];
}

export function launchBrowser(options = {}) {
  return puppeteer.launch({
    headless: true,
    // Long, because a cold boot still compiles every shader in the building.
    protocolTimeout: 2_400_000,
    args: launchArgs(),
    ...options,
  });
}

/**
 * Boot the game, and survive losing the page while doing it.
 *
 * Even at seventeen seconds a run can lose its frame — vite re-optimising
 * its dependencies forces a reload, and a reload detaches the frame and
 * kills whatever was waiting on it. Cheap to retry now; it used to cost six
 * minutes to find out.
 */
/**
 * How long to wait before deciding a page is never coming.
 *
 * It was twenty minutes, which was a sane guess when a cold boot on the
 * software rasteriser took six. On the GPU the game is up in fifteen
 * seconds, so twenty minutes is no longer patience, it is a hang: a run
 * that lost its first page spent three and a half hours in this harness,
 * and all but a minute of that was four navigation timeouts in a row
 * waiting for something that had already died.
 *
 * Ninety seconds is six times the longest honest boot and a hundredth of
 * what it replaces. A page that has not loaded by then is not slow.
 */
const PATIENCE = 90_000;

/** A page set up the way every harness here wants one. */
export async function preparePage(browser, { width = 64, height = 64 } = {}) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(PATIENCE);
  await page.setViewport({ width, height });
  return page;
}

export async function bootGame(page, url, { tries = 4, log = process.stdout } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      log.write(attempt === 1 ? `booting ${url} … ` : `retrying (${attempt}) … `);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.game?.__scenes, { timeout: PATIENCE, polling: 500 });
      await page.evaluate(() => {
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
      });
      await page.waitForFunction(
        () => !window.game.wakeUp.isPlaying && !window.game.cutscene.isPlaying,
        { timeout: PATIENCE, polling: 500 }
      );
      return;
    } catch (error) {
      log.write(`\n  lost the page: ${error.message.split('\n')[0]}\n`);
    }
  }
  throw new Error(`could not keep a page up long enough to boot ${url}`);
}
