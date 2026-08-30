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
import { createRockfall, BREACH } from './rockfall.js';
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
 * This is on the other side. It is fifteen metres across, forty-eight long and
 * twelve high, and you come into it through a doorway one metre wide.
 *
 * The scale IS the content, and it is now the only content: there was a tower
 * standing in here for one commit and it has been taken out again, so what the
 * hall has is its size and the walk. Nothing in it explains itself and there is
 * nothing to press. It says that the part of this building you have been in was
 * the small part, and it says it by being forty-eight metres of somewhere you
 * have to cross on foot.
 *
 * The far end of it is open now — no door, no passage, just the hall stopping
 * and the tall room starting — so the walk has something at the end of it that
 * gets bigger as you come up to it rather than a lit rectangle that stays the
 * same size until you are through it.
 *
 * Which is why the door you arrive by is left plainly visible in the wall behind
 * you and why that wall is otherwise bare all the way up — the one
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
 * Forty-eight metres long against fifteen wide, so it is a hallway and not a
 * hangar — it has a direction, and the direction is away from the door you came
 * in by.
 *
 * Twelve high, down from eighteen. Eighteen was taller than the hall was broad,
 * which is the proportion that reads as a shaft, and the ceiling was too far up
 * to make out — the room was doing its height and its length at the same time.
 * It does not need to do its height any more: the tall room at the far end is
 * thirty-four, and a shaft at the end of a shaft is nothing arriving at nothing.
 * At twelve the hall is wider than it is high for the first time, so it presses
 * down and runs away from you instead of standing over you, the ceiling is close
 * enough to read as a ceiling — and the room you come out into afterwards is
 * nearly three times its height, which is a drop the old hall gave away in
 * advance.
 *
 * It has been three sizes now, and the middle one was wrong. Thirty-eight while
 * there was a tower in it, when the length was mostly the approach to the tower;
 * sixty-two when the tower came out and length was all the hall had left; and
 * forty-eight, which is where it stops. Sixty-two was a walk that had made its
 * point by about the third bay and then went on for another seven, and a room
 * whose only idea is its size can outstay that idea. Eight bays of six metres
 * is still long enough that you set off towards a door you cannot yet make out
 * — and short enough that you get there while it is still worth arriving.
 */
const WIDTH = 15;
const LENGTH = 48;
const HEIGHT = 12;

/**
 * How the long walls are divided up, and how far the ribs stand proud.
 *
 * Eight bays over forty-eight metres, which is exactly six apiece — the same
 * rhythm the hall has had at every length it has been (6.33, then 6.2, now 6.0).
 * The bay is the unit the eye measures the place in, so it is the one number
 * that has to survive the room being resized.
 */
const BAYS = 8;
const RIB = { wide: 1.3, deep: 0.55 };
/** The two string courses, which are the only horizontal lines in here. */
const COURSES = [3.0, 7.0];

/**
 * The height the lamps hang at, which is a proportion of the ceiling and not a
 * number: they have always come down to a bit under two thirds of it, so that
 * there is a band of dark above them and the fitting is somewhere it can be seen
 * to be a fitting. Written once because there are two sets of them — the live
 * ones and the dead ones between them — and a ceiling change that moved one set
 * and not the other would put half the fittings through the slab.
 */
