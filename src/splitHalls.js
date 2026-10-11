import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeRockSurface,
  makeHazardSurface,
  worldRepeat,
  cloneSurface,
} from './textures.js';
import { seeded, jitter } from './rockfall.js';
import { showNote, setObjective } from './hud.js';

/**
 * What is past the shutter: a collapse you climb, and then a choice you make
 * three times.
 *
 * The chase ends at the transfer hall's shutter and this is the other side of
 * it. It has one job the chase could not do — **it has to be slow**. Forty-two
 * metres of being hunted down a straight tunnel is the loudest thing in the
 * game, and the only way to make the next loud thing land is to put something
 * quiet between them. So nothing in here moves, nothing in here is chasing
 * you, and the whole of the tension is that you do not know which way is out.
 *
 * Three things in order:
 *
 *   **The fall.** The hall's end wall is broken open and the roof of the next
 *   chamber came down in it. You go up the heap, which is eight piles of rock
 *   stepped at two thirds of a metre — under a step's height, so it is walked
 *   and not jumped. See CLIMB: every way out of a room in this building is
 *   walkable, and this is not the room to break that in.
 *
 *   **The splits.** Three T-junctions, one after another. At each one a branch
 *   is a dead end and a branch carries on, and nothing tells you which. They
 *   are short on purpose — a wrong turn here costs about eight seconds, which
 *   is long enough to be a mistake and not long enough to be a chore.
 *
 *   **The lobby**, which is where the lift is and where this file stops. See
 *   codeLift.js.
 *
 * **It is built out of cells rather than walls**, and that is the only
 * structural idea in here worth knowing. A maze written as walls is a maze
 * where every junction is four panels and three colliders typed by hand, and
 * where moving one corridor half a metre means finding the eleven numbers that
 * mentioned it. Written as boxes of air, the walls are *derived*: a cell gets
 * a wall on every part of its face that no other cell is standing against. Add
 * a corridor, the walls between it and its neighbours disappear on their own.
 *
 * Not orientable: the breach faces -z and the whole thing runs away from it.
 * See the top of controlRoom.js for why none of these are written to turn
 * round.
 */

/**
 * The climb, and why none of it is a jump.
 *
 * `rise` is two thirds of a metre against a step height of 0.9, so you walk up
 * the heap the way you walk up a kerb — no timing, no run-up, nothing to fail.
 * That is a rule the whole building keeps and it is worth saying once in the
 * one room most likely to break it: a heap of rock is exactly the shape that
 * invites a jump puzzle, and a jump puzzle is a thing you can be stuck on,
 * which is the worst possible state to be in directly after being chased.
 *
 * The zigzag is 1.6 either side of the middle, which is small against piles
 * 4.4 across: consecutive steps overlap by more than a metre, so there is
 * always floor under the next one before you have left the last.
 */
const CLIMB = { steps: 8, rise: 0.675, along: 2.6, aside: 1.6, wide: 4.4, deep: 3.2 };

/** The chamber the heap is in. Tall, because the way out of it is five up. */
const FALL = { wide: 18, long: 26, high: 11.6 };

/** The corridors. One width, one height, everywhere. */
const RUN = { wide: 4.0, high: 3.4 };

/** How high the upper floor sits over the hall you came from. */
const LIFT_UP = CLIMB.steps * CLIMB.rise;

const WALL_TINT = '#3a3e36';
const FLOOR_TINT = '#2f312b';
const ROCK_TINT = '#4a4b44';
/** Dead and live, as colours rather than numbers — see storageRoom.js. */
const DEAD_STRIP = new THREE.Color('#12140f');
const LIVE_STRIP = new THREE.Color('#93a47e');

const EPS = 1e-4;

/**
 * The spans of [lo, hi] left over once every span in `cuts` is taken out.
 *
 * This is the whole cell trick. A cell's face is a number line, the places
 * another cell stands against it are holes in that line, and what is left is
 * wall. Slivers under two centimetres are dropped: two corridors that meet
 * flush produce a zero-width leftover at each end, and a zero-width wall is a
 * z-fighting stripe rather than a wall.
 */
