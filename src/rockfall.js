import * as THREE from 'three';
import { makeRockSurface } from './textures.js';
import { createFallenEmployeeDoor } from './employeeDoor.js';
import { FRIEND_HEIGHT } from './friend.js';

/**
 * A staff door that came down, and the rock that came down with it.
 *
 * There is a hole in the heap and it is the size of the bucket. That is the
 * whole of the thing: a way on that you can see through, cannot use, and are
 * standing next to holding the only body in the game that fits.
 *
 * The mechanism for it already existed and this is the second use of it. A
 * collider carrying `passHeight` is ignored by anything shorter than that
 * number and solid to everything else — see player.js and friend.js, which both
 * check it and have to agree about what it means. The first one is the broken
 * window in the medical room, which is what makes that room reachable by the
 * bucket and by nothing else. This is the same sentence said with rock.
 *
 * Why a staff door again, and a fallen one. Five of them in this building have
 * never opened and one of them opened once, and every one is a place the game
 * has told you is not for you. Putting the way past a collapse behind another
 * one says the collapse is not the point — the door was shut to you before the
 * ceiling came down on it, and the rock has only made honest what the lock was
 * already doing.
 */

/**
 * The hole.
 *
 * `head` is the number that matters and it is a range, not a value: over 0.82
 * or the bucket does not fit either, under 1.80 or the player walks through it
 * and there is no puzzle. 1.05 sits in the middle of that with room on both
 * sides, so neither body is anywhere near the edge of the rule and neither
 * needs a jump, a crouch or a run-up to settle it.
 */
const GAP = { head: 1.05, width: 1.15 };

/**
 * The hole in the wall this fills, and how deep the space behind it is.
 *
 * Wider than the door that is in it. A staff door's opening is 1.2 across and a
 * heap of rock in something that size is not a heap, it is a doorway with three
 * stones in it — and the story is the wrong way round as well. The wall did not
 * fall down inside the door frame. It came down beside it, took the leaf off its
 * hinges on the way, and left the frame standing in the middle of the breach
 * with nothing either side of it, which is the one arrangement that says the
 * door was here first.
 */
export const BREACH = { width: 3.4, height: 2.7 };

/** How far the frame sits off the middle of the breach. */
const FRAME_ASIDE = 1.0;

/** How deep the space behind the wall is, before it is capped. */
const DEPTH = 3.4;

const ROCK_TINT = '#4a4b44';

/** Deterministic, because a heap of rock that is different every load cannot be
 * screenshotted, walked twice, or argued about. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pushes a polyhedron's shared vertices about so a repeated shape reads new. */
