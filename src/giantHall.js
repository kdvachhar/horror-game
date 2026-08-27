import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  cloneSurface,
  worldRepeat,
  metalRepeat,
} from './textures.js';
import { createClimbTower, SUMMIT } from './climbTower.js';
import { showNote, setObjective } from './hud.js';

/**
 * The hall behind the staff door, and the tower in it.
 *
 * Everything in this game up to now has been a room somebody could stand up in
 * and touch the ceiling of. A ward with beds in it. A corridor three metres
 * across. A plant room with a desk and a dead man at it. You have been moved
 * through a building at your own size for the whole game, and the last thing
 * that happened was a thing on a television telling you to go through a door it
 * opened for you, and warning you about who is on the other side.
 *
 * This is on the other side. It is seventeen metres across, thirty-eight long
 * and twenty high, and you come into it through a doorway one metre wide.
 *
 * The scale IS the content. There is nothing in here that explains itself and
 * nothing to press: the hall is the sentence, and it says that the part of this
 * building you have been in was the small part. That is why the door you arrive
 * by is left plainly visible in the wall behind you and why the wall is
 * otherwise bare for twenty metres above it — the one readable object in a
 * flat expanse is what gives the expanse its size, and a person's door in a
 * wall this tall is the only ruler the player has.
 *
 * And why the stripe does not come in here, for the second time in two rooms.
 * The band is wayfinding painted for people being walked through a building. It
 * stopped at the staff door because they were not meant to go through it. This
 * is what is past it, and there was never any question of anyone being led
 * along this hall to anything.
 */

/**
 * The shell.
 *
 * `NEAR` is the wall the door is in and is not a choice: it is where the control
 * room's passage stops, handed over rather than written down twice. Everything
 * else runs off it.
 *
 * Thirty-eight metres long against seventeen wide, so it is a hallway and not a
 * hangar — it has a direction, and the direction is away from the door you came
 * in by. Twenty high against seventeen wide, so it is taller than it is broad,
 * which is the proportion that reads as a shaft rather than as a warehouse and
 * is the only one that makes the ceiling worth not being able to see.
 */
const WIDTH = 17;
const LENGTH = 38;
const HEIGHT = 20;

/** How the long walls are divided up, and how far the ribs stand proud. */
const BAYS = 6;
const RIB = { wide: 1.3, deep: 0.55 };
/** The two string courses, which are the only horizontal lines in here. */
const COURSES = [4.2, 9.6];

// Colder and greyer than anything behind you. The plant room was a green-grey
// because nobody decorated it; this was never decorated at all — it is the
// concrete it was poured as.
const WALL_TINT = '#4a4d4d';
const FLOOR_TINT = '#3b3d3c';
const RIB_TINT = '#414443';
const TRIM = '#2b302e';

/**
 * The hall, hung off the doorway the control room hands over.
 *
 * Built for the one wall it is behind, like every other room in this project:
 * the passage arrives facing -x and the hall is the space at -x of it. See the
 * top of controlRoom.js for why none of these are written to be orientable.
 */
