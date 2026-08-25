import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  cloneSurface,
  worldRepeat,
} from './textures.js';
import { setObjective, showNote } from './hud.js';
import { DOOR_YELLOW } from './config.js';
import { createFallenEmployeeDoor, EMPLOYEE_OPENING } from './employeeDoor.js';

/**
 * The hall behind the orange door, and what is in it.
 *
 * Everything up to here has been a room built to test you: a ward with a window
 * you had to get the bucket through, a hall with a spike wall, a television that
 * talked at you, a swing set with a button over each arc. Every one of them was
 * somebody's idea of an experiment, and every one of them had a way out that
 * worked once you had done what it wanted.
 *
 * This is the first place in the building that is not an experiment. It is a
 * corridor with a door at the end of it, and the people who were here before you
 * are still in it — a few of them along its length, where they fell, and the
 * rest of them heaped against the door itself. They all had the same idea you
 * have. The door does not open, and the pile is the reason you know how long it
 * has not been opening for.
 *
 * Which is the whole point of the room and the reason nothing in it is
 * interactive. There is no puzzle here, nothing to press, nothing that answers.
 * The bodies are scenery and the door stays shut. What the hall is for is the
 * moment you walk to the end of it, see what is stacked there, and understand
 * that the way you have been going is the way they were all going.
 */

const LENGTH = 17;
const HALF = 1.45;
const HEIGHT = 2.9;

const WALL_TINT = '#5c6058';
const FLOOR_TINT = '#4a4c46';
const TRIM = '#33372f';

/** The door at the end. Shut, and staying shut. */
const DOOR = { width: 1.8, height: 2.5 };

/**
 * And the staff door in the side wall, which is not shut, because it is not
 * there any more.
 *
 * `side` is the wall it is in: -1 is the one on your right walking down.
 * `thickness` is that wall, and it is load bearing in two senses now: there is
 * a room on the other side of it, so it is what you walk through rather than
 * a plane with a slab of collision behind it. Deep enough that nobody crosses
 * it in one frame at a run, shallow enough to read as a doorway and not a
 * tunnel.
 *
 * A quarter of the way along, which is not where it started. It was three
 * quarters down, a couple of strides short of the heap, on the reasoning that
 * the last thing you pass before the reveal should be the worst one — and there
 * is no room down there to lay a door. A leaf is 2.1m long and there are 2m of
 * floor between that doorway and the pile; the only way it fits is flung across
 * the corridor, which points the plate at the wall it came out of and hands the
 * player the one sentence in this room upside down. Up here it has four clear
 * metres of wall to lie along, and lands early enough to be the thing that
 * starts the hall rather than the thing that competes with the end of it.
 */
const STAFF = { side: -1, along: 0.28, thickness: 0.45 };

/**
 * The bodies. Grey, dressed in what the ward puts people in, and deliberately
 * not detailed: at this distance and this light a body reads as a shape and a
 * posture, and everything past that is either invisible or in poor taste.
 */
// Authored much darker than the values these started at. A grey that looks
// right in a swatch is a grey that glows in here: the first pass came out as
// pale plastic limbs floating in a black corridor, brighter than the walls
// behind them, which reads as a heap of mannequins rather than as people.
const GOWN = '#3f443d';
const SKIN = '#544c40';
const HAIR = '#1e1c19';

/**
 * Where they lie along the hall, as a fraction of its length, and which side.
 * Written down rather than randomised: the hall reads left to right as you walk
 * it, and the order these come in is the story it tells — one who nearly made
 * it back to the door you came in by, two who did not get far, then nothing for
 * a stretch, then the heap.
 */
const FALLEN = [
  { along: 0.13, across: -0.75, yaw: 1.9, sprawl: 0.8 },
  { along: 0.21, across: 0.82, yaw: -1.2, sprawl: 0.3 },
  { along: 0.34, across: 0.66, yaw: 2.7, sprawl: 0.6 },
  { along: 0.46, across: -0.88, yaw: 0.6, sprawl: 0.2 },
  { along: 0.58, across: -0.45, yaw: -2.4, sprawl: 0.9 },
  { along: 0.67, across: 0.9, yaw: 1.4, sprawl: 0.5 },
];

