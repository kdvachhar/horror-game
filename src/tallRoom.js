import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  cloneSurface,
  worldRepeat,
  UNITS_PER_TILE,
} from './textures.js';
import { showNote, setObjective } from './hud.js';

/**
 * The tall room, and the holes in the walls of it.
 *
 * Fourteen metres square and thirty-four high, which is a room you cannot see
 * the top of — the hall before it was twenty and you could just about make out
 * its ceiling; here the light gives out somewhere around twelve and there is
 * another twenty-two metres of it above that which you have to take on trust.
 *
 * And every wall, on six courses going up, is full of rectangular openings.
 * They are 1.7 by 2.3 — bigger than a door and the wrong shape for one — set on
 * a regular pitch of 2.7, in five columns per wall, with some of them filled in
 * and the rest open onto a metre and a half of unlit nothing. Ninety-odd of them
 * in a room with two doors.
 *
 * What makes it work is that they are all identical and all out of reach. The
 * lowest sill is at 3.2, which is a metre clear of the top of your jump, so
 * there is nothing to try and no way to try it: this is not a puzzle and there
 * is nothing in here to solve. The room simply has a great many openings in it
 * that are not for you, arranged by somebody, on a grid, going up further than
 * you can see. The staff doors did a smaller version of the same job — see
 * employeeDoor.js — and the argument is the same one. A building with only the
 * doors the player uses reads as a corridor with rooms bolted on.
 *
 * Deliberately not varied in size. The first pass had them in three sizes with
 * the odd double-width one, on the reasoning that a regular grid reads as
 * wallpaper; what it actually reads as is a decision. Identical openings on an
 * exact pitch are institutional, and institutional is far worse to be standing
 * under than irregular — irregular is a ruin, and a ruin is nobody's fault.
 */

/** Fourteen square and thirty-four up. */
const WIDTH = 14;
const DEPTH = 14;
const HEIGHT = 34;

/**
 * The openings.
 *
 * `SILLS` are the heights the courses start at and `COLUMNS` the offsets along
 * each wall. The lowest sill is the only number here with a rule behind it: the
 * player peaks 1.12 above the floor in a jump and steps 0.9 for free, so
 * anything at or above about 2.1 is unreachable, and 3.2 is unreachable without
 * looking like it is trying to be.
 */
const HOLE = { wide: 1.7, high: 2.3, deep: 1.5 };
const SILLS = [3.2, 7.4, 11.6, 15.8, 20.0, 24.2];
const COLUMNS = [-5.4, -2.7, 0, 2.7, 5.4];

/**
 * Which of them are open, and it has to be the same ones every time.
 *
 * A hash and not Math.random. The room is built once at load, so a random fill
 * would give a different wall on every reload — which is not a style choice,
 * it is a room that cannot be looked at twice, cannot be screenshotted, and
 * cannot be checked by walking it. Everything procedural in this project is
 * deterministic for that reason.
 *
 * About one in four filled in. Enough that the grid is plainly a grid with
 * pieces missing rather than a pattern, and not so many that the wall stops
 * reading as open.
 */
function isOpen(wall, course, column) {
  const n = Math.sin(wall * 12.9898 + course * 78.233 + column * 37.719) * 43758.5453;
  return ((n % 1) + 1) % 1 > 0.26;
}

/** And which of the open ones have run down the wall underneath them. */
function isStained(wall, course, column) {
  const n = Math.sin(wall * 4.1414 + course * 21.7 + column * 91.3) * 24634.6345;
  return ((n % 1) + 1) % 1 > 0.62;
}

// Colder again than the hall, which was the concrete it was poured as. This is
// the same concrete with nothing done to it at all.
const WALL_TINT = '#494c4b';
const FLOOR_TINT = '#3a3c3b';
const TRIM = '#2a2e2c';