export function createGiantHall({ scene, doorway, player }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  const near = doorway.x;
  const far = near - WIDTH;
  const midX = (near + far) / 2;
  // The door is a few metres in from the near end, so the hall runs away from
  // you in one direction rather than both. A space you arrive in the middle of
  // has no direction and nothing to walk down.
  const head = doorway.z + 4.8;
  const foot = head - LENGTH;
  const midZ = (head + foot) / 2;

  let entered = false;

  const wallSurface = makeWallSurface(...worldRepeat(LENGTH, HEIGHT), WALL_TINT);
  const wallOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL_TINT,
    });

  // ----------------------------------------------------------------- shell ---

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, LENGTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(WIDTH, LENGTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, LENGTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(WIDTH, LENGTH)),
      color: '#2b2d2a',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, HEIGHT, midZ);
  group.add(ceiling);

  /**
   * The way in, and the way on.
   *
   * The first is the doorway the control room hands over, down at floor level in
   * the near wall. The second is at the top of the stair — call it fourteen
   * metres — and it is the entire reason there is a tower: the hall has one way
   * out and it is not on the floor.
   *
   * It is in the end wall, square on to the length of the hall, and that was
   * worth moving it for. It began in the long wall beside the tower, where the
   * geometry was tidier and where, from anywhere you actually stand, you see it
   * nearly edge-on: a dark slot in a wall running away from you, invisible from
   * the door and barely legible from the foot of the stair. In the end wall it
   * is a lit rectangle at the end of thirty-eight metres, fourteen up, and the
   * first thing you see when you come out of the staff door is the whole of what
   * you are about to do.
   */
  const IN = {
    z: doorway.z,
    low: doorway.z - doorway.width / 2,
    high: doorway.z + doorway.width / 2,
    height: doorway.height,
  };
  // The sill is the top of the stair, taken from the tower rather than written
  // down here. The opening is cut and the gantry hung before the tower is built,
  // so the two would otherwise be two numbers that have to be kept equal by
  // hand — and the first time a tread is added or taken away, they would not be.
  const OUT = { x: midX, width: 2.4, height: 2.8, sill: SUMMIT.top };
  const outLow = OUT.x - OUT.width / 2;
  const outHigh = OUT.x + OUT.width / 2;

  // The near wall, in three pieces round the door you come in by.
  for (const [w, h, pz, py] of [
    [IN.low - foot, HEIGHT, (foot + IN.low) / 2, HEIGHT / 2],
    [head - IN.high, HEIGHT, (IN.high + head) / 2, HEIGHT / 2],
    [doorway.width, HEIGHT - IN.height, IN.z, (HEIGHT + IN.height) / 2],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallOf(w, h));
    wall.position.set(near, py, pz);
    wall.rotation.y = -Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }
  solid(near, near + 1, foot - 1, IN.low, {});
  solid(near, near + 1, IN.high, head + 1, {});
  // And the lintel over it: solid, but only to somebody whose head is above the
  // opening. `bottom` is what a collider has instead of a height — see
  // resolveCollisions. Standing on the floor you pass under it; jumping in the
  // doorway you hit it, which is what a lintel is.
  solid(near, near + 1, IN.low, IN.high, { bottom: IN.height });

  // The far long wall, whole: nothing is cut into it.
  {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, HEIGHT), wallOf(LENGTH, HEIGHT));
    wall.position.set(far, HEIGHT / 2, midZ);
    wall.rotation.y = Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }
  solid(far - 1, far, foot - 1, head + 1, {});

  // The end wall you are walking towards, in four pieces round the opening at
  // the top of the tower.
  for (const [w, h, px, py] of [
    [outLow - far, HEIGHT, (far + outLow) / 2, HEIGHT / 2],
    [near - outHigh, HEIGHT, (outHigh + near) / 2, HEIGHT / 2],
    [OUT.width, OUT.sill, OUT.x, OUT.sill / 2],
    [OUT.width, HEIGHT - OUT.sill - OUT.height, OUT.x, (HEIGHT + OUT.sill + OUT.height) / 2],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallOf(w, h));
    wall.position.set(px, py, foot);
    group.add(wall);
    wall.receiveShadow = true;
  }
  solid(far - 1, outLow, foot - 1, foot, {});
  solid(outHigh, near + 1, foot - 1, foot, {});
  // Under the high opening, and over it. The one under is given a `top` at the
  // sill rather than being solid all the way up, which is the same box doing two
  // jobs: it is fourteen metres of wall you cannot walk through, and it is the
  // threshold you step onto when you finally get up there.
  solid(outLow, outHigh, foot - 1, foot, { top: OUT.sill });
  solid(outLow, outHigh, foot - 1, foot, { bottom: OUT.sill + OUT.height });

  // And the end wall behind you, whole.
  {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), wallOf(WIDTH, HEIGHT));
    wall.position.set(midX, HEIGHT / 2, head);
    wall.rotation.y = Math.PI;
    wall.receiveShadow = true;
    group.add(wall);
  }
  solid(far - 1, near + 1, head, head + 1, {});

  // ------------------------------------------------------------------ ribs ---

  /**
   * Ribs down both long walls, and a string course at two heights.
   *
   * This is the whole of what makes the hall read as big rather than as
   * untextured. A flat wall twenty metres high has nothing on it the eye can
   * measure and comes out looking like a wall two metres high seen from close
   * up; six bays of it, with a course at chest height and another at three times
   * that, gives it a rhythm to be long against — and the ribs run floor to
   * ceiling, so the ceiling is somewhere they arrive rather than a lid.
   */
  const ribMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(RIB.wide, HEIGHT), RIB_TINT),
    color: RIB_TINT,
    roughness: 0.9,
    metalness: 0.05,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.7, metalness: 0.3 });

  const bayAt = (i) => foot + (LENGTH / BAYS) * i;
  for (let i = 0; i <= BAYS; i++) {
    const z = bayAt(i);
    for (const [wallX, sign] of [[near, -1], [far, 1]]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(RIB.deep, HEIGHT, RIB.wide),
        ribMat
      );
      rib.position.set(wallX + sign * RIB.deep / 2, HEIGHT / 2, z);
      rib.castShadow = true;
      rib.receiveShadow = true;
      group.add(rib);
      // No collider. They stand half a metre off a wall that already stops you
      // and the player's radius is most of that, so there is nothing to walk
      // into — the same reasoning the staff doors are built on.
    }
    // And a beam across the ceiling on the same line, so the bays are one thing
    // going up one wall, over and down the other.
    const beam = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.7, RIB.wide), ribMat);
    beam.position.set(midX, HEIGHT - 0.35, z);
    beam.castShadow = true;
    group.add(beam);
  }

  for (const y of COURSES) {
    for (const [wallX, sign] of [[near, -1], [far, 1]]) {
      const course = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, LENGTH), trimMat);
      course.position.set(wallX + sign * 0.07, y, midZ);
      group.add(course);
    }
  }

  // ----------------------------------------------------------------- light ---

  /**
   * Five lights for six hundred square metres, and the top half of the room
   * left dark.
   *
   * The renderer is forward: every light shades every fragment and the count is
   * compiled into the materials, so this is a budget and not a dial — the scene
   * was at forty-one before this hall existed. Which turns out to be the right
   * constraint. Floodlighting a space this size would make it a warehouse; four
   * pools of light down a hallway with black between them, and nothing at all
   * above ten metres, is what makes you aware there is a ceiling up there you
   * cannot see.
   *
   * Two of the six are on the tower, and they are not atmosphere: a jump you
   * cannot see the far side of is not a jump, it is a coin toss, and every other
   * decision in here can be dark as long as that one is not. Two and not one
   * because of which way light falls. A lamp lights the TOP of everything below
   * it and the underside of everything above it, and the thing you need to see
   * before every hop is the top of the next tread — so one lamp halfway up a
   * fourteen-metre stair leaves the whole upper half of the climb as silhouettes
   * with lit undersides. One low and one high covers both.
   */
  const fittings = [];
  // `under` is the slab each one hangs from, which is the hall's ceiling for all
  // but the last. That one is inside a passage with its own ceiling 2.8m over
  // the sill, and hung on the hall's number its rods were four metres long and
  // went up through the lintel into nothing — visible from the gantry, which is
  // the one place in the hall you are guaranteed to stand and look at it.
  for (const [fx, fy, fz, watt, range, under = HEIGHT] of [
    [midX + 3.4, 10.5, doorway.z - 1.5, 140, 44],
    [midX - 3.4, 10.5, doorway.z - 12, 140, 44],
    [midX + 3.4, 10.5, doorway.z - 22, 120, 42],
    // The tower, low and high. Out at three and a half metres from the core
    // rather than tucked against it: at a metre the concrete burned out into a
    // white column brighter than anything else in the hall, which in a room
    // this dark is a lamp with a wall in front of it rather than a lit wall.
    [midX + 3.6, 6.0, -27.6, 95, 28],
    [midX - 3.6, 15.2, -31.4, 100, 30],
    // And one just inside the way out. It is doing a third job again — it is
    // the only thing in the hall that says where you are going before you start
    // climbing.
    //
    // Inside the throat rather than on the wall beside the opening, and that is
    // the whole trick. The stair stands directly in front of the door, because
    // the stair is what the door is for, so from the floor of the hall the wall
    // around it is behind fourteen metres of tread and gantry. A lit passage
    // mouth is not: it is a rectangle that glows past the thing in front of it,
    // and the two and a half metres of it that clear the top tread are what you
    // see from the doorway you come in by, thirty-eight metres away.
    [OUT.x, OUT.sill + 1.5, foot - 1.1, 55, 26, OUT.sill + OUT.height],
  ]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.5), trimMat);
    housing.position.set(fx, fy + 0.22, fz);
    group.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.06, 0.38),
      new THREE.MeshBasicMaterial({ color: '#cfd6cc', toneMapped: false })
    );
    lens.position.set(fx, fy + 0.04, fz);
    group.add(lens);
    // Hung off the ceiling on a pair of rods. In a room this tall a fitting
    // flush to the slab lights the slab; these come down to where they are of
    // some use, which is the same thing the room you wake up in does.
    const drop = Math.max(0.1, under - fy - 0.3);
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, drop, 6), trimMat);
      rod.position.set(fx + side * 0.3, fy + 0.4 + drop / 2, fz);
      group.add(rod);
    }

    const lamp = new THREE.PointLight(0xc9d4d2, watt, range, 1.4);
    lamp.position.set(fx, fy, fz);
    group.add(lamp);
    fittings.push({ lamp, lens, watt, level: 1 });
  }

  // Dead ones between them, so the live ones read as what is left rather than
  // as what was installed. Cheap: a housing and a dark lens, no light.
  for (const [fx, fz] of [
    [midX - 3.4, doorway.z - 6],
    [midX + 3.4, doorway.z - 17],
    [midX - 3.4, doorway.z - 27],
    [midX + 3.4, -35],
  ]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.5), trimMat);
    housing.position.set(fx, 10.72, fz);
    group.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.06, 0.38),
      new THREE.MeshStandardMaterial({ color: '#1b1e1c', roughness: 0.6 })
    );
    lens.position.set(fx, 10.54, fz);
    group.add(lens);
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 8.98, 6), trimMat);
      rod.position.set(fx + side * 0.3, 11.12 + 4.49, fz);
      group.add(rod);
    }
  }

  // ----------------------------------------------------------------- tower ---

  /**
   * And the tower, which is the only way out of here.
   *
   * Placed rather than fitted: it is a thing that stands somewhere, and the hall
   * is sized so that it stands clear of both long walls with room to fall past
   * it on either side. See climbTower.js — it is a spiral stair with a metre
   * between the treads.
   *
   * Down at the far end, so the hall is walked before it is climbed. Coming in
   * at the near end you see the whole length of the place with one lit thing at
   * the bottom of it, and the way out is a lit rectangle thirteen metres up the
   * wall behind that, which is the shape of the next ten minutes stated in one
   * look.
   */
  const TOWER = new THREE.Vector3(midX, 0, -30);
  const tower = createClimbTower({ parent: group, colliders, origin: TOWER });

  /**
   * The gantry from the top tread to the way out.
   *
   * The stair does not arrive at the door — it arrives beside it, and a plate
   * bridges the gap. That is worth the extra piece: a spiral stair that happens
   * to land exactly at a doorway is a stair drawn to fit a door, and this one
   * was here first. It is also the one flat run on the whole climb, which is
   * where you stand and look back down at what you came up.
   */
  const summit = tower.summit;
  /**
   * As wide as the tread it meets, and not as wide as the door it leads to.
   *
   * It was the door's width to begin with — 2.4 against the top tread's 3.6 —
   * and that put six tenths of a metre of nothing down each side of the join.
   * Walking off the tread in a straight line, anywhere but dead centre, you
   * stepped onto air at fourteen metres and fell the whole way. Matching the
   * tread means the step from stair to deck is a step and not an aim.
   */
  const GANTRY = { width: 3.6, top: OUT.sill, thick: 0.22 };
  {
    const fromZ = summit.box.minZ;
    const run = fromZ - foot;
    const deckMat = new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(...metalRepeat(run, GANTRY.width), '#4b4f4a'),
      color: '#4b4f4a',
      roughness: 0.7,
      metalness: 0.3,
    });
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(GANTRY.width, GANTRY.thick, run),
      deckMat
    );
    deck.position.set(OUT.x, GANTRY.top - GANTRY.thick / 2, (foot + fromZ) / 2);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
    solid(OUT.x - GANTRY.width / 2, OUT.x + GANTRY.width / 2, foot, fromZ, {
      top: GANTRY.top,
      bottom: GANTRY.top - GANTRY.thick,
    });

    /**
     * A handrail down each side, and it is a real one.
     *
     * The first draft hung them as meshes and gave them nothing to collide
     * with, on the usual reasoning that a rail is scenery. It is not scenery
     * here: it is the only thing between a walk and a fourteen-metre drop, and
     * a rail you can see and walk through is worse than no rail at all — it
     * tells the player they are safe and then is not there.
     *
     * `bottom` at deck level is what makes one collider do that without also
     * being an invisible fence in the middle of the hall fourteen metres below.
     * A box you are entirely under does not stop you, so down on the floor it
     * is not there; up here your head is above it and it is.
     *
     * They stop at the tread rather than running on over it. Carried the extra
     * few centimetres, the post at that end lands on the corner you arrive at
     * and shoves you back off the stair you have just climbed.
     */
    for (const side of [-1, 1]) {
      const railX = OUT.x + side * GANTRY.width / 2;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, run), trimMat);
      rail.position.set(railX, GANTRY.top + 1.0, (foot + fromZ) / 2);
      group.add(rail);
      for (let i = 0; i <= 4; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), trimMat);
        post.position.set(railX, GANTRY.top + 0.5, foot + (run / 4) * i);
        group.add(post);
      }
      solid(railX - 0.07, railX + 0.07, foot, fromZ, { bottom: GANTRY.top });
    }

    // Hazard paint on the lip, the same language the treads speak.
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, GANTRY.thick + 0.03, run),
      new THREE.MeshStandardMaterial({ ...makeHazardSurface(4, 1), roughness: 0.72 })
    );
    lip.position.set(
      OUT.x - GANTRY.width / 2 + 0.08,
      GANTRY.top - GANTRY.thick / 2,
      (foot + fromZ) / 2
    );
    group.add(lip);
  }

  /**
   * What is through the opening at the top: a lined passage, capped, exactly
   * the way the staff door's was before this hall was built on the end of it.
   * `wayOn` hands the far end over for whatever comes next.
   *
   * Lit, unlike that one, and for a reason rather than by accident — see the
   * lamp inside it above. The staff door's passage had to be a dark throat
   * because the whole of its job was to hide what was on the other side until
   * you were standing in it. This one is the opposite: it is the thing you are
   * meant to be able to see from the far end of a very long room.
   */
  const OUT_DEPTH = 3.2;
  const outEnd = foot - OUT_DEPTH;
  {
    const liner = new THREE.MeshStandardMaterial({ color: '#33352f', roughness: 0.94 });
    const throat = foot - OUT_DEPTH / 2;
    for (const [w, h, px, py, rx, ry] of [
      [OUT_DEPTH, OUT.height, outLow, OUT.sill + OUT.height / 2, 0, Math.PI / 2],
      [OUT_DEPTH, OUT.height, outHigh, OUT.sill + OUT.height / 2, 0, -Math.PI / 2],
      [OUT.width, OUT_DEPTH, OUT.x, OUT.sill + OUT.height, Math.PI / 2, 0],
      [OUT.width, OUT_DEPTH, OUT.x, OUT.sill + 0.004, -Math.PI / 2, 0],
    ]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), liner);
      panel.position.set(px, py, throat);
      panel.rotation.set(rx, ry, 0);
      panel.receiveShadow = true;
      group.add(panel);
    }
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(OUT.width, OUT.height),
      new THREE.MeshStandardMaterial({ color: '#0a0b09', roughness: 1 })
    );
    cap.position.set(OUT.x, OUT.sill + OUT.height / 2, outEnd);
    group.add(cap);

    // The deck through the opening, and the sides and end of it. The floor of
    // the passage is the same kind of box as the threshold, carried on through.
    solid(outLow, outHigh, outEnd, foot, { top: OUT.sill, bottom: OUT.sill - 0.5 });
    solid(outLow - 0.6, outLow, outEnd, foot, {});
    solid(outHigh, outHigh + 0.6, outEnd, foot, {});
    solid(outLow - 0.6, outHigh + 0.6, outEnd - 0.6, outEnd, {});
  }

  /** Inside the hall at all. The passage in does not count. */
  const contains = (x, z) => x < near && x > far && z > foot && z < head;

  return {
    group,
    colliders,
    contains,
    /** What the tower is made of, for the harness and the debug panel. */
    steps: tower.steps,

    /** Just inside the door, looking down the length of it. */
    get entry() {
      return { position: [near - 1.4, 0, doorway.z], yaw: Math.PI };
    },

    /** On the gantry at the top, for jumping straight to the way out. */
    get summitEntry() {
      return { position: [OUT.x, OUT.sill, foot + 2.0], yaw: 0 };
    },

    /**
     * The far end of the passage at the top, for whatever gets built on it.
     * Handed over in the same terms as every other opening in this game.
     */
    get wayOn() {
      return { x: OUT.x, y: OUT.sill, z: outEnd, width: OUT.width, height: OUT.height };
    },

    reset() {
      entered = false;
    },

    update(delta) {
      const t = performance.now() / 1000;
      // The floods breathe, out of step with each other. Nothing in this hall
      // moves and nothing in it is going to; this is the only thing separating
      // it from a photograph, and it is deliberately almost nothing — a space
      // this big with something flickering in it reads as a set dressed to be
      // creepy, and the hall does not need the help.
      for (const [i, fitting] of fittings.entries()) {
        const want = 0.88 + 0.12 * Math.sin(t * 0.37 + i * 2.1) * Math.sin(t * 0.13 + i);
        fitting.level += (want - fitting.level) * Math.min(1, delta * 2);
        fitting.lamp.intensity = fitting.watt * fitting.level;
        fitting.lens.material.color.setScalar(0.5 + 0.4 * fitting.level);
      }

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        setObjective('Get up to the door');
        showNote('This part was not built for people.', 3.8);
      }
    },
  };
}