function remaining(lo, hi, cuts) {
  let spans = [[lo, hi]];
  for (const [a, b] of cuts) {
    const next = [];
    for (const [s, e] of spans) {
      if (b <= s + EPS || a >= e - EPS) {
        next.push([s, e]);
        continue;
      }
      if (a > s + EPS) next.push([s, a]);
      if (b < e - EPS) next.push([b, e]);
    }
    spans = next;
  }
  return spans.filter(([s, e]) => e - s > 0.02);
}

/**
 * One rectangle with rectangles taken out of it, as the rectangles left over.
 *
 * The same idea one dimension up, and it is what a hole in a wall is: an
 * opening shorter than the wall it is in cannot be expressed as a cut along
 * the face, because the wall carries on above it. Each hole splits every
 * rectangle it touches into the four around it — below, above, left, right —
 * any of which may be empty.
 */
function punch(rect, holes) {
  let rects = [rect];
  for (const hole of holes) {
    const next = [];
    for (const r of rects) {
      const lo = Math.max(r.lo, hole.lo);
      const hi = Math.min(r.hi, hole.hi);
      const bottom = Math.max(r.bottom, hole.bottom);
      const top = Math.min(r.top, hole.top);
      if (hi - lo <= EPS || top - bottom <= EPS) {
        next.push(r);
        continue;
      }
      if (r.bottom < bottom - EPS) next.push({ ...r, top: bottom });
      if (r.top > top + EPS) next.push({ ...r, bottom: top });
      if (r.lo < lo - EPS) next.push({ ...r, hi: lo, bottom, top });
      if (r.hi > hi + EPS) next.push({ ...r, lo: hi, bottom, top });
    }
    rects = next;
  }
  return rects.filter((r) => r.hi - r.lo > 0.02 && r.top - r.bottom > 0.02);
}

/**
 * @param scene   the world
 * @param doorway the breach it hangs off: { x, y, z, width, height }
 * @param player  for knowing where you are
 */
