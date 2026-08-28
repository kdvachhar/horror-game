import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  cloneSurface,
  worldRepeat,
  metalRepeat,
} from './textures.js';
import { showNote, setObjective } from './hud.js';

/**
 * The hall behind the staff door.
 *
 * Everything in this game up to now has been a room somebody could stand up in
 * and touch the ceiling of. A ward with beds in it. A corridor three metres
 * across. A plant room with a desk and a dead man at it. You have been moved
 * through a building at your own size for the whole game, and the last thing
 * that happened was a thing on a television telling you to go through a door it
 * opened for you, and warning you about who is on the other side.
 *
 * This is on the other side. It is seventeen metres across, sixty-two long and
 * twenty high, and you come into it through a doorway one metre wide.
 *
 * The scale IS the content, and it is now the only content: there was a tower
 * standing in here for one commit and it has been taken out again, so what the
 * hall has is its size and the walk. Nothing in it explains itself and there is
 * nothing to press. It says that the part of this building you have been in was
 * the small part, and it says it by being sixty-two metres of somewhere you have
 * to cross on foot.
 *
 * Which is why the door you arrive by is left plainly visible in the wall behind
 * you and why that wall is otherwise bare for twenty metres above it — the one
 * readable object in a flat expanse is what gives the expanse its size, and a
 * person's door in a wall this tall is the only ruler the player has.
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
 * Sixty-two metres long against seventeen wide, so it is emphatically a hallway
 * and not a hangar — it has a direction, and the direction is away from the door
 * you came in by. Twenty high against seventeen wide, so it is taller than it is
 * broad, which is the proportion that reads as a shaft rather than as a
 * warehouse and is the only one that makes the ceiling worth not being able to
 * see.
 *
 * It was thirty-eight, back when there was a tower standing in it and the length
 * was mostly the approach to that. With the tower gone, length is the only thing
 * the hall has, so it has a great deal more of it: sixty-two metres of the same
 * six-metre bay, which is ten of them receding instead of six, and a lit doorway
 * at the end that you can see from the moment you come in and walk towards for
 * the better part of a minute.
 */
const WIDTH = 17;
const LENGTH = 62;
const HEIGHT = 20;

/**
 * How the long walls are divided up, and how far the ribs stand proud.
 *
 * Ten bays over sixty-two metres, which is 6.2 apiece — near enough the 6.33 the
 * shorter hall had that the rhythm is the same one, just more of it. The bay is
 * the unit the eye measures the place in, so it is the one number that had to
 * survive the room getting longer.
 */