/**
 * And the heap against the door: how far up, how far out from the leaf, and how
 * far off the middle each one is. Built as a wedge — widest and highest against
 * the door, tailing off into the hall — because that is the shape a pile makes
 * when everything in it was trying to get through the same gap.
 */
const HEAP = [
  { out: 0.0, up: 0.12, across: -0.52, yaw: 0.3, roll: 0.1 },
  { out: 0.06, up: 0.12, across: 0.56, yaw: -0.5, roll: -0.2 },
  { out: 0.34, up: 0.1, across: 0.04, yaw: 1.6, roll: 0.4 },
  { out: 0.16, up: 0.44, across: -0.32, yaw: -1.1, roll: 0.9 },
  { out: 0.24, up: 0.48, across: 0.44, yaw: 2.2, roll: -0.7 },
  { out: 0.62, up: 0.16, across: -0.64, yaw: 0.9, roll: 0.2 },
  { out: 0.7, up: 0.14, across: 0.52, yaw: -2.6, roll: -0.1 },
  { out: 0.3, up: 0.82, across: 0.02, yaw: 0.2, roll: 1.4 },
  { out: 1.0, up: 0.12, across: -0.22, yaw: 1.1, roll: 0.3 },
  { out: 0.56, up: 0.76, across: -0.5, yaw: -0.4, roll: -1.2 },
  { out: 0.66, up: 0.5, across: 0.18, yaw: 2.8, roll: 0.6 },
  { out: 1.2, up: 0.4, across: 0.36, yaw: -1.8, roll: -0.5 },
  { out: 1.34, up: 0.1, across: 0.62, yaw: 0.5, roll: 0.2 },
];
/**
 * How far the nearest of them lies off the door.
 *
 * Not zero, and this is the number that took looking at it to get right. These
 * were all reaching for the same handle, so they lie head-first at it — and a
 * body is two thirds of a metre from its hips to the top of its head, so laid
 * against the leaf they went through it. Far enough back that a head can touch
 * the door without being inside it.
 */
const HEAP_OFF = 0.72;

/**
 * One body, lying down.
 *
 * Built along +z with its origin at the hips, so placing one is a position and
 * a turn. `sprawl` is how badly it fell: at 0 the limbs are more or less
 * together, at 1 they are thrown out. Nothing here is jointed or animated —
 * these have been here a long time.
 */
function buildBody(materials, sprawl = 0.5, faceUp = false) {
  const body = new THREE.Group();
  const { gown, skin, hair } = materials;
  const side = faceUp ? 1 : -1;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 3, 8), gown);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 0.17, 0.22);
  torso.castShadow = true;
  body.add(torso);

  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.12, 3, 8), gown);
  hips.rotation.x = Math.PI / 2;
  hips.position.set(0, 0.15, -0.06);
  hips.castShadow = true;
  body.add(hips);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), skin);
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, 0.16, 0.52);
  body.add(neck);

  // The head turned to one side, which is what a head does when the rest of it
  // is on the floor.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), skin);
  head.position.set(0.03 * side, 0.13, 0.64);
  head.castShadow = true;
  body.add(head);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hair);
  crown.position.set(0.05 * side, 0.16, 0.66);
  crown.scale.set(1, 0.8, 1);
  body.add(crown);

  for (const hand of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(hand * 0.19, 0.15, 0.36);
    // Out to the side by the sprawl, and always a little forward: nobody lands
    // with their arms at their sides.
    arm.rotation.y = hand * (0.5 + sprawl * 0.9);
    body.add(arm);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 3, 6), gown);
    upper.rotation.x = Math.PI / 2;
    upper.position.z = 0.16;
    upper.castShadow = true;
    arm.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 3, 6), skin);
    fore.rotation.x = Math.PI / 2;
    fore.rotation.y = -hand * (0.3 + sprawl * 0.6);
    fore.position.set(hand * 0.06, 0, 0.42);
    fore.castShadow = true;
    arm.add(fore);
  }

  for (const foot of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(foot * 0.1, 0.14, -0.12);
    leg.rotation.y = foot * sprawl * 0.5;
    body.add(leg);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 3, 6), gown);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.z = -0.2;
    thigh.castShadow = true;
    leg.add(thigh);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 6), skin);
    shin.rotation.x = Math.PI / 2;
    shin.rotation.y = -foot * sprawl * 0.4;
    shin.position.set(foot * 0.04, -0.01, -0.5);
    shin.castShadow = true;
    leg.add(shin);
  }

  return body;
}

