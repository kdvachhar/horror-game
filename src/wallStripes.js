import * as THREE from 'three';
import { makeWornPaintSurface, cloneSurface } from './textures.js';

/**
 * The painted stripe that runs round every room that has no colour of its own.
 *
 * Three of them, stacked: purple, green, blue. It is the wayfinding line every
 * institution that is too big to describe in words ends up painting on itself —
 * follow the green one to radiology — and it does the same job here that the
 * staff doors do. It says the place was laid out and run by people, and that
 * the layout meant something to them, which is a colder thought than an empty
 * room on its own manages.
 *
 * The colours are the game's own: the text on the far wall of the first room
 * cycles green, blue and purple, and what comes out of the machine is purple.
 * The stripe and the sign-writing came out of the same cupboard.
 *
 * The red hall and the orange room do not get one. They already say what they
 * are, and the whole point of a line like this is that it is the only colour in
 * a place that has none — paint it through a room that is already red and it
 * stops being a marking and becomes decoration.
 *
 * Authored dark, like everything in this project that gets lit. Under ACES at
 * this exposure a stripe mixed at the colour you want to see comes out
 * fluorescent.
 */

const STRIPES = [
  { color: '#3c2260', height: 0.5 },   // purple
  { color: '#22603a', height: 0.5 },   // green
  { color: '#1e4a82', height: 0.5 },   // blue
];
/** Hairline of wall left showing between them, so they read as three. */
const SPLIT = 0.05;
/** Top to bottom of all three and the splits between them. */
const BAND = STRIPES.reduce((sum, s) => sum + s.height, 0) + SPLIT * (STRIPES.length - 1);

/**
 * How high up the wall the middle of the band sits: half the room's height, so
 * it is in the middle of the wall it is painted on.
 *
 * Except that one of these rooms is twenty-two metres tall. Taken literally the
 * band in there would be eleven metres up, which is above the light fittings,
 * past where the fog takes over, and out of shot unless you stand in the middle
 * of the floor and look up — so the room the player sees most would be the one
 * that appeared to lose its stripe. The cap is where a wall stops being a wall
 * you are standing next to and starts being architecture. Every other room in
 * the building is under it and gets its true middle.
 */
const HIGHEST = 4;
const middleOf = (height) => Math.min(height / 2, HIGHEST);

/** Off the wall face, far enough not to fight it for the same pixels. */
const PROUD = 0.015;

/**
 * How far into the room something has to stand before the paint goes round it,
 * and how much bare wall to leave either side of it when it does.
 */
const REACH = 0.35;
const MARGIN = 0.12;
/**
 * How deep a thing can be and still count as fixed to the wall.
 *
 * Because this reads bounding boxes, and a bounding box is a poor description
 * of anything long and bent. The black wire is one tube that leaves the ward,
 * crosses the corridor and runs the length of the building: its box is thirteen
 * metres deep, touches every wall it passes and reads as a fitting on all of
 * them. It was blanking whole walls — the corridor lost its stripe entirely to
 * a cable an inch thick lying on the floor. Nothing actually screwed to a wall
 * is a metre deep.
 */
const DEEPEST = 1.2;
/** Anything closer to the wall than this is the wall, not something on it. */
const FLUSH = 0.03;
/**
 * And how far behind the plane a surface can be and still be *this* wall.
 *
 * Without this the test was only "does it stick out into the room", which every
 * mesh in the next room along also passes, and a wall asked for where there is
 * no wall got painted anyway — on the strength of a wall seven metres behind it.
 * That put three stripes across the middle of the room with the television,
 * hanging in the air in front of it. A wall is a surface at the plane, not
 * everything standing behind the plane.
 */
const BEHIND = 0.45;

/**
 * The wear, shared by every stripe in the building.
 *
 * Painted flat they came out looking applied this morning, which is the wrong
 * building: clean ribbons on walls that are otherwise damp, cracked and forty
 * years old. This is the same worn-paint surface the big door wears, and
 * because it is authored as dirty near-white, tinting it purple gives dirty
 * purple — the scuffs, the scratches and the crazing come free.
 *
 * Built once and cloned per stripe. Each of these is a canvas, and there are
 * three colours on every wall of six rooms.
 */
const WEAR_TILE = 2.2;
let wear = null;

function wornPaint(color, length, height) {
  wear ??= makeWornPaintSurface(1, 1);
  return new THREE.MeshStandardMaterial({
    ...cloneSurface(wear, length / WEAR_TILE, height / WEAR_TILE),
    color,
    roughness: 0.88,
    metalness: 0,
  });
}

/** Merge overlapping spans, so a run of them can be walked in order. */
function merge(spans) {
  const sorted = spans
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push([...span]);
  }
  return out;
}

/** Everything in `keep` that is not in `cut`. */
function subtract(keep, cut) {
  const out = [];
  for (const [from, to] of keep) {
    let cursor = from;
    for (const [lo, hi] of cut) {
      if (hi <= cursor || lo >= to) continue;
      if (lo > cursor) out.push([cursor, Math.min(lo, to)]);
      cursor = Math.max(cursor, hi);
    }
    if (cursor < to) out.push([cursor, to]);
  }
  return out;
}