/**
 * One wall, built as panels round a set of rectangular openings.
 *
 * The wall is handed a list of holes in its own frame — `u` along it, `v` up
 * from the floor — and works out the panels for itself. It bands the wall
 * horizontally at every hole's top and bottom edge, then splits each band into
 * the runs of wall between whatever holes cross it. A band with no holes in it
 * is one panel; the doorways are holes like any other, so the same code cuts
 * those too and there is no separate path for them.
 *
 * The panels share one material. Each one's UVs are rewritten to the piece of
 * the wall's texture space it actually occupies, so the poured-concrete boards
 * run straight across a join instead of restarting at every panel edge — which
 * is what a per-panel material with its own repeat would give you, and it looks
 * like the wall has been assembled out of offcuts.
 */
function buildHoledWall({ parent, material, width, height, holes }) {
  const edges = new Set([0, height]);
  for (const hole of holes) {
    edges.add(hole.v);
    edges.add(hole.v + hole.h);
  }
  const bands = [...edges].sort((a, b) => a - b);

  const panel = (u0, u1, y0, y1) => {
    const w = u1 - u0;
    const h = y1 - y0;
    if (w < 1e-4 || h < 1e-4) return;
    const geometry = new THREE.PlaneGeometry(w, h);
    // Left edge measured from the wall's own corner, so every panel on this
    // wall samples one continuous texture space.
    const left = (u0 + width / 2) / UNITS_PER_TILE;
    const bottom = y0 / UNITS_PER_TILE;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        left + uv.getX(i) * (w / UNITS_PER_TILE),
        bottom + uv.getY(i) * (h / UNITS_PER_TILE)
      );
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((u0 + u1) / 2, (y0 + y1) / 2, 0);
    mesh.receiveShadow = true;
    parent.add(mesh);
  };

  for (let i = 0; i < bands.length - 1; i++) {
    const y0 = bands[i];
    const y1 = bands[i + 1];
    // Every hole that spans the whole of this band. A hole only ever starts and
    // ends on a band edge, because the band edges were taken from the holes.
    const cuts = holes
      .filter((hole) => hole.v <= y0 + 1e-6 && hole.v + hole.h >= y1 - 1e-6)
      .map((hole) => [hole.u - hole.w / 2, hole.u + hole.w / 2])
      .sort((a, b) => a[0] - b[0]);

    let u = -width / 2;
    for (const [a, bEdge] of cuts) {
      panel(u, a, y0, y1);
      u = Math.max(u, bEdge);
    }
    panel(u, width / 2, y0, y1);
  }
}

/**
 * The room, hung off the doorway the giant hall hands over.
 *
 * The hall's way out faces -z, so this is the space at -z of it, built the same
 * way every room in this project is built: for the one wall it is behind. See
 * the top of controlRoom.js.
 */