function jitter(geometry, random, amount) {
  const position = geometry.attributes.position;
  const moved = new Map();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    let offset = moved.get(key);
    if (!offset) {
      const push = 1 + (random() - 0.5) * amount * 2;
      offset = [x * push - x, y * push - y, z * push - z];
      moved.set(key, offset);
    }
    position.setXYZ(i, x + offset[0], y + offset[1], z + offset[2]);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The collapse, hung off the opening the wall gives it.
 *
 * `side` is which way the room is, along x: +1 for a wall the room stands at
 * +x of, -1 for the opposite one. It is the one thing here that is not written
 * for a single wall, and it exists because this moved from one long wall of the
 * hall to the other and every offset in the file is measured out from the wall
 * into the room. Everything else — the heap, the lane, the stub — is stated
 * once and multiplied through by it.
 */
export function createRockfall({ scene, parent = scene, colliders, x, z, side = 1, seed = 7 }) {
  const group = new THREE.Group();
  parent.add(group);

  /** Out from the wall into the room, whichever way that is. */
  const out = (d) => x + side * d;
  /** A collider's x range, given as two ends in either order. */
  const spanX = (a, b) => ({ minX: Math.min(a, b), maxX: Math.max(a, b) });

  const random = seeded(seed);

  const rockMaterial = new THREE.MeshStandardMaterial({
    ...makeRockSurface(2, 2),
    color: ROCK_TINT,
    metalness: 0.02,
    roughness: 0.95,
  });

  const low = z - BREACH.width / 2;
  const high = z + BREACH.width / 2;
  const back = out(-DEPTH);
  // The gap is not in the middle. It is beside the frame, on the side the wall
  // came down — a hole dead centre under a doorway reads as designed.
  const gapZ = z - FRAME_ASIDE * 0.45;

  // The frame, and the leaf on the floor in front of it. Slewed round and
  // pushed out into the hall, so the sign on it is readable from standing —
  // which is the only reason a fallen door is face-up rather than face-down.
  createFallenEmployeeDoor({
    scene: group,
    x,
    z: z + FRAME_ASIDE,
    facing: (side * Math.PI) / 2,
    slew: -0.42,
    // Well out into the hall, clear of the heap's toe. The frame behind it is
    // going to be buried — the rock is filling the hole the frame is in — so
    // the leaf lying in the open is the only part of this that still says
    // EMPLOYEES ONLY, and it has to be somewhere you can stand and read it.
    out: 2.0,
    aside: 0,
  });

  // ------------------------------------------------------------- the space ---

  /**
   * What is behind it: a lined stub, capped, and dark.
   *
   * It has to be somewhere and not a black plane, because the one body that can
   * get through is a body you see out of. Squeezing the bucket into a hole and
   * arriving in a texture would undo the hole. So it is three and a half metres
   * of lined passage with a cap on the end and one very dim lamp in it, and
   * `wayOn` is handed out for whatever gets built past it.
   */
  {
    const liner = new THREE.MeshStandardMaterial({ color: '#33352f', roughness: 0.94 });
    const mid = out(-DEPTH / 2);
    const head = BREACH.height;
    // A PlaneGeometry lies in xy facing +z, so each of these is built with its
    // own extents the right way round and then turned once. Written out rather
    // than picked apart from a table: the two cheeks and the two decks want
    // different geometry as well as different turns, and a table that carries
    // both ends up being read with a conditional in every column.
    for (const [w, h, px, py, pz, rx, ry] of [
      // cheeks, facing across the passage
      [DEPTH, head, mid, head / 2, low, 0, 0],
      [DEPTH, head, mid, head / 2, high, 0, Math.PI],
      // soffit facing down, deck facing up
      [DEPTH, BREACH.width, mid, head, z, Math.PI / 2, 0],
      [DEPTH, BREACH.width, mid, 0.004, z, -Math.PI / 2, 0],
    ]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), liner);
      panel.position.set(px, py, pz);
      panel.rotation.set(rx, ry, 0);
      panel.receiveShadow = true;
      group.add(panel);
    }
    // The cap. Whatever gets built here takes it out, the way the giant hall
    // took the control room's out — see giantHall.js for why leaving one in
    // puts two surfaces in the same place.
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(BREACH.width, BREACH.height),
      new THREE.MeshStandardMaterial({ color: '#1c1e1a', roughness: 1 })
    );
    cap.position.set(back, BREACH.height / 2, z);
    cap.rotation.y = (side * Math.PI) / 2;
    group.add(cap);

    // Barely lit. Enough that the bucket's view is a place and not a black
    // frame, and not one lumen more — being sent somewhere you cannot see into
    // is the whole of what this hole is for.
    // Near enough the mouth that a little of it comes back out through the gap,
    // which is what makes the gap findable at all — the heap is unlit rock on a
    // wall between two lamps, and a dark hole in a dark heap is nothing. Light
    // coming *through* it is the only signal here.
    const lamp = new THREE.PointLight(0xb9c2bd, 16, 9, 1.6);
    lamp.position.set(out(-DEPTH * 0.45), BREACH.height - 0.5, gapZ);
    group.add(lamp);
  }

  // ------------------------------------------------------------- the rock ---

  /**
   * The heap, built from the gap outward.
   *
   * The hole is not carved out of a pile — a pile with a hole cut in it reads
   * as a pile with a mistake in it. The boulders are placed around a keep-out
   * volume the size of the gap, so the hole is the shape the rock came to rest
   * around, and every stone near it is one you can see is resting on the one
   * under it.
   */
  /**
   * The lane the bucket walks, as a volume nothing is allowed into.
   *
   * It runs from well out in the hall to the back of the stub, so the hole is
   * clear all the way through rather than clear at the mouth and blocked a
   * stone deep — which is the version you only find out about after you have
   * squeezed a bucket into it.
   */
  const clearOfGap = (bx, by, bz, r) => {
    const along = (bx - x) * side; // how far out from the wall, signed the same
    return !(
      along > -DEPTH - r &&
      along < 1.6 + r &&
      by - r * 0.9 < GAP.head &&
      Math.abs(bz - gapZ) < GAP.width / 2 + r * 0.8
    );
  };

  /**
   * And the leaf on the floor, which nothing is allowed to land on.
   *
   * A fallen staff door under a boulder is a boulder. The whole reason this
   * door is face-up and slewed round is that the sign on it can be read from
   * standing, and one stone on top of it throws that away.
   */
  const clearOfDoor = (bx, bz, r) =>
    !(Math.abs(bx - out(2.0)) < 1.5 + r && Math.abs(bz - (z + FRAME_ASIDE)) < 1.1 + r);

  const shapes = [];
  for (let i = 0; i < 7; i++) {
    const base =
      i % 3 === 0
        ? new THREE.DodecahedronGeometry(0.5, 0)
        : i % 3 === 1
          ? new THREE.IcosahedronGeometry(0.52, 0)
          : new THREE.IcosahedronGeometry(0.5, 1);
    shapes.push(jitter(base, random, i % 3 === 2 ? 0.26 : 0.4));
  }

  const drop = (bx, by, bz, scale) => {
    const r = scale * 0.55;
    if (!clearOfGap(bx, by, bz, r)) return false;
    if (!clearOfDoor(bx, bz, r)) return false;
    const chunk = new THREE.Mesh(shapes[Math.floor(random() * shapes.length)], rockMaterial);
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
    return true;
  };

  /**
   * Three passes, and the order is the point.
   *
   * The first plugs the breach — the whole cross-section of it, above the gap,
   * packed. That is the pass that has to work: the first attempt scattered
   * stones with a low bias and left the top two thirds of the hole open, so you
   * stood in the hall looking through a doorway at a lit passage with some rocks
   * round the edges, and the gap meant nothing because everything was a gap.
   *
   * The second spills it into the hall, because rock that stops dead in the
   * plane of the wall is rock that was placed. The third is the few big ones
   * that shape the hole itself.
   */
  let plugged = 0;
  for (let i = 0; i < 400 && plugged < 110; i++) {
    const bz = z + (random() - 0.5) * (BREACH.width + 0.4);
    const by = 0.15 + random() * (BREACH.height + 0.25);
    const bx = out((random() - 0.5) * 1.5);
    if (drop(bx, by, bz, 0.34 + random() * 0.62)) plugged++;
  }

  let spilled = 0;
  for (let i = 0; i < 260 && spilled < 70; i++) {
    // Thickest at the wall and dying away into the hall, and lower the further
    // out it gets: a heap has a toe.
    const reach = random() * random() * 3.4;
    const bz = z + (random() - 0.5) * (BREACH.width + reach * 1.5);
    const lift = Math.max(0, 1 - reach / 3.4);
    const by = 0.1 + random() * random() * (BREACH.height * 0.75) * lift;
    if (drop(out(0.35 + reach), by, bz, 0.3 + random() * 0.7)) spilled++;
  }

  // The stones that decide the shape of the hole, placed rather than scattered:
  // a jamb either side and one bridging the top, which is what makes it a hole
  // and not a notch in the top of a pile.
  for (const [d, by, bz, sc] of [
    [0.3, 0.62, gapZ - GAP.width / 2 - 0.72, 1.7],
    [0.15, 0.55, gapZ + GAP.width / 2 + 0.68, 1.5],
    [1.1, 0.42, gapZ - GAP.width / 2 - 1.3, 1.15],
    [1.0, 0.4, gapZ + GAP.width / 2 + 1.25, 1.05],
    [0.05, GAP.head + 0.62, gapZ, 1.5],
    [0.85, GAP.head + 0.5, gapZ - 0.15, 1.1],
  ]) {
    const bx = out(d);
    const chunk = new THREE.Mesh(shapes[Math.floor(random() * shapes.length)], rockMaterial);
    chunk.position.set(bx, by, bz);
    chunk.rotation.set(random() * 6.3, random() * 6.3, random() * 6.3);
    chunk.scale.set(
      sc * (0.9 + random() * 0.3),
      sc * (0.72 + random() * 0.3),
      sc * (0.9 + random() * 0.3)
    );
    chunk.castShadow = true;
    chunk.receiveShadow = true;
    group.add(chunk);
  }

  // -------------------------------------------------------- what it means ---

  /**
   * Two boxes and the rule lives in one number.
   *
   * The opening carries `passHeight`, so the bucket walks through it and the
   * player is stopped by it. The heap in front of it is solid at any height,
   * with a lane left through the middle at the same width as the hole — without
   * that the rule would be right and the bucket would still be standing outside
   * a pile of stones it cannot get round.
   */
  colliders.push({
    ...spanX(x - 0.05, x + 0.05),
    minZ: gapZ - GAP.width / 2,
    maxZ: gapZ + GAP.width / 2,
    passHeight: GAP.head,
  });
  // The rest of the breach is plain wall as far as anything walking is
  // concerned — the rock is in it, but the rock is scenery and this is the line
  // it holds.
  colliders.push({ ...spanX(x - 0.05, x + 0.05), minZ: low - 0.2, maxZ: gapZ - GAP.width / 2 });
  colliders.push({ ...spanX(x - 0.05, x + 0.05), minZ: gapZ + GAP.width / 2, maxZ: high + 0.2 });
  // And the heap standing in front of it, either side of the lane. Without
  // these the rule is right and the bucket is still stood outside a pile of
  // stones it cannot walk round.
  for (const [minZ, maxZ] of [
    [low - 2.6, gapZ - GAP.width / 2],
    [gapZ + GAP.width / 2, high + 2.6],
  ]) {
    colliders.push({ ...spanX(x, out(1.7)), minZ, maxZ });
  }
  // The stub's own cheeks and its far end, so the one body that gets in cannot
  // walk out through the side of it.
  colliders.push({ ...spanX(back, x), minZ: low - 0.6, maxZ: low });
  colliders.push({ ...spanX(back, x), minZ: high, maxZ: high + 0.6 });
  colliders.push({ ...spanX(back, out(-DEPTH - 0.6)), minZ: low - 0.6, maxZ: high + 0.6 });

  return {
    group,
    /** The gap, and who fits through it. For the harness and for the record. */
    gap: { head: GAP.head, width: GAP.width, fits: FRIEND_HEIGHT <= GAP.head },
    /** The far end of the stub, for whatever gets built on it. */
    get wayOn() {
      return { x: back, y: 0, z: gapZ, width: GAP.width, height: GAP.head };
    },
  };
}