/**
 * Read the wall: where there is one, and what is already fixed to it.
 *
 * Both halves of this are measured off the scene rather than written down by
 * hand, and that is the only reason painting six rooms is a job worth doing at
 * all. Between them these rooms have four doorways, two staff doors, two
 * posters, a television, a wall of arms, a hatch, a window and a set of
 * shelves, and every one of those is a hole to leave in the paint. Listing them
 * by hand means measuring them by hand, and being wrong somewhere no one looks
 * for a month.
 *
 * `walls` is where the wall actually exists across the band's own height, so a
 * doorway is a hole rather than a gap that has to be described, and a run given
 * as the whole length of a room stops on its own wherever the room does. The
 * lintel over a door is deliberately not a wall by this test: it is up above
 * the band, and paint does not float across an opening under it.
 */
function readWall({ scene, along, at, face, ignore, top, bottom }) {
  const axis = along === 'x' ? 'x' : 'z';
  const normal = along === 'x' ? 'z' : 'x';
  const skip = new Set();
  for (const root of ignore) root?.traverse?.((object) => skip.add(object));

  const walls = [];
  const blocked = [];

  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry || skip.has(object)) return;
    // Its own paint, and anything that has said it is a hole rather than a
    // surface — the inside of a recess is neither a wall nor a thing fixed to
    // one, and read as a wall it gets the band painted across an opening.
    if (object.userData.wallStripe || object.userData.notWall) return;
    object.updateWorldMatrix(true, false);
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);

    // Signed distance into the room, so + is toward the player either way.
    const d1 = (box.min[normal] - at) * face;
    const d2 = (box.max[normal] - at) * face;
    const near = Math.min(d1, d2);
    const far = Math.max(d1, d2);
    const span = [box.min[axis], box.max[axis]];

    // The wall itself: sitting in the plane or behind it, and tall enough to
    // carry the band at the height the band runs.
    if (far <= FLUSH) {
      // Masonry, not joinery. A wall is either a surface — every wall in this
      // game is a plane — or something thick enough to be structure. A door
      // leaf sitting in its frame is neither: it is a hundred millimetres of
      // board that happens to be flush with the wall today, and painting the
      // stripe across it leaves a band hanging in an open doorway the moment
      // it swings. The red door in the dark room did exactly that.
      const thickness = Math.abs(box.max[normal] - box.min[normal]);
      const structural = thickness < 0.06 || thickness > 0.3;
      if (structural && far >= -BEHIND && box.min.y <= bottom + 0.01 && box.max.y >= top - 0.01) {
        walls.push(span);
      }
      return;
    }
    // Something on the wall, standing in front of it across the band.
    if (near < REACH && far - near < DEEPEST && box.min.y < top && box.max.y > bottom) {
      blocked.push([span[0] - MARGIN, span[1] + MARGIN]);
    }
  });

  return { walls: merge(walls), blocked: merge(blocked) };
}

/**
 * Paint one wall.
 *
 * `along` is the axis the wall runs down and `at` is where it stands on the
 * other one; `face` is +1 or -1 for which way the paint looks.
 */
export function paintWallStripes({ scene, along, at, face, from, to, height = 3.4, ignore = [] }) {
  const group = new THREE.Group();
  scene.add(group);

  const top = middleOf(height) + BAND / 2;
  const bottom = top - BAND;
  const { walls, blocked } = readWall({ scene, along, at, face, ignore, top, bottom });
  const wanted = [[Math.min(from, to), Math.max(from, to)]];
  // Where the wall is, minus what is on it, minus anything outside the stretch
  // asked for.
  const runs = subtract(subtract(walls, blocked), subtract(
    [[-Infinity, Infinity]],
    wanted
  ));

  for (const [runFrom, runTo] of runs) {
    const length = runTo - runFrom;
    if (length < 0.25) continue;   // a scrap of paint between two fittings
    const middle = (runFrom + runTo) / 2;

    let y = top;
    for (const { color, height: thickness } of STRIPES) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(length, thickness),
        wornPaint(color, length, thickness)
      );
      // Paint on a wall is lit by the room and takes its shadows, so it is a
      // standard material rather than an unlit one: in the corners these rooms
      // never light, the stripe should go dark with the wall it is on.
      stripe.receiveShadow = true;
      stripe.userData.wallStripe = true;
      if (along === 'x') {
        stripe.position.set(middle, y - thickness / 2, at + face * PROUD);
        stripe.rotation.y = face > 0 ? 0 : Math.PI;
      } else {
        stripe.position.set(at + face * PROUD, y - thickness / 2, middle);
        stripe.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      group.add(stripe);
      y -= thickness + SPLIT;
    }
  }

  return { group, runs };
}

/**
 * Paint all four walls of a room, facing in.
 *
 * The bounds can be generous — the far end of a corridor that turns a corner,
 * a store room whose near wall is only half there — because a wall that is not
 * there does not get painted. That is what makes this callable per room rather
 * than per stretch of masonry.
 */
export function paintRoomStripes({ scene, minX, maxX, minZ, maxZ, height, ignore = [] }) {
  const group = new THREE.Group();
  scene.add(group);
  for (const wall of [
    { along: 'z', at: minX, face: 1, from: minZ, to: maxZ },
    { along: 'z', at: maxX, face: -1, from: minZ, to: maxZ },
    { along: 'x', at: minZ, face: 1, from: minX, to: maxX },
    { along: 'x', at: maxZ, face: -1, from: minX, to: maxX },
  ]) {
    group.add(paintWallStripes({ scene, ignore, height, ...wall }).group);
  }
  return { group };
}