const LAMP_Y = 7.6;

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
   * is what makes it work: a lit rectangle at the end of the hall, dead ahead
   * from the moment you come out of the staff door. In a long wall it is
   * edge-on from everywhere you ever stand.
   */
  const IN = {
    z: doorway.z,
    low: doorway.z - doorway.width / 2,
    high: doorway.z + doorway.width / 2,
    height: doorway.height,
  };
  /**
   * The way out, which is not a door any more: it is the whole end of the hall.
   *
   * It was a 2.4 by 2.8 hole with a lintel and a lined passage behind it, and
   * the hall stopped at a wall you went through. It does not stop now. The end
   * wall is gone, the passage with it, and the far end of the hall is open for
   * its full fifteen metres and its full twelve — the tall room's floor is this
   * floor carried on, its side walls are these side walls carried on, and the
   * only thing that changes at the join is that the ceiling stops.
   *
   * Which is the entire reason to do it. Twelve metres of ceiling ending in mid
   * air with thirty-four metres of room above it does something a doorway
   * cannot: you do not arrive somewhere tall, the tall part opens over your head
   * while you are still walking. A door would have given you a rectangle to
   * frame it in and a threshold to cross, and both of those are ways of being
   * told about a room before you are in it.
   */
  const OUT = { x: midX, width: WIDTH, height: HEIGHT };

  /**
   * Where the wall came down, and which wall.
   *
   * The right-hand one as you walk down the hall, which is the wall the door
   * you came in by is in — walking -z your right is +x, and that is `near`.
   * It was on the other one for a commit and that was the wrong side of the
   * room: the hall has one direction and the thing worth finding in it should
   * be on the hand you are already looking at.
   *
   * And down at the last bay, three metres short of the end. Next to the cube,
   * which is the point of it being there at all — you walk the whole length of
   * this hall, find the way on filled with an animal, turn round, and it is the
   * first thing you are looking at.
   */
  const COLLAPSE = { z: doorway.z - 40.2 };
  const collapseLow = COLLAPSE.z - BREACH.width / 2;
  const collapseHigh = COLLAPSE.z + BREACH.width / 2;

  // The near wall: two holes in it now, so five pieces.
  for (const [w, h, pz, py] of [
    [collapseLow - foot, HEIGHT, (foot + collapseLow) / 2, HEIGHT / 2],
    [IN.low - collapseHigh, HEIGHT, (collapseHigh + IN.low) / 2, HEIGHT / 2],
    [BREACH.width, HEIGHT - BREACH.height, COLLAPSE.z, (HEIGHT + BREACH.height) / 2],
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
  solid(near, near + 1, foot - 1, collapseLow, {});
  solid(near, near + 1, collapseHigh, IN.low, {});
  solid(near, near + 1, IN.high, head + 1, {});
  // The breach's lintel. The opening's own box is the rockfall's, because what
  // is in the opening is what decides who gets through it.
  solid(near, near + 1, collapseLow, collapseHigh, { bottom: BREACH.height });
  // And the lintel over it: solid, but only to somebody whose head is above the
  // opening. `bottom` is what a collider has instead of a height — see
  // resolveCollisions. Standing on the floor you pass under it; jumping in the
  // doorway you hit it, which is what a lintel is.
  solid(near, near + 1, IN.low, IN.high, { bottom: IN.height });

  /**
   * The far long wall, whole.
   *
   * Nothing is cut into it. The hall is a walk and a walk wants one thing at
   * the end of it and one thing to find on the way — both of those are on the
   * other side now, so this one goes back to being what it is best at, which is
   * forty-eight metres of nothing to look at.
   */
  {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(LENGTH, HEIGHT), wallOf(LENGTH, HEIGHT));
    wall.position.set(far, HEIGHT / 2, midZ);
    wall.rotation.y = Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }
  solid(far - 1, far, foot - 1, head + 1, {});

  // There is no end wall. It used to be built here in three pieces round a
  // door-sized hole, with a lintel over it; the opening is the full section of
  // the hall now, so all three pieces have no width or no height left and there
  // is nothing to build. No collider either — the one thing that must not be at
  // the foot of this hall is anything to walk into. What closes the hall off at
  // this end is the tall room's own header, twelve metres up, which is that
  // room's business and not this one's.

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
   * Five lights for six hundred square metres, and the run of it left dark
   * between them.
   *
   * The renderer is forward: every light shades every fragment and the count is
   * compiled into the materials, so this is a budget and not a dial — the scene
   * was at forty-one before this hall existed. Which turns out to be the right
   * constraint. Floodlighting a space this size would make it a warehouse; four
   * pools of light down a hallway with black between them is what makes the
   * length of it something you have to walk into rather than something you can
   * take in from the door.
   *
   * They hang at `LAMP_Y`, a bit under two thirds of the way up. On the
   * eighteen-metre ceiling that left the whole top half unlit and the slab out
   * of sight; at twelve it washes the beams instead, which is the point of
   * lowering the ceiling — there is no reason to hide a ceiling that is now
   * close enough to be part of the room.
   *
   * The fifth is inside the way out. There were six while the hall was sixty-two
   * long; at forty-eight, four down the run is the same twelve-metre spacing,
   * and the spare one is a light this renderer does not have to shade every
   * fragment against — see the count in the scene, which is what a forward
   * renderer actually charges you for.
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
  //
  // And every one of them sits in the middle of a bay, six metres off the beam
  // either side. They used to be spaced off the doorway on round numbers, which
  // put four of the eight fittings — two live, two dead — inside a ceiling beam
  // with their rods running up through it. At eighteen metres that was eighteen
  // metres away and nobody was ever going to see it. At twelve it is a light
  // fitting buried in a girder, so they are hung off the bay grid instead, which
  // is what the ceiling is actually divided by. Same twelve-metre spacing.
  for (const [fx, fy, fz, watt, range, under = HEIGHT] of [
    [midX + 3.0, LAMP_Y, doorway.z - 4.2, 130, 40],
    [midX - 3.0, LAMP_Y, doorway.z - 16.2, 130, 40],
    [midX + 3.0, LAMP_Y, doorway.z - 28.2, 125, 40],
    [midX - 3.0, LAMP_Y, doorway.z - 40.2, 120, 40],
    // There used to be a fifth, inside the throat of the passage, and it was
    // the only thing in the hall you could aim at. The passage is gone and so is
    // it: what you aim at now is the tall room's own light coming back through
    // an opening fifteen metres wide, which is a better answer to the same
    // problem and one this renderer does not have to shade every fragment
    // against.
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
    [midX - 3.0, doorway.z + 1.8],
    [midX + 3.0, doorway.z - 10.2],
    [midX - 3.0, doorway.z - 22.2],
    [midX + 3.0, doorway.z - 34.2],
  ]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.5), trimMat);
    housing.position.set(fx, LAMP_Y + 0.22, fz);
    group.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.06, 0.38),
      new THREE.MeshStandardMaterial({ color: '#1b1e1c', roughness: 0.6 })
    );
    lens.position.set(fx, LAMP_Y + 0.04, fz);
    group.add(lens);
    const drop = HEIGHT - LAMP_Y - 0.3;
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, drop, 6), trimMat);
      rod.position.set(fx + side * 0.3, LAMP_Y + 0.4 + drop / 2, fz);
      group.add(rod);
    }
  }

  /**
   * What is through the opening at the end: the tall room, directly, with
   * nothing in between.
   *
   * There was a 3.2 metre lined passage here, and before that a cap across the
   * back of it. Both are gone. A passage between two rooms is a decompression —
   * it takes the first room away, holds you in the dark for a second and then
   * gives you the second one, and it is the right thing when what is coming has
   * to be hidden until you are standing in it, which is what the staff door's
   * throat is for. It is the wrong thing here, because what is coming is height,
   * and height is the one thing you cannot be handed in a 2.8 metre tunnel. The
   * rooms are simply adjacent now, and the hall's ceiling running out over your
   * head is the transition.
   */
  /**
   * And what is in that hole: a staff door on the floor and the rock that put
   * it there, with a gap in the heap the bucket fits through and you do not.
   *
   * Built here rather than in the wall above it because the wall's job is to
   * have a hole and the collapse's job is to fill it — see rockfall.js, which
   * owns the opening's collider for the same reason the control room owns its
   * door's.
   */
  const collapse = createRockfall({
    scene,
    parent: group,
    colliders,
    x: near,
    z: COLLAPSE.z,
    // The hall is at -x of this wall, so everything the collapse measures out
    // from it goes the other way.
    side: -1,
  });

  /** Inside the hall at all. The passage in does not count. */
  const contains = (x, z) => x < near && x > far && z > foot && z < head;

  return {
    group,
    colliders,
    contains,
    collapse,
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
     * The open end, for whatever gets built on it. Handed over in the same terms
     * as every other opening in this game — it is just that this one is the size
     * of the room. Anything built on it has to close its own top: it is being
     * given a fifteen by twelve hole, not a door.
     */
    get wayOn() {
      return { x: OUT.x, y: 0, z: foot, width: OUT.width, height: OUT.height };
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
