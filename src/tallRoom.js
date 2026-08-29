import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  cloneSurface,
  metalRepeat,
  worldRepeat,
  UNITS_PER_TILE,
} from './textures.js';
import { createMeatCube } from './meatCube.js';
import { showNote, setObjective } from './hud.js';

/**
 * The tall room, and the holes in the walls of it.
 *
 * Fifteen by fourteen and thirty-four high, which is a room you cannot see the
 * top of — the light gives out somewhere around twelve and there is another
 * twenty-two metres of it above that which you have to take on trust.
 *
 * You do not come into it through a door. The hall's far end is simply open, the
 * whole fifteen metres of it and the whole twelve, and this room's floor and
 * side walls are that hall's carried straight on. The only thing that changes at
 * the join is that the ceiling stops: you walk out from under twelve metres of
 * slab and there is thirty-four metres of nothing over you, and there was no
 * threshold and no rectangle to see it through first.
 *
 * That is worth more here than anywhere else in the game so far. Every other
 * room in this building is entered through a hole about the size of a person,
 * which is a way of being told about a room before you are in it — the doorway
 * frames it, and a framed thing is a thing you have already begun to take in.
 * The one room whose whole content is how big it is above your head is the one
 * room that must not be framed.
 *
 * And every wall, on six courses going up, is full of rectangular openings.
 * They are 1.7 by 2.3 — bigger than a door and the wrong shape for one — set on
 * a regular pitch of 2.7, in five columns per wall, with some of them filled in.
 * Ninety-odd of them in a room with one door and one open end.
 *
 * They are not holes. Each one has a short platform sitting in it, on a pair of
 * rails that run out to the lip and stop a hand's width proud of the wall, and
 * the platforms slide. Most are pulled right back with only the front edge
 * showing; one in seven or so is standing part-way out, and two or three are
 * out far enough to be a step somebody could take. Nothing moves — there is no
 * mechanism here and nothing triggers one — but the room has to be read before
 * that is known, and what it says on being read is that this wall is a machine
 * for putting a walkway anywhere in it.
 *
 * That is the whole difference between this room and the one it was yesterday.
 * A wall full of dark rectangles is a wall full of dark rectangles: unpleasant,
 * inert, nothing to do with you. A wall full of dark rectangles with the ends of
 * rails sticking out of them, and three platforms already halfway out at twenty
 * metres, is a wall that has been used, that works, and that could do it again
 * while you are standing under it.
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

/**
 * Fourteen deep and thirty-four up. The width is not written here.
 *
 * The hall's way out is the whole end of the hall — fifteen metres of it — and
 * this room's near wall is that opening, so the width has to be the hall's or
 * the two would not line up and there would be a step in the side walls at the
 * join. It is read off the opening handed over, the same way the room's position
 * is, because a number that must equal another number should never be typed
 * twice. See the top of controlRoom.js for why every room in here is built this
 * way round.
 */
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

/**
 * The platform in each opening, and the rails it sits on.
 *
 * `inset` is how far back inside the mouth a fully retracted one parks — a
 * couple of hand's widths, so the front edge is in shadow but the top of it
 * still catches light. Flush with the wall it reads as a filled-in hole; any
 * further back and there is nothing to see at all, and the openings go back to
 * being holes.
 *
 * The rails run the depth of the recess and 0.12 past the lip. That overhang is
 * the detail doing the most work in this room: it is the one part of the
 * mechanism that is outside the wall, so it is the only part legible from
 * across the floor and from twenty metres below, and it is what makes a row of
 * dark rectangles read as sockets rather than as damage.
 */
const PLATFORM = { deep: 1.25, thick: 0.2, inset: 0.24 };
const RAIL = { wide: 0.09, high: 0.07, proud: 0.12 };
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

