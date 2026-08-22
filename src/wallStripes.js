import * as THREE from 'three';
import { makeWornPaintSurface, cloneSurface } from './textures.js';

/**
 * The painted stripe that runs round the room at dado height.
 *
 * Three of them, stacked: purple, green, white. It is the wayfinding line every
 * institution that is too big to describe in words ends up painting on itself —
 * follow the green one to radiology — and it does the same job here that the
 * staff doors do. It says the place was laid out and run by people, and that
 * the layout meant something to them, which is a colder thought than an empty
 * room on its own manages.
 *
 * The colours are the game's own. The text on the far wall cycles green, blue
 * and purple, and what comes out of the machine is purple; painting the walls
 * in two of those says the stripe and the sign-writing came out of the same
 * cupboard, and the white is what is left when a third colour would have been
 * one too many.
 *
 * Authored dark, like everything in this project that gets lit. Under ACES at
 * this exposure a stripe mixed at the colour you want to see comes out
 * fluorescent, and a white one comes out as a strip light.
 */

const STRIPES = [
  { color: '#3c2260', height: 0.15 },   // purple
  { color: '#22603a', height: 0.15 },   // green
  { color: '#8e8e84', height: 0.15 },   // white
];

/**
 * The wear, shared by every stripe in the building.
 *
 * Painted flat they came out looking applied this morning, which is the wrong
 * building: three clean ribbons on a wall that is otherwise damp, cracked and
 * forty years old. This is the same worn-paint surface the big door wears, and
 * because it is authored as dirty near-white, tinting it purple gives dirty
 * purple — the scuffs, the scratches and the crazing come free.
 *
 * Built once and cloned per stripe. Each of these is a canvas, and there are
 * three colours on four walls.
 */
const WEAR_TILE = 2.2;
let wear = null;

/** Metres of stripe per tile of wear, so the grime is the same size anywhere. */
function wornPaint(color, length, height) {
  wear ??= makeWornPaintSurface(1, 1);
  return new THREE.MeshStandardMaterial({
    ...cloneSurface(wear, length / WEAR_TILE, height / WEAR_TILE),
    color,
    roughness: 0.88,
    metalness: 0,
  });
}
/** Hairline of wall left showing between them, so they read as three. */
const SPLIT = 0.022;
/** Height of the top of the band. Above the skirting, below the eye. */
const TOP = 1.52;
/** Off the wall face, far enough not to fight it for the same pixels. */
const PROUD = 0.015;

/**
 * Paint one wall.
 *
 * `along` is the axis the wall runs down and `at` is where it stands on the
 * other one; `face` is +1 or -1 for which way the paint looks. `gaps` are the
 * stretches to leave bare — a doorway, a staff door — as [from, to] pairs in
 * the same axis as `from`/`to`, and they are why this takes a list of segments
 * rather than one long strip: paint stops at a door frame, it does not run
 * across it.
 */
export function paintWallStripes({ scene, along, at, face, from, to, gaps = [] }) {
  const group = new THREE.Group();
  scene.add(group);

  // Turn the gaps into the runs of wall that are left.
  const runs = [];
  let cursor = Math.min(from, to);
  const end = Math.max(from, to);
  for (const [gapFrom, gapTo] of [...gaps].sort((a, b) => a[0] - b[0])) {
    const lo = Math.min(gapFrom, gapTo);
    const hi = Math.max(gapFrom, gapTo);
    if (hi <= cursor || lo >= end) continue;
    if (lo > cursor) runs.push([cursor, Math.min(lo, end)]);
    cursor = Math.max(cursor, hi);
  }
  if (cursor < end) runs.push([cursor, end]);

  for (const [runFrom, runTo] of runs) {
    const length = runTo - runFrom;
    if (length < 0.05) continue;
    const middle = (runFrom + runTo) / 2;

    let y = TOP;
    for (const { color, height } of STRIPES) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(length, height),
        wornPaint(color, length, height)
      );
      // Paint on a wall is lit by the room and takes its shadows, so it is a
      // standard material rather than an unlit one: in the corners this room
      // never lights, the stripe should go dark with the wall it is on.
      stripe.receiveShadow = true;
      if (along === 'x') {
        stripe.position.set(middle, y - height / 2, at + face * PROUD);
        stripe.rotation.y = face > 0 ? 0 : Math.PI;
      } else {
        stripe.position.set(at + face * PROUD, y - height / 2, middle);
        stripe.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      group.add(stripe);
      y -= height + SPLIT;
    }
  }

  return { group };
}