export function createCorpseHall({ scene, passage, player }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  const near = passage.z;
  const far = near + LENGTH;
  const axis = passage.x;
  const midZ = (near + far) / 2;

  let entered = false;
  let seenTheHeap = false;

  const wallSurface = makeWallSurface(...worldRepeat(LENGTH, HEIGHT), WALL_TINT);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, LENGTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(HALF * 2, LENGTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(axis, 0, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, LENGTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(HALF * 2, LENGTH)),
      color: '#3f423c',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(axis, HEIGHT, midZ);
  group.add(ceiling);

  const staffZ = near + LENGTH * STAFF.along;
  const staffLow = staffZ - EMPLOYEE_OPENING.width / 2;
  const staffHigh = staffZ + EMPLOYEE_OPENING.width / 2;

  for (const side of [-1, 1]) {
    // The side with the staff door in it is built in three pieces round the
    // hole, the same as every wall in this game with a way through it. The
    // other is one plane.
    const pieces = side !== STAFF.side
      ? [[LENGTH, HEIGHT, midZ, HEIGHT / 2]]
      : [
          [staffLow - near, HEIGHT, (near + staffLow) / 2, HEIGHT / 2],
          [far - staffHigh, HEIGHT, (staffHigh + far) / 2, HEIGHT / 2],
          [
            EMPLOYEE_OPENING.width,
            HEIGHT - EMPLOYEE_OPENING.height,
            staffZ,
            (HEIGHT + EMPLOYEE_OPENING.height) / 2,
          ],
        ];
    for (const [pw, ph, pz, py] of pieces) {
      if (pw <= 0 || ph <= 0) continue;
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        // Cloned per piece rather than shared, so the boards on the three
        // pieces either side of the opening stay the size they are on the wall
        // opposite. A surface built for a 17m wall put on a 5m one is a wall
        // whose formwork is a third the size of the formwork facing it.
        new THREE.MeshStandardMaterial({
          ...cloneSurface(wallSurface, ...worldRepeat(pw, ph)),
          color: WALL_TINT,
        })
      );
      wall.position.set(axis + side * HALF, py, pz);
      wall.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      wall.receiveShadow = true;
      group.add(wall);
    }
    // And the collider for it. The staff side is the wall between here and the
    // room behind it, so it is that wall's thickness and no more — a metre of
    // slab the way the other side is built would stand three quarters of a
    // metre inside that room and you could not walk along its wall. It comes in
    // two pieces with the doorway between them, because the door is off and the
    // way through is open.
    const thick = side === STAFF.side ? STAFF.thickness : 1;
    const inner = axis + side * HALF;
    const outer = axis + side * (HALF + thick);
    const spans =
      side === STAFF.side
        ? [[near - 1, staffLow], [staffHigh, far + 1]]
        : [[near - 1, far + 1]];
    for (const [fromZ, toZ] of spans) {
      solid(Math.min(inner, outer), Math.max(inner, outer), fromZ, toZ, {});
    }
  }

  // The near wall, round the way in. Three pieces, like every wall in this game
  // with a hole in it.
  const inLow = axis - passage.width / 2;
  const inHigh = axis + passage.width / 2;
  for (const [pw, ph, px, py] of [
    [inLow - (axis - HALF), HEIGHT, (axis - HALF + inLow) / 2, HEIGHT / 2],
    [axis + HALF - inHigh, HEIGHT, (inHigh + axis + HALF) / 2, HEIGHT / 2],
    [passage.width, HEIGHT - passage.height, axis, (HEIGHT + passage.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    mesh.position.set(px, py, near);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  solid(axis - HALF - 1, inLow, near - 1, near, {});
  solid(inHigh, axis + HALF + 1, near - 1, near, {});

  // ------------------------------------------------------------------ light ---

  // Four, down the middle, and the far one is failing. Built once and left in
  // the scene like every other light in this project — the number of them is
  // compiled into every material that can be lit, so they are never added or
  // removed, only turned up and down.
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.3 });
  const fittings = [];
  for (let i = 0; i < 4; i++) {
    const z = near + LENGTH * (0.14 + i * 0.24);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), trimMat);
    housing.position.set(axis, HEIGHT - 0.03, z);
    group.add(housing);

    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.05, 0.1),
      new THREE.MeshBasicMaterial({ color: '#cfd6c8', toneMapped: false })
    );
    tube.position.set(axis, HEIGHT - 0.08, z);
    group.add(tube);

    const lamp = new THREE.PointLight(0xd8e2d0, 13, 13, 2);
    lamp.position.set(axis, HEIGHT - 0.2, z);
    group.add(lamp);
    // The last one is on its way out. Everything else in here stopped working a
    // long time ago; one thing still trying to is worse than none.
    fittings.push({ lamp, tube, dying: i === 3, level: 1 });
  }

  // ------------------------------------------------------------- the fallen ---

  const materials = {
    gown: new THREE.MeshStandardMaterial({ color: GOWN, roughness: 0.92, metalness: 0 }),
    skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.86, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.95, metalness: 0 }),
  };

  // The staff door, off its hinges and on the floor.
  //
  // Facing is the yaw that turns it out of the wall it is in: the wall at -x
  // looks along +x, which is a quarter turn the other way from its side.
  //
  // The leaf is laid down the hall and a fifth of a turn out from the wall, its
  // top end reaching into the middle of the floor. Down the hall so the plate
  // faces whoever is walking toward it, out from the wall so it is a thing that
  // came off a wall rather than a thing stacked against one. It is turned so
  // far that the hinge end has to stand more than half a metre clear of the
  // frame or the near corner of it swings back inside the wall.
  createFallenEmployeeDoor({
    scene: group,
    x: axis + STAFF.side * HALF,
    z: staffZ,
    facing: -STAFF.side * Math.PI / 2,
    slew: -1.222,
    out: 0.55,
    // Away from the handle side, which on this wall is down the hall.
    aside: -0.62,
  });

  for (const { along, across, yaw, sprawl } of FALLEN) {
    const body = buildBody(materials, sprawl, sprawl > 0.55);
    body.position.set(axis + across * (HALF - 0.35), 0, near + LENGTH * along);
    body.rotation.y = yaw;
    group.add(body);
  }

  // --------------------------------------------------------- the way out ---

  // The door, in the end wall. It has no mechanism, no reader and no handle
  // worth reaching: there is nothing to work out here.
  const doorLow = axis - DOOR.width / 2;
  const doorHigh = axis + DOOR.width / 2;
  for (const [pw, ph, px, py] of [
    [doorLow - (axis - HALF), HEIGHT, (axis - HALF + doorLow) / 2, HEIGHT / 2],
    [axis + HALF - doorHigh, HEIGHT, (doorHigh + axis + HALF) / 2, HEIGHT / 2],
    [DOOR.width, HEIGHT - DOOR.height, axis, (HEIGHT + DOOR.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    mesh.position.set(px, py, far);
    mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  solid(axis - HALF - 1, axis + HALF + 1, far, far + 1, {});

  {
    const leafMat = new THREE.MeshStandardMaterial({
      color: DOOR_YELLOW.leaf,
      roughness: DOOR_YELLOW.roughness,
      metalness: DOOR_YELLOW.metalness,
    });
    const doorTrim = new THREE.MeshStandardMaterial({
      color: DOOR_YELLOW.trim,
      roughness: 0.5,
      metalness: 0.2,
    });
    const doorHazard = new THREE.MeshStandardMaterial({ color: DOOR_YELLOW.hazard, roughness: 0.7 });

    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR.width - 0.04, DOOR.height - 0.04, 0.16),
      leafMat
    );
    leaf.position.set(axis, (DOOR.height - 0.04) / 2, far - 0.09);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(DOOR.width - 0.24, 0.1, 0.03), doorTrim);
    rail.position.set(axis, 1.35, far - 0.18);
    group.add(rail);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(DOOR.width - 0.16, 0.26, 0.012), doorHazard);
    stripe.position.set(axis, 0.22, far - 0.175);
    group.add(stripe);
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, DOOR.width - 0.42, 10),
      doorTrim
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(axis, 1.05, far - 0.22);
    group.add(bar);
  }

  // And the heap against it.
  //
  // One collider, not one per body: what stops you is the pile, and a box per
  // body would be a dozen ledges to catch on and climb. It reaches most of the
  // way across the hall and you cannot get round it — which is the point, and
  // the only thing in this room that is a rule rather than a picture.
  const heap = new THREE.Group();
  group.add(heap);
  for (const { out, up, across, yaw, roll } of HEAP) {
    const body = buildBody(materials, 0.3 + Math.abs(roll) * 0.4, up > 0.3);
    body.position.set(axis + across, up, far - HEAP_OFF - out);
    body.rotation.set(roll * 0.5, yaw, roll);
    heap.add(body);
  }
  // Matched to what is actually lying there — the far side of the deepest one,
  // plus the length of it — rather than picked to feel right, so you are stopped
  // where the pile is and not a stride short of it in clear air.
  solid(axis - HALF, axis + HALF, far - 2.9, far, { top: 1.3 });

  /** Inside the hall at all. */
  const contains = (x, z) => x > axis - HALF && x < axis + HALF && z > near && z < far;

  return {
    group,
    colliders,
    contains,

    /**
     * Just inside, facing down it — where the debug menu drops you.
     *
     * Given by the hall rather than worked out by the caller, the same as the
     * red hall's entry and the ward's wake: two files agreeing about where a
     * room's doorway is has gone wrong here before.
     */
    get entry() {
      return { position: [axis, 0, near + 1.6], yaw: Math.PI };
    },

    /**
     * The hole the staff door came out of, for whoever builds what is behind
     * it. Handed over the same way the orange room hands over `wayOn`: two
     * files agreeing about where an opening is by both writing the number down
     * is how a doorway ends up in a different place from its room.
     */
    get staffDoor() {
      return {
        x: axis + STAFF.side * HALF,
        z: staffZ,
        width: EMPLOYEE_OPENING.width,
        height: EMPLOYEE_OPENING.height,
        thickness: STAFF.thickness,
      };
    },

    /**
     * Wind back what little this room remembers: which of its two lines it has
     * said. Nothing here moves or opens, so that is the whole of its state.
     */
    reset() {
      entered = false;
      seenTheHeap = false;
    },

    update(delta) {
      // The failing tube. A slow sag with an occasional stutter in it rather
      // than a strobe: a fluorescent going out flickers in bursts and is steady
      // in between, and a light that blinks on a timer reads as a machine.
      const t = performance.now() / 1000;
      for (const fitting of fittings) {
        if (!fitting.dying) continue;
        const stutter = Math.sin(t * 11.3) * Math.sin(t * 3.1) > 0.72 ? Math.random() : 1;
        fitting.level += (stutter - fitting.level) * Math.min(1, delta * 26);
        fitting.lamp.intensity = 13 * (0.25 + 0.75 * fitting.level);
        fitting.tube.material.color.setScalar(0.16 + 0.68 * fitting.level);
      }

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        setObjective('Get to the end of the hall');
        showNote('Somebody came this way before you.', 3.2);
      }
      // Said at the heap rather than on the way in, because the hall is written
      // to be walked: the ones lying along it are a growing suspicion and this
      // is what it turns into.
      if (!seenTheHeap && entered && player.position.z > far - 4.5) {
        seenTheHeap = true;
        setObjective('The yellow door is blocked');
        showNote('They were all trying to get through it.', 3.6);
      }
    },
  };
}