export function createSplitHalls({ scene, doorway, player }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // Laid out from the breach, so moving that moves everything behind it.
  const axis = doorway.x;
  const low = doorway.y;
  const head = doorway.z;
  /** The upper floor, which is every corridor in here. */
  const deck = low + LIFT_UP;

  // ------------------------------------------------------------- materials ---

  const wallSurface = makeWallSurface(...worldRepeat(12, RUN.high), WALL_TINT);
  const wallOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL_TINT,
      metalness: 0,
    });
  const floorSurface = makeFloorSurface(...worldRepeat(8, 8));
  const floorOf = (w, d) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(floorSurface, ...worldRepeat(w, d)),
      color: FLOOR_TINT,
      metalness: 0,
    });
  const ceilingSurface = makeCeilingSurface(...worldRepeat(8, 8));
  const ceilingOf = (w, d) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(ceilingSurface, ...worldRepeat(w, d)),
      color: '#25271f',
      metalness: 0,
    });
  const rock = new THREE.MeshStandardMaterial({
    ...makeRockSurface(2, 2),
    color: ROCK_TINT,
    metalness: 0.02,
    roughness: 0.95,
  });
  const hazard = new THREE.MeshStandardMaterial({ ...makeHazardSurface(6, 1), roughness: 0.8 });

  const panel = (material, w, h, px, py, pz, ry) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // ------------------------------------------------------------- the cells ---

  /**
   * Every box of air in here, and the route is readable off this list alone.
   *
   * `open` names the faces that get no wall because something that is not a
   * cell is on the other side of them — the breach into the chamber, and the
   * lift doors out of the lobby. Everything else is worked out.
   */
  const fall = {
    name: 'fall',
    x0: axis - FALL.wide / 2,
    x1: axis + FALL.wide / 2,
    z0: head - FALL.long,
    z1: head,
    floor: low,
    ceil: low + FALL.high,
    holes: {
      // The way in, which is the hall's own breach.
      maxZ: [{ lo: doorway.x - doorway.width / 2, hi: doorway.x + doorway.width / 2, bottom: low, top: low + doorway.height }],
      // And the way on, at the top of the heap.
      minZ: [{ lo: axis - RUN.wide / 2, hi: axis + RUN.wide / 2, bottom: deck, top: deck + RUN.high }],
    },
  };

  const mouth = fall.z0;
  /** One corridor cell on the upper deck, which is all of them bar the fall. */
  const run = (name, x0, x1, z0, z1, extra = {}) => ({
    name,
    x0,
    x1,
    z0,
    z1,
    floor: deck,
    ceil: deck + RUN.high,
    ...extra,
  });

  /**
   * The route, split by split.
   *
   * Each junction is one wide shallow cell with the spine arriving in the
   * middle of it, so standing in the mouth of it you are looking at a corridor
   * that goes both ways and ends out of sight in both directions. The branch
   * that carries on does it by having a hole in the far wall at one end, which
   * you cannot see from the junction and can see from six metres along it.
   *
   * The dead ends alternate sides — right, left, right — because three of them
   * on the same side is a rule, and a rule is a maze solved from the first
   * junction.
   */
  const spine = run('spine', axis - RUN.wide / 2, axis + RUN.wide / 2, mouth - 14, mouth, { open: ['maxZ'] });
  const cross1 = run('cross1', axis - 11, axis + 9, mouth - 18, mouth - 14);
  const leg1 = run('leg1', axis - 11, axis - 7, mouth - 30, mouth - 18);
  const cross2 = run('cross2', axis - 20, axis - 5, mouth - 34, mouth - 30);
  const leg2 = run('leg2', axis - 9, axis - 5, mouth - 46, mouth - 34);
  const cross3 = run('cross3', axis - 13, axis + 5, mouth - 50, mouth - 46);
  /**
   * The lobby, and its far wall is a wall with a hole in it rather than a
   * missing wall.
   *
   * It was marked `open` on that face, from when the plan was that the lift
   * was not a cell and this file should simply stop at it. `open` means *no
   * wall at all*, so the whole eight metre end of the lobby was absent: you
   * stood in it looking at a lift car with four metres of the outside of the
   * building showing either side of it, forty metres away through a hole
   * that should have been plasterwork. The lift doors are a hole in a wall,
   * and holes in walls are what `holes` is for — see below, where it is
   * punched.
   */
  const lobby = run('lobby', axis - 21, axis - 13, mouth - 54, mouth - 46);

  const cells = [fall, spine, cross1, leg1, cross2, leg2, cross3, lobby];

  /**
   * The lift doors' hole, which is the one opening in here that is not between
   * two cells. It is punched out of the lobby's far wall and the car on the
   * other side of it is somebody else's file.
   */
  const LIFT_DOOR = { wide: 2.8, high: 2.7 };
  const liftX = (lobby.x0 + lobby.x1) / 2;
  lobby.holes = {
    minZ: [
      {
        lo: liftX - LIFT_DOOR.wide / 2,
        hi: liftX + LIFT_DOOR.wide / 2,
        bottom: deck,
        top: deck + LIFT_DOOR.high,
      },
    ],
  };

  // ------------------------------------------------------- floors and lids ---

  for (const cell of cells) {
    const w = cell.x1 - cell.x0;
    const d = cell.z1 - cell.z0;
    const cx = (cell.x0 + cell.x1) / 2;
    const cz = (cell.z0 + cell.z1) / 2;

    const slab = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorOf(w, d));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(cx, cell.floor, cz);
    slab.receiveShadow = true;
    group.add(slab);

    const lid = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingOf(w, d));
    lid.rotation.x = Math.PI / 2;
    lid.position.set(cx, cell.ceil, cz);
    group.add(lid);

    /**
     * And both of them as boxes, with a `bottom` on each.
     *
     * This floor is eighty metres up over four rooms and a box with no
     * `bottom` is solid at every height below itself — without them these are
     * slabs standing in the giant hall. liftTower.js learned it the expensive
     * way and transferHall.js says so out loud; this is the third time, so it
     * is written once here for every cell.
     */
    solid(cell.x0, cell.x1, cell.z0, cell.z1, { top: cell.floor, bottom: cell.floor - 0.6 });
    solid(cell.x0, cell.x1, cell.z0, cell.z1, { bottom: cell.ceil });
  }

  // ------------------------------------------------------------- the walls ---

  /**
   * Four faces a cell, each one worked out rather than typed.
   *
   * For a face: start with the whole of it, cut out every span where another
   * cell is standing flush against it, then punch out any named hole. What
   * survives gets a panel and a box. `dir` is which way the face looks into
   * its own cell, which is what decides the panel's facing — a wall you can
   * see the back of is a wall somebody built the wrong way round.
   */
  const FACES = [
    { key: 'minX', axis: 'x', at: (c) => c.x0, lo: (c) => c.z0, hi: (c) => c.z1, facing: Math.PI / 2 },
    { key: 'maxX', axis: 'x', at: (c) => c.x1, lo: (c) => c.z0, hi: (c) => c.z1, facing: -Math.PI / 2 },
    { key: 'minZ', axis: 'z', at: (c) => c.z0, lo: (c) => c.x0, hi: (c) => c.x1, facing: 0 },
    { key: 'maxZ', axis: 'z', at: (c) => c.z1, lo: (c) => c.x0, hi: (c) => c.x1, facing: Math.PI },
  ];
  /** The face another cell would present to this one, across the same plane. */
  const OPPOSITE = { minX: 'maxX', maxX: 'minX', minZ: 'maxZ', maxZ: 'minZ' };

  for (const cell of cells) {
    for (const face of FACES) {
      if (cell.open?.includes(face.key)) continue;
      const plane = face.at(cell);
      const lo = face.lo(cell);
      const hi = face.hi(cell);

      /**
       * Every neighbour is a hole and not a cut, and the fall is why.
       *
       * The first version took a neighbour out of the face along its length,
       * full height, which is right for two corridors on the same floor and
       * catastrophic for the one pair in here that is not: the chamber is
       * eleven and a half metres tall and the corridor that leaves it does so
       * five metres up the far wall. Cut full height, the hole for that
       * corridor went all the way to the chamber floor and the heap you climb
       * had a doorway-shaped void behind it.
       *
       * So a neighbour contributes the rectangle the two of them actually
       * share — their overlap along the face and their overlap in height —
       * which for two corridors on one floor is the whole wall anyway and for
       * the chamber is the hole that is really there.
       */
      const holes = [...(cell.holes?.[face.key] ?? [])];
      for (const other of cells) {
        if (other === cell) continue;
        const theirs = FACES.find((f) => f.key === OPPOSITE[face.key]);
        if (Math.abs(theirs.at(other) - plane) > EPS) continue;
        const a = Math.max(lo, theirs.lo(other));
        const b = Math.min(hi, theirs.hi(other));
        const bottom = Math.max(cell.floor, other.floor);
        const top = Math.min(cell.ceil, other.ceil);
        if (b - a > EPS && top - bottom > EPS) holes.push({ lo: a, hi: b, bottom, top });
      }

      for (const r of punch({ lo, hi, bottom: cell.floor, top: cell.ceil }, holes)) {
        const w = r.hi - r.lo;
        const h = r.top - r.bottom;
        const mid = (r.lo + r.hi) / 2;
        const y = (r.bottom + r.top) / 2;
        if (face.axis === 'x') panel(wallOf(w, h), w, h, plane, y, mid, face.facing);
        else panel(wallOf(w, h), w, h, mid, y, plane, face.facing);
      }

      /**
       * And the boxes, which are the face and not the panels.
       *
       * Three kinds, and the third one is the one that is easy to forget. The
       * jambs are whatever is left of the face's length once every opening is
       * taken out of it. The head is the lintel over an opening, solid from
       * its top upward. The sill is the wall *under* an opening that does not
       * start at the floor — the only one in here is five metres of rock
       * face, and without it the chamber has a hole in its far wall at ankle
       * height that you can walk into and fall through.
       */
      const near = face.axis === 'x' ? (face.key === 'minX' ? -0.3 : 0.3) : face.key === 'minZ' ? -0.3 : 0.3;
      const box = (a, b, extra) => {
        if (b - a <= EPS) return;
        if (face.axis === 'x') {
          solid(Math.min(plane, plane + near), Math.max(plane, plane + near), a, b, extra);
        } else {
          solid(a, b, Math.min(plane, plane + near), Math.max(plane, plane + near), extra);
        }
      };
      for (const [a, b] of remaining(lo, hi, holes.map((h) => [h.lo, h.hi]))) {
        box(a, b, { bottom: cell.floor });
      }
      for (const hole of holes) {
        box(hole.lo, hole.hi, { bottom: hole.top });
        if (hole.bottom > cell.floor + EPS) box(hole.lo, hole.hi, { top: hole.bottom });
      }
    }
  }

  // -------------------------------------------------------------- the heap ---

  /**
   * The rock, and the steps hiding in it.
   *
   * Two separate things that have to agree. The collider is a plain box with a
   * `top` and no `bottom`, which is what a pile of rock actually is — solid
   * from its surface all the way to the floor. The stones are scenery laid
   * over it, dropped inside its own footprint so nothing sticks out into a
   * step you are about to take, and deterministic so the heap is the same heap
   * every load. See rockfall.js, which is where both the seed and the jitter
   * come from and which this is the second heap of in the building.
   */
  const random = seeded(31);
  const shapes = [];
  for (let i = 0; i < 6; i++) {
    const base =
      i % 3 === 0
        ? new THREE.DodecahedronGeometry(0.5, 0)
        : i % 3 === 1
          ? new THREE.IcosahedronGeometry(0.52, 0)
          : new THREE.IcosahedronGeometry(0.5, 1);
    shapes.push(jitter(base, random, i % 3 === 2 ? 0.26 : 0.4));
  }

  const stone = (bx, by, bz, scale) => {
    const chunk = new THREE.Mesh(shapes[Math.floor(random() * shapes.length)], rock);
    chunk.position.set(bx, by, bz);
    chunk.rotation.set(random() * 6.3, random() * 6.3, random() * 6.3);
    chunk.scale.set(
      scale * (0.82 + random() * 0.36),
      scale * (0.7 + random() * 0.4),
      scale * (0.82 + random() * 0.36)
    );
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    group.add(chunk);
  };

  /**
   * Every step is a mass and then some stones, and the order of those two
   * matters more than either of them.
   *
   * The first cut was stones only: a collider box with a `top`, and seven
   * boulders dropped round where its surface would be. In a screenshot that
   * is a handful of rocks hanging in mid-air against a wall, with an
   * invisible staircase through the middle of them — every one of them was
   * resting on nothing, because the thing they were resting on was a box with
   * no mesh. A heap needs a body before it needs detail.
   *
   * So: a rock-faced block from the chamber floor up to the step's surface,
   * which is what the collider has been claiming all along, and then stones
   * over its lip and across its top to take the straight edges off it. The
   * blocks overlap each other and most of each one is buried inside the one
   * in front; that is eight draw calls for a heap that reads, which is the
   * cheapest version of this that is not a lie.
   */
  const steps = [];
  for (let i = 0; i < CLIMB.steps; i++) {
    const top = low + CLIMB.rise * (i + 1);
    const sx = axis + (i % 2 ? CLIMB.aside : -CLIMB.aside);
    const sz = head - 4.5 - i * CLIMB.along;
    steps.push({ top, x: sx, z: sz });
    solid(sx - CLIMB.wide / 2, sx + CLIMB.wide / 2, sz - CLIMB.deep / 2, sz + CLIMB.deep / 2, {
      top,
    });

    const block = new THREE.Mesh(
      new THREE.BoxGeometry(CLIMB.wide * 0.98, top - low, CLIMB.deep * 0.98),
      rock
    );
    block.position.set(sx, (low + top) / 2, sz);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);

    /**
     * A painted nose on the lip of every step.
     *
     * The heap is rock in a chamber lit by two lamps, and a rock edge at two
     * thirds of a metre is a thing you walk into rather than up. The paint is
     * this building's one language for an edge you step on — see the hazard
     * lip on the shutter — and it is the only thing in the chamber that tells
     * you the heap is a staircase before you are standing on it.
     */
    const nose = new THREE.Mesh(new THREE.PlaneGeometry(CLIMB.wide * 0.8, 0.16), hazard);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(sx, top + 0.01, sz + CLIMB.deep / 2 - 0.22);
    group.add(nose);

    // Stones over the lip and along the sides, so the block has rock on every
    // edge a camera can get to. None on the middle of the tread: that is the
    // bit you walk on, and a boulder standing on a step is a step you trip on.
    for (let st = 0; st < 9; st++) {
      const edge = st % 3;
      const ox = edge === 0 ? (random() - 0.5) * CLIMB.wide : (st % 2 ? 1 : -1) * CLIMB.wide * 0.5;
      const oz = edge === 0 ? CLIMB.deep * 0.52 : (random() - 0.5) * CLIMB.deep;
      stone(sx + ox, top - 0.25 - random() * 0.45, sz + oz, 0.55 + random() * 0.7);
    }
  }

  /** The landing at the top, which is what the last step steps onto. */
  const ledgeZ0 = mouth;
  const ledgeZ1 = steps[CLIMB.steps - 1].z - CLIMB.deep / 2 + 0.4;
  solid(axis - 5, axis + 5, ledgeZ0, ledgeZ1, { top: deck });
  const ledge = new THREE.Mesh(new THREE.PlaneGeometry(10, ledgeZ1 - ledgeZ0), floorOf(10, 4));
  ledge.rotation.x = -Math.PI / 2;
  ledge.position.set(axis, deck, (ledgeZ0 + ledgeZ1) / 2);
  ledge.receiveShadow = true;
  group.add(ledge);
  // And the five metres of rock holding it up, for the same reason the steps
  // have bodies: the collider under this landing is solid to the chamber
  // floor, so something has to be standing there.
  const buttress = new THREE.Mesh(
    new THREE.BoxGeometry(10, deck - low, ledgeZ1 - ledgeZ0),
    rock
  );
  buttress.position.set(axis, (low + deck) / 2, (ledgeZ0 + ledgeZ1) / 2);
  buttress.receiveShadow = true;
  group.add(buttress);

  /**
   * Rubble banked against the foot of it all.
   *
   * On the floor, and only on the floor. These used to be scattered up the
   * full five metres of the chamber on a random height, which put two dozen
   * boulders in the air with nothing under any of them.
   */
  for (let i = 0; i < 30; i++) {
    const side = i % 2 ? 1 : -1;
    const out = 3.6 + random() * 4.6;
    stone(
      axis + side * out,
      low + random() * 0.8,
      head - 6 - random() * 19,
      0.7 + random() * 1.1
    );
  }
  // A few resting high against the buttress, which is the one place a stone
  // can be off the floor and still be sitting on something.
  for (let i = 0; i < 8; i++) {
    stone(
      axis + (random() - 0.5) * 9,
      low + 0.4 + random() * (deck - low - 1.4),
      ledgeZ1 + 0.5 + random() * 0.7,
      0.7 + random() * 0.8
    );
  }
  // And loose rock spilled back through the breach, because rock that stops
  // dead in the plane of a wall is rock that was placed.
  for (let i = 0; i < 16; i++) {
    stone(
      axis + (random() - 0.5) * 9,
      low + random() * 0.4,
      head - 0.5 - random() * 4.0,
      0.5 + random() * 0.9
    );
  }

  // ------------------------------------------------------------ the fitting ---

  /**
   * Light, and there is almost none of it on purpose.
   *
   * Every point light in this game is paid for by every room in it: three.js
   * shades one global list, so a lamp here is a lamp on the frame cost of the
   * first hall. The building is already carrying seventy of them. So this
   * whole section — a chamber and a hundred metres of corridor — gets four,
   * and everything else is unlit emissive, which costs nothing and is this
   * building's standing answer to "it has to be findable in the dark".
   *
   * The strips are what you actually navigate by. One down the length of every
   * corridor, at the ceiling, lit — so the route reads as a lit line ahead of
   * you and the junctions read as a line that stops. They are in the dead ends
   * too. A maze whose wrong turns are unlit is not a maze.
   */
  const strips = [];
  const stripIn = (cell) => {
    const long = cell.z1 - cell.z0;
    const wide = cell.x1 - cell.x0;
    const alongZ = long >= wide;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(alongZ ? 0.12 : wide * 0.86, alongZ ? long * 0.86 : 0.12),
      new THREE.MeshBasicMaterial({ color: DEAD_STRIP.clone(), toneMapped: false })
    );
    strip.rotation.x = Math.PI / 2;
    strip.position.set((cell.x0 + cell.x1) / 2, cell.ceil - 0.04, (cell.z0 + cell.z1) / 2);
    group.add(strip);
    strips.push(strip);
  };
  for (const cell of cells) if (cell !== fall) stripIn(cell);

  /**
   * Five of them, and the numbers are the building's and not a guess.
   *
   * The first cut had one lamp in the chamber at 30, which on a room eighteen
   * by twenty-six by eleven and a half is nothing: the screenshot of the
   * climb is a black rectangle with one rock edge in it. The giant hall lights
   * a space of that order with 130 over a range of 40 and the shed's aisle
   * uses 34 across ten metres of head, so the chamber gets two at 120 and the
   * corridors — four across and three and a bit high — get 44 apiece.
   *
   * Two in the chamber rather than one because the climb turns a corner in
   * the dark otherwise: one over the breach, which is where you come in and
   * where the heap starts, and one at the top, which is the thing you are
   * climbing towards.
   *
   * [x, y, z, how bright, how far]
   */
  const lamps = [];
  for (const [x, y, z, watt, reach] of [
    [axis, low + FALL.high - 1.6, head - 6, 120, 34],
    [axis, low + FALL.high - 1.6, mouth + 7, 120, 34],
    [axis, deck + RUN.high - 0.4, mouth - 16, 44, 20],
    [axis - 9, deck + RUN.high - 0.4, mouth - 32, 44, 20],
    [liftX, deck + RUN.high - 0.4, mouth - 50, 44, 20],
  ]) {
    const lamp = new THREE.PointLight(0xc2cbb0, 0, reach, 1.5);
    lamp.position.set(x, y, z);
    lamps.push({ lamp, watt });
  }

  /**
   * And they are not in the scene unless you are near them, which is the one
   * thing in this file that is about the renderer rather than the building.
   *
   * **A point light anywhere is a point light everywhere.** three.js shades
   * every lit fragment against one global list, so a lamp at the far end of
   * the building is paid for by the first room in it. These five plus the
   * two in the lift were measured at five to eleven milliseconds a frame on
   * scenes a hundred and fifty metres away — by pulling them out of the
   * scene graph mid-run and benching again, which is the only way to ask the
   * question honestly. Hall one went 41 to 30.
   *
   * Setting `intensity` to zero does not help: the cost is in the shader's
   * loop bound, which is decided by how many lights exist, not by how bright
   * they are. The only lever is membership.
   *
   * Changing the count makes three compile a new program the first time each
   * material is drawn under it, so this has to be a thing that happens twice
   * in a playthrough rather than once a frame: the lights come in sixteen
   * metres before the breach — while you are still in the hall and cannot
   * see into the chamber — and do not go out again until twenty-six, so
   * standing on the line cannot flicker them.
   */
  let lampsIn = false;
  const houseLights = (want) => {
    if (want === lampsIn) return;
    lampsIn = want;
    for (const { lamp } of lamps) {
      if (want) group.add(lamp);
      else group.remove(lamp);
    }
  };

  // ------------------------------------------------------------------ state ---

  const inside = (x, z) =>
    cells.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
  const inCell = (cell, x, z) => x > cell.x0 && x < cell.x1 && z > cell.z0 && z < cell.z1;

  let lit = 0;
  let entered = false;
  let toldFall = false;
  let climbed = false;
  let toldSplit = false;

  return {
    group,
    colliders,

    /** Whether a point is in here, for whoever needs to know. */
    contains: (x, z) => inside(x, z),

    /** Through the breach, at the foot of the heap. */
    get entry() {
      return { position: [axis, low, head - 2.0], yaw: 0 };
    },

    /** At the top of the climb, looking down the spine. */
    get atTheTop() {
      return { position: [axis, deck, mouth + 1.2], yaw: 0 };
    },

    /** In the mouth of the first junction, which is the first real choice. */
    get atTheFirstSplit() {
      return { position: [axis, deck, cross1.z1 + 1.6], yaw: 0 };
    },

    /** In front of the lift, for whatever is built on the other side of it. */
    get liftDoor() {
      return { x: liftX, y: deck, z: lobby.z0, width: LIFT_DOOR.wide, height: LIFT_DOOR.high };
    },

    /** Standing in the lobby, facing the lift. */
    get atTheLift() {
      return { position: [liftX, deck, lobby.z0 + 3.0], yaw: 0 };
    },

    /** Every dead end, for a harness that wants to walk into all of them. */
    get deadEnds() {
      return [
        { name: 'first, on the right', x: cross1.x1 - 1.2, z: (cross1.z0 + cross1.z1) / 2 },
        { name: 'second, on the left', x: cross2.x0 + 1.2, z: (cross2.z0 + cross2.z1) / 2 },
        { name: 'third, on the right', x: cross3.x1 - 1.2, z: (cross3.z0 + cross3.z1) / 2 },
      ];
    },

    /** The whole route as points, for a harness that wants to walk it. */
    get route() {
      return [
        { name: 'the breach', x: axis, y: low, z: head - 2.0 },
        { name: 'the top of the heap', x: axis, y: deck, z: mouth + 1.4 },
        { name: 'the first split', x: axis, y: deck, z: cross1.z1 - 2.0 },
        { name: 'its left branch', x: cross1.x0 + 2.0, y: deck, z: cross1.z1 - 2.0 },
        { name: 'the second split', x: leg1.x0 + 2.0, y: deck, z: cross2.z1 - 2.0 },
        { name: 'its right branch', x: cross2.x1 - 2.0, y: deck, z: cross2.z1 - 2.0 },
        { name: 'the third split', x: leg2.x0 + 2.0, y: deck, z: cross3.z1 - 2.0 },
        { name: 'its left branch', x: cross3.x0 + 2.0, y: deck, z: cross3.z1 - 2.0 },
        { name: 'the lift', x: liftX, y: deck, z: lobby.z0 + 2.4 },
      ];
    },

    reset() {
      lit = 0;
      entered = false;
      toldFall = false;
      climbed = false;
      toldSplit = false;
      houseLights(false);
      for (const { lamp } of lamps) lamp.intensity = 0;
      for (const strip of strips) strip.material.color.copy(DEAD_STRIP);
    },

    update(delta) {
      const here = player.position;
      houseLights(here.z < head + (lampsIn ? 26 : 16));

      /**
       * The lights come up on being anywhere in here, and the line only in
       * the chamber.
       *
       * Those were one test and it was the chamber's, which is right for a
       * player walking the building and wrong for every other way of
       * arriving: a jump straight to the junctions found a hundred metres of
       * corridor with its lamps still off, because the one trigger that would
       * have turned them on was five rooms back the way you did not come.
       * Anything that can be entered has to be able to wake itself.
       */
      if (!entered && inside(here.x, here.z)) {
        entered = true;
        lit = Math.max(lit, 0.001);
      }
      if (!toldFall && inCell(fall, here.x, here.z)) {
        toldFall = true;
        showNote('The roof of this one came down years ago.', 3.4);
        setObjective('Climb the fall');
      }

      if (lit > 0 && lit < 1) lit = Math.min(1, lit + delta * 1.1);
      for (const strip of strips) strip.material.color.copy(DEAD_STRIP).lerp(LIVE_STRIP, lit);
      for (const { lamp, watt } of lamps) lamp.intensity = watt * lit;

      if (!climbed && here.y > deck - 0.4 && here.z < mouth + 2.0) {
        climbed = true;
        setObjective('Find the way on');
      }
      if (!toldSplit && inCell(cross1, here.x, here.z)) {
        toldSplit = true;
        showNote('It goes both ways. Only one of them goes anywhere.', 3.6);
      }
    },
  };
}