const BAYS = 10;
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
   * The first is the doorway the control room hands over, in the near wall. The
   * second is at the far end, square on to the length of the hall, and both are
   * on the floor.
   *
   * The second one used to be fourteen metres up, because there was a tower to
   * climb to it and the whole point of the tower was that the way out was not on
   * the floor. The tower is gone, so it came down with it — a door at head
   * height on a wall with nothing to climb is a door you look at, and the hall
   * would have no exit at all.
   *
   * It stays in the end wall rather than going back into a long one. Square on
   * is what makes it work: a lit rectangle at the end of sixty-two metres, dead
   * ahead from the moment you come out of the staff door. In a long wall it is
   * edge-on from everywhere you ever stand.
   */
  const IN = {
    z: doorway.z,
    low: doorway.z - doorway.width / 2,
    high: doorway.z + doorway.width / 2,
    height: doorway.height,
  };
  const OUT = { x: midX, width: 2.4, height: 2.8 };
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
  // the far end.
  for (const [w, h, px, py] of [
    [outLow - far, HEIGHT, (far + outLow) / 2, HEIGHT / 2],
    [near - outHigh, HEIGHT, (outHigh + near) / 2, HEIGHT / 2],
    [OUT.width, HEIGHT - OUT.height, OUT.x, (HEIGHT + OUT.height) / 2],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallOf(w, h));
    wall.position.set(px, py, foot);
    group.add(wall);
    wall.receiveShadow = true;
  }
  solid(far - 1, outLow, foot - 1, foot, {});
  solid(outHigh, near + 1, foot - 1, foot, {});
  // And the lintel over it, the same arrangement as the door you came in by:
  // solid only to somebody whose head is above the opening.
  solid(outLow, outHigh, foot - 1, foot, { bottom: OUT.height });

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
   * The sixth is inside the way out. Two of these used to be on the tower doing
   * legibility rather than atmosphere — you cannot jump at something you cannot
   * see — and with nothing left to jump at, that pair went back into the run
   * down the hall, which needed them: the room is twenty-four metres longer than
   * it was and it is lit by the same six lamps.
   */
  const fittings = [];
  // `under` is the slab each one hangs from, which is the hall's ceiling for all
  // but the last. That one is inside a passage with its own ceiling 2.8m over
  // the sill, and hung on the hall's number its rods were four metres long and
  // went up through the lintel into nothing — visible from the gantry, which is
  // the one place in the hall you are guaranteed to stand and look at it.
  //
  // They alternate sides down the length. A single line of lamps up the middle
  // of a hallway lights a strip of floor and leaves both walls to fall away into
  // nothing, which is a corridor; staggered, each one washes the wall it is
  // nearest, and the bays come out of the dark one at a time as you walk.
  for (const [fx, fy, fz, watt, range, under = HEIGHT] of [
    [midX + 3.4, 10.5, doorway.z - 1.5, 140, 44],
    [midX - 3.4, 10.5, doorway.z - 12, 140, 44],
    [midX + 3.4, 10.5, doorway.z - 23, 130, 44],
    [midX - 3.4, 10.5, doorway.z - 34, 130, 44],
    [midX + 3.4, 10.5, doorway.z - 45, 120, 42],
    // And one just inside the way out. It is doing a third job again — it is
    // the only thing in the hall that says where you are going before you start
    // climbing.
    //
    // Inside the throat rather than on the wall beside the opening. A lit
    // passage mouth is a rectangle; a lamp washing the wall around a dark hole
    // is a bright patch of wall with nothing readable in the middle of it, and
    // at sixty-two metres that is the difference between somewhere to walk to
    // and no reason to set off.
    [OUT.x, 2.0, foot - 1.1, 45, 24, OUT.height],
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
    [midX - 3.4, doorway.z - 28],
    [midX + 3.4, doorway.z - 39],
    [midX - 3.4, doorway.z - 50],
    [midX + 3.4, doorway.z - 56],
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

  /**
   * What is through the opening at the end: a lined passage, with the tall room
   * on the far side of it.
   *
   * It was capped for one commit — a dark plane across the end and a collider
   * behind it, the way the staff door's was before this hall was built on it.
   * tallRoom.js is built on the far end now, off `wayOn`, so the cap is gone and
   * that room's near wall is what you come out into. Leaving it would have put a
   * black plane in the same place as a wall with a doorway in it: two coincident
   * surfaces fighting over the same pixels, with the way on behind them.
   *
   * Lit, unlike that one, and for a reason rather than by accident — see the
   * lamp inside it above. The staff door's passage had to be a dark throat
   * because the whole of its job was to hide what was on the other side until
   * you were standing in it. This one is the opposite: it is the only thing in
   * sixty-two metres of hall you can aim at, and you can see it from the door
   * you come in by.
   */
  const OUT_DEPTH = 3.2;
  const outEnd = foot - OUT_DEPTH;
  {
    const liner = new THREE.MeshStandardMaterial({ color: '#33352f', roughness: 0.94 });
    const throat = foot - OUT_DEPTH / 2;
    for (const [w, h, px, py, rx, ry] of [
      [OUT_DEPTH, OUT.height, outLow, OUT.height / 2, 0, Math.PI / 2],
      [OUT_DEPTH, OUT.height, outHigh, OUT.height / 2, 0, -Math.PI / 2],
      [OUT.width, OUT_DEPTH, OUT.x, OUT.height, Math.PI / 2, 0],
      [OUT.width, OUT_DEPTH, OUT.x, 0.004, -Math.PI / 2, 0],
    ]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), liner);
      panel.position.set(px, py, throat);
      panel.rotation.set(rx, ry, 0);
      panel.receiveShadow = true;
      group.add(panel);
    }
    // The sides only. Not the floor — the passage is at the hall's own level and
    // the hall's floor is the world's, so there is nothing to carry through. Not
    // the top either: a collider has no underside, and a box over the passage
    // would be a ceiling you could not walk under. And not the end, which is a
    // doorway into the tall room now rather than the back of a hole.
    solid(outLow - 0.6, outLow, outEnd, foot, {});
    solid(outHigh, outHigh + 0.6, outEnd, foot, {});
  }

  /** Inside the hall at all. The passage in does not count. */
  const contains = (x, z) => x < near && x > far && z > foot && z < head;

  return {
    group,
    colliders,
    contains,
    /**
     * Just inside the door, looking down the length of it.
     *
     * Yaw 0 and not PI. Yaw 0 faces -z in this game — see the player — and -z
     * is the way the hall runs; PI put the debug jump four metres from the end
     * wall behind you, staring at it, with sixty-two metres of hall out of shot.
     * It was wrong while there was a tower in here too and nobody noticed,
     * because the tower was the thing you turned round and saw.
     */
    get entry() {
      return { position: [near - 1.4, 0, doorway.z], yaw: 0 };
    },

    /**
     * The far end of the passage at the top, for whatever gets built on it.
     * Handed over in the same terms as every other opening in this game.
     */
    get wayOn() {
      return { x: OUT.x, y: 0, z: outEnd, width: OUT.width, height: OUT.height };
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
        setObjective('Get to the far end');
        showNote('This part was not built for people.', 3.8);
      }
    },
  };
}