/**
 * How far this one's platform is standing out of its socket.
 *
 * Zero for most of them. About one in seven is out by something, and of those a
 * few go most of a metre — which is a plank of floor sticking out of a wall
 * with nothing under it, and is the reading the whole room turns on. Hashed
 * like everything else in here, so it is the same three every time and can be
 * screenshotted and walked past twice.
 */
function platformOut(wall, course, column) {
  const n = Math.sin(wall * 33.17 + course * 61.9 + column * 14.31) * 17331.71;
  const r = ((n % 1) + 1) % 1;
  if (r < 0.855) return 0;
  // 0.28 to 0.95, spread over the top sliver of the hash.
  return 0.28 + ((r - 0.855) / 0.145) * 0.67;
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

  const WIDTH = doorway.width;
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
  const railMat = new THREE.MeshStandardMaterial({
    color: '#4e534f',
    roughness: 0.42,
    metalness: 0.7,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(1.5, 1.25), '#5b605a'),
    color: '#5b605a',
    roughness: 0.6,
    metalness: 0.45,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    ...makeHazardSurface(2, 1),
    roughness: 0.75,
    metalness: 0.05,
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
        // And not where there is no wall to put one in. The near wall's opening
        // is the full width and full height of the hall now, so the bottom three
        // courses of it would be rails and platforms hanging in mid-air over the
        // hall's mouth. Skipped before the count, because these are not filled
        // openings — they do not exist.
        if (door && sill < door.h && Math.abs(column - door.u) < (door.w + HOLE.wide) / 2) return;
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

        // The rails, out to the lip and a little past it.
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(RAIL.wide, RAIL.high, HOLE.deep + RAIL.proud),
            railMat
          );
          rail.position.set(
            column + side * (HOLE.wide / 2 - 0.3),
            sill + RAIL.high / 2,
            -HOLE.deep / 2 + RAIL.proud / 2
          );
          wall.add(rail);
        }

        // And the platform on them. Steel against the concrete of the wall,
        // which is most of what says it is a separate object that moves rather
        // than a ledge cast into the opening.
        const out = platformOut(index, course, i);
        const deck = new THREE.Mesh(
          new THREE.BoxGeometry(HOLE.wide - 0.24, PLATFORM.thick, PLATFORM.deep),
          deckMat
        );
        deck.position.set(
          column,
          sill + RAIL.high + PLATFORM.thick / 2,
          -PLATFORM.inset - PLATFORM.deep / 2 + out
        );
        deck.castShadow = out > 0;
        wall.add(deck);

        // A hazard line on the leading edge of the ones that are out. Only on
        // those: on all ninety it is a wall of yellow dashes and the room turns
        // into a poster, and on none of them the three that matter are grey
        // slabs in a grey hole from any distance at all.
        if (out > 0) {
          const lip = new THREE.Mesh(
            new THREE.BoxGeometry(HOLE.wide - 0.24, PLATFORM.thick + 0.02, 0.1),
            stripeMat
          );
          lip.position.set(
            column,
            sill + RAIL.high + PLATFORM.thick / 2,
            -PLATFORM.inset + out - 0.04
          );
          wall.add(lip);
        }

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
  // The near wall is all header. The opening is the full width, so the returns
  // either side of it have nothing left to be and are not built; what is left is
  // the piece above the hall's ceiling, which is solid only to somebody whose
  // head is over twelve metres and is therefore solid to nobody. It is here so
  // that the wall means the same thing to the collision code as it does to the
  // eye, and so that the day something in this room can get up there, it stops.
  if (inLow > minX) solid(minX - 1, inLow, maxZ, maxZ + 1, {});
  if (inHigh < maxX) solid(inHigh, maxX + 1, maxZ, maxZ + 1, {});
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
   *
   * All three are on the side walls. There is no near wall to hang one on below
   * twelve metres any more, and that turns out to matter for the approach: the
   * hall's own last lamp is thirty-odd metres back, so what you can see through
   * the open end as you walk up to it is this room's light on this room's walls
   * — light with no visible source in it, coming from a room you cannot see the
   * shape of yet.
   */
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.7, metalness: 0.3 });
  const fittings = [];
  for (const [fx, fy, fz, watt, range, ry] of [
    [maxX - 0.5, 5.6, midZ + 3.4, 95, 26, -Math.PI / 2],
    [minX + 0.5, 5.6, midZ - 3.4, 95, 26, Math.PI / 2],
    // This one used to hang on the near wall at eleven metres. That wall is a
    // hole now for its whole bottom twelve, so it has come round onto the side
    // wall by the entrance — same height, same job of lighting the courses over
    // your head as you come in, on a wall that exists. It is also the first
    // light in the room you see, from the hall, through the opening.
    [minX + 0.5, 11.2, maxZ - 2.6, 70, 30, Math.PI / 2],
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

  // ------------------------------------------------------------------ meat ---

  /**
   * And the thing standing in it, which is now most of it.
   *
   * Dead centre, square to the walls, and touching them.
   *
   * None of that is a choice any more. It is 14.6 metres in a room fifteen by
   * fourteen — deliberately over the room's depth — so anywhere but the middle
   * puts it through a wall and any angle at all puts its corners through two:
   * its diagonal is 20.6 and the room is 15. `fit` is the room's own inside
   * handed to it as half-extents, and the cube's surface is clamped to that,
   * which is what lets a cube touch four walls of a room that is not square.
   * Front and back are pressed flat against the concrete for their whole area;
   * the sides reach it where the meat swells.
   *
   * There is no aisle. The room is sealed — the far wall it is pressed against
   * is the one with the way on in it, and its front face stands in the plane of
   * the opening. You walk the length of the hall and what is at the end of it is
   * not a room you can enter.
   *
   * It stands over the floor grating, which is where whatever runs down these
   * walls was always going.
   */
  const meat = createMeatCube({
    parent: group,
    colliders,
    x: midX,
    z: midZ,
    yaw: 0,
    // A hair inside the wall planes, so it presses on them without the two
    // surfaces fighting over the same pixels.
    fit: { x: WIDTH / 2 - 0.02, z: DEPTH / 2 - 0.02 },
    // The head of the way in, so the front mouth can line its top lip up with
    // it. The cube is only ever seen through this hole, so the hole is what its
    // face should be composed against.
    entrance: doorway.height,
    player,
  });

  /** Inside the room at all — the passage in does not count. */
  const contains = (x, z) => x > minX && x < maxX && z > minZ && z < maxZ;

  return {
    group,
    colliders,
    contains,
    /** How many openings ended up open, for the harness. */
    holes: holeCount,
    meat,

    /**
     * Outside it, in the hall, looking at the opening.
     *
     * There is nowhere in this room to stand any more — the cube is against all
     * four walls and its collider is the room's inside. So the debug jump puts
     * you where you would actually be: three metres back down the hall, with the
     * thing filling the way in. `contains` is false here, which is correct and
     * is the point.
     */
    get entry() {
      return { position: [doorway.x, 0, maxZ + 3.0], yaw: 0 };
    },

    /** The far end of the passage out, for whatever gets built on it. */
    get wayOn() {
      return { x: OUT.x, y: 0, z: outEnd, width: OUT.width, height: OUT.height };
    },

    reset() {
      entered = false;
      meat.reset();
    },

    update(delta) {
      const t = performance.now() / 1000;
      for (const [i, fitting] of fittings.entries()) {
        const want = 0.9 + 0.1 * Math.sin(t * 0.41 + i * 2.4) * Math.sin(t * 0.17 + i);
        fitting.level += (want - fitting.level) * Math.min(1, delta * 2);
        fitting.lamp.intensity = fitting.watt * fitting.level;
        fitting.lens.material.color.setScalar(0.5 + 0.4 * fitting.level);
      }

      meat.update(delta);

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        setObjective('Find the way on');
        showNote('They go up further than the light does.', 3.8);
      }
    },
  };
}