export function createTallRoom({ scene, doorway, player }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  const maxZ = doorway.z;
  const minZ = maxZ - DEPTH;
  const minX = doorway.x - WIDTH / 2;
  const maxX = doorway.x + WIDTH / 2;
  const midX = doorway.x;
  const midZ = (minZ + maxZ) / 2;

  let entered = false;

  /**
   * The way on: another doorway, in the far wall, off to one side.
   *
   * Off to one side rather than opposite the one you come in by, so the room is
   * crossed on a diagonal and looked around rather than walked through in a
   * straight line. It is the same 2.4 by 2.8 as every other opening in this
   * stretch of the building — which is exactly the point of it against the
   * holes: two doors at a person's size, ninety-odd openings at something
   * else's, and only the doors go anywhere.
   */
  const OUT = { x: minX + 3.6, width: 2.4, height: 2.8, depth: 3.2 };
  const outEnd = minZ - OUT.depth;

  const wallSurface = makeWallSurface(...worldRepeat(WIDTH, HEIGHT), WALL_TINT);

  // ----------------------------------------------------------------- shell ---

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(WIDTH, DEPTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(WIDTH, DEPTH)),
      color: '#262826',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, HEIGHT, midZ);
  group.add(ceiling);

  // ----------------------------------------------------------------- walls ---

  /**
   * The four walls, each in its own group so that everything on it can be
   * written flat — `u` along the wall and `v` up it — and the group's turn is
   * the only place the room's orientation is dealt with. Working in world
   * coordinates on four walls facing four ways is four chances to get a sign
   * wrong, and every one of them looks like a hole in the wrong place.
   */
  const liner = new THREE.MeshStandardMaterial({
    color: '#0c0d0c',
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
  });
  const stainMat = new THREE.MeshStandardMaterial({
    color: '#25231f',
    roughness: 0.98,
    transparent: true,
    opacity: 0.75,
  });

  const holeCount = { open: 0, filled: 0 };

  // [wall index, x, z, yaw, width along it, the doorway in it if any]
  const WALLS = [
    // The one you come in by. Turned to face -z, into the room.
    [0, midX, maxZ, Math.PI, WIDTH, { u: midX - doorway.x, w: doorway.width, h: doorway.height }],
    // The far one, with the way on in it.
    [1, midX, minZ, 0, WIDTH, { u: OUT.x - midX, w: OUT.width, h: OUT.height }],
    [2, maxX, midZ, -Math.PI / 2, DEPTH, null],
    [3, minX, midZ, Math.PI / 2, DEPTH, null],
  ];

  for (const [index, wx, wz, yaw, span, door] of WALLS) {
    const wall = new THREE.Group();
    wall.position.set(wx, 0, wz);
    wall.rotation.y = yaw;
    group.add(wall);

    const material = new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, 1, 1),
      color: WALL_TINT,
    });

    const holes = [];
    if (door) holes.push({ u: door.u, v: 0, w: door.w, h: door.h });

    SILLS.forEach((sill, course) => {
      COLUMNS.forEach((column, i) => {
        // The end walls are as wide as the room is deep, which here is the same
        // number — but the columns are still clipped to the wall rather than
        // assumed to fit, because the day the room stops being square is the day
        // two of these walk off the end of it.
        if (Math.abs(column) + HOLE.wide / 2 > span / 2 - 0.5) return;
        if (!isOpen(index, course, i)) {
          holeCount.filled++;
          return;
        }
        holeCount.open++;
        holes.push({ u: column, v: sill, w: HOLE.wide, h: HOLE.high });

        // The recess behind it: a box turned inside out, so one mesh gives the
        // three sides, the soffit and the back of the hole. Unlit and nearly
        // black — what makes an opening read as a hole rather than as a dark
        // rectangle painted on a wall is that its top and sides catch a little
        // of the room's light near the mouth and nothing at all further in.
        const recess = new THREE.Mesh(
          new THREE.BoxGeometry(HOLE.wide, HOLE.high, HOLE.deep),
          liner
        );
        recess.position.set(column, sill + HOLE.high / 2, -HOLE.deep / 2 - 0.01);
        wall.add(recess);

        // And the run down the wall under some of them.
        if (!isStained(index, course, i)) return;
        const stain = new THREE.Mesh(
          new THREE.PlaneGeometry(HOLE.wide * 0.8, 1.6),
          stainMat
        );
        stain.position.set(column, sill - 0.8, 0.012);
        wall.add(stain);
      });
    });

    buildHoledWall({ parent: wall, material, width: span, height: HEIGHT, holes });

    // Lined out, so walking through a doorway is walking through the thickness
    // of a wall. The holes get no such treatment and want none: their liner is
    // the recess above, and it is deeper than any of this.
    if (door) {
      for (const [w, h, u, v, rx, ry] of [
        [0.5, door.h, door.u - door.w / 2, door.h / 2, 0, Math.PI / 2],
        [0.5, door.h, door.u + door.w / 2, door.h / 2, 0, -Math.PI / 2],
        [door.w, 0.5, door.u, door.h, Math.PI / 2, 0],
      ]) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshStandardMaterial({ color: '#3d403b', roughness: 0.93 })
        );
        panel.position.set(u, v, -0.25);
        panel.rotation.set(rx, ry, 0);
        panel.userData.notWall = true;
        wall.add(panel);
      }
    }
  }

  /**
   * And the colliders: four solid walls, split only round the two doorways.
   *
   * Not round the holes, and that is not a shortcut. The lowest sill is 3.2 and
   * the player tops out at 1.12 in a jump, so there is no height at which any of
   * them can be reached — cutting the wall for them would be ninety-odd gaps in
   * a surface nobody can get to, and every one of them a chance to wedge the
   * bucket in a wall.
   */
  const inLow = doorway.x - doorway.width / 2;
  const inHigh = doorway.x + doorway.width / 2;
  const outLow = OUT.x - OUT.width / 2;
  const outHigh = OUT.x + OUT.width / 2;
  solid(minX - 1, inLow, maxZ, maxZ + 1, {});
  solid(inHigh, maxX + 1, maxZ, maxZ + 1, {});
  solid(inLow, inHigh, maxZ, maxZ + 1, { bottom: doorway.height });
  solid(minX - 1, outLow, minZ - 1, minZ, {});
  solid(outHigh, maxX + 1, minZ - 1, minZ, {});
  solid(outLow, outHigh, minZ - 1, minZ, { bottom: OUT.height });
  solid(maxX, maxX + 1, minZ - 1, maxZ + 1, {});
  solid(minX - 1, minX, minZ - 1, maxZ + 1, {});

  // ------------------------------------------------------------- the way on ---

  /**
   * A lined passage stopping in the dark, capped, the same as every unfinished
   * end in this stretch of the building. `wayOn` hands it over for whatever
   * comes next.
   */
  {
    const passage = new THREE.MeshStandardMaterial({ color: '#32342f', roughness: 0.94 });
    const throat = minZ - OUT.depth / 2;
    for (const [w, h, px, py, rx, ry] of [
      [OUT.depth, OUT.height, outLow, OUT.height / 2, 0, Math.PI / 2],
      [OUT.depth, OUT.height, outHigh, OUT.height / 2, 0, -Math.PI / 2],
      [OUT.width, OUT.depth, OUT.x, OUT.height, Math.PI / 2, 0],
      [OUT.width, OUT.depth, OUT.x, 0.004, -Math.PI / 2, 0],
    ]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), passage);
      panel.position.set(px, py, throat);
      panel.rotation.set(rx, ry, 0);
      panel.receiveShadow = true;
      group.add(panel);
    }
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(OUT.width, OUT.height),
      new THREE.MeshStandardMaterial({ color: '#0a0b09', roughness: 1 })
    );
    cap.position.set(OUT.x, OUT.height / 2, outEnd);
    group.add(cap);

    solid(outLow - 0.6, outLow, outEnd, minZ, {});
    solid(outHigh, outHigh + 0.6, outEnd, minZ, {});
    solid(outLow - 0.6, outHigh + 0.6, outEnd - 0.6, outEnd, {});
  }

  // ----------------------------------------------------------------- light ---

  /**
   * Three lamps, all of them low, and nothing at all above twelve metres.
   *
   * That is the room. Light the whole shaft and it is a warehouse with holes in
   * it; light the bottom third and the courses you can see are unmistakable
   * black rectangles, the next one up is a suggestion, and above that there is
   * a great deal of nothing that you know from the two you can see is not empty.
   * The ceiling at thirty-four metres is never lit and never will be — it exists
   * to stop the room being a hole in the sky, not to be looked at.
   *
   * Wall brackets rather than the hall's pendants. A fitting hung on a rod from
   * a slab you cannot see is a fitting hanging from nothing.
   */
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.7, metalness: 0.3 });
  const fittings = [];
  for (const [fx, fy, fz, watt, range, ry] of [
    [maxX - 0.5, 5.6, midZ + 3.4, 95, 26, -Math.PI / 2],
    [minX + 0.5, 5.6, midZ - 3.4, 95, 26, Math.PI / 2],
    [midX + 2.6, 11.2, maxZ - 0.5, 70, 30, Math.PI],
  ]) {
    const bracket = new THREE.Group();
    bracket.position.set(fx, fy, fz);
    bracket.rotation.y = ry;
    group.add(bracket);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), trimMat);
    arm.position.z = 0.3;
    bracket.add(arm);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.42), trimMat);
    housing.position.set(0, -0.1, 0.66);
    housing.castShadow = true;
    bracket.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.06, 0.34),
      new THREE.MeshBasicMaterial({ color: '#cdd4cf', toneMapped: false })
    );
    lens.position.set(0, -0.26, 0.66);
    bracket.add(lens);

    const lamp = new THREE.PointLight(0xc6d0cd, watt, range, 1.4);
    lamp.position.set(fx + Math.sin(ry) * 0.7, fy - 0.4, fz + Math.cos(ry) * 0.7);
    group.add(lamp);
    fittings.push({ lamp, lens, watt, level: 1 });
  }

  // A lamp inside the way on, so it reads as a way on and not as a ninety-first
  // hole. It is the one opening in this room that is lit from the inside, which
  // is the whole of how you tell it from the others.
  {
    const lamp = new THREE.PointLight(0xc6d0cd, 40, 22, 1.4);
    lamp.position.set(OUT.x, 2.0, minZ - 1.1);
    group.add(lamp);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), trimMat);
    housing.position.set(OUT.x, OUT.height - 0.1, minZ - 1.1);
    group.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.22),
      new THREE.MeshBasicMaterial({ color: '#cdd4cf', toneMapped: false })
    );
    lens.position.set(OUT.x, OUT.height - 0.19, minZ - 1.1);
    group.add(lens);
  }

  // ------------------------------------------------------------------ floor ---

  // A grating in the middle of it, because a room whose floor is one flat sheet
  // of concrete has no middle. It also answers the stains: whatever runs down
  // the walls goes somewhere.
  {
    const surround = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.2), trimMat);
    surround.position.set(midX, 0.025, midZ);
    surround.receiveShadow = true;
    group.add(surround);
    const pit = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshStandardMaterial({ color: '#0c0d0b', roughness: 1 })
    );
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(midX, 0.008, midZ);
    group.add(pit);
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.06), trimMat);
      bar.position.set(midX, 0.045, midZ - 0.95 + (i + 0.5) * (1.9 / 9));
      group.add(bar);
    }
    // No collider. It stands two fingers proud of the floor, which the step
    // height swallows without noticing.
  }

  /** Inside the room at all — the passage in does not count. */
  const contains = (x, z) => x > minX && x < maxX && z > minZ && z < maxZ;

  return {
    group,
    colliders,
    contains,
    /** How many openings ended up open, for the harness. */
    holes: holeCount,

    /** Just inside the door, looking across it. */
    get entry() {
      return { position: [doorway.x, 0, maxZ - 1.5], yaw: 0 };
    },

    /** The far end of the passage out, for whatever gets built on it. */
    get wayOn() {
      return { x: OUT.x, y: 0, z: outEnd, width: OUT.width, height: OUT.height };
    },

    reset() {
      entered = false;
    },

    update(delta) {
      const t = performance.now() / 1000;
      for (const [i, fitting] of fittings.entries()) {
        const want = 0.9 + 0.1 * Math.sin(t * 0.41 + i * 2.4) * Math.sin(t * 0.17 + i);
        fitting.level += (want - fitting.level) * Math.min(1, delta * 2);
        fitting.lamp.intensity = fitting.watt * fitting.level;
        fitting.lens.material.color.setScalar(0.5 + 0.4 * fitting.level);
      }

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        setObjective('Find the way on');
        showNote('They go up further than the light does.', 3.8);
      }
    },
  };
}
