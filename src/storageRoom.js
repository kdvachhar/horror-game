import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  makeWoodSurface,
  worldRepeat,
  metalRepeat,
  cloneSurface,
} from './textures.js';
import { buildScreenFace, createScreenLife, FACE } from './screenFace.js';
import { createScreenBeast, BREAKOUT } from './screenBeast.js';
import { createScreenScare } from './screenScare.js';
import { createBoulderDrop } from './boulderDrop.js';
import { playButtonPress, playSpikeGrind, createLiftMotor } from './audio.js';
import { showNote, setObjective } from './hud.js';

/**
 * The storage room at the top, and the thing that has been watching you.
 *
 * Behind the two-body door in the lift room: a long shed of racking seventy-two
 * metres up, full of the parts for everything you have walked through, and at
 * the far end of it a machine the size of the wall with a face on it.
 *
 * **The face is the same face.** It has been on a 3.8 metre television in the
 * ward and on another at the end of the red hall, and screenFace.js is
 * emphatic that if it turns up anywhere else it turns up in one of those,
 * because a face crammed into a different box is a different character wearing
 * the same eyes. This breaks that rule in the one direction the rule was never
 * protecting against. Shrinking it into a desk terminal made it a computer with
 * a face on it; blowing it up to five metres makes it the thing the televisions
 * were always a window onto. Same eyes, same mouth, same voice, nothing
 * redrawn — only finally at the size it has been talking to you from.
 *
 * It is off when you come in. There is one button and it is enormous, which is
 * the whole of the puzzle in this room: everything else up here has asked you
 * to be two bodies in two places, and this asks you to walk up to a thing and
 * press it.
 */

/**
 * The shed. Long in +x from the door, wide in z, and tall enough to store in.
 *
 * It was 28 x 20 x 7 and it read as a corridor with shelves down it. The
 * reason is that the only part of a room you can see from inside racking is
 * the aisle: width you cannot see past is width you do not have, and at seven
 * metres of head the shelving stopped well short of the roof, so nothing in
 * here was taller than the thing looking at it.
 *
 * So bigger is mostly up and away. The lane is long enough that the far end
 * is a smudge from the door, and the racking now goes most of the way to the
 * roof, which is the one cue that lands in first person — you are walking at
 * the bottom of it rather than past it.
 *
 * Everything in here is laid out from these three. Bays, lamps, cable trays
 * and the machine's own proportions are all derived, so changing a number
 * moves the room instead of leaving the furniture behind in the old one.
 */
const LENGTH = 46;
const WIDTH = 26;
const HEIGHT = 10;

/**
 * The two ends of everything that lights up in here, as colours rather than
 * as numbers.
 *
 * Written as hex and interpolated between, because `setRGB` takes the
 * renderer's working space and a dark value handed to it comes back three
 * times lighter than it was authored — the screen was a pale grey slab for
 * exactly that reason. `setStyle`/`new Color(hex)` converts, so a pair of
 * them with `lerp` between is the only way to say "this dark green" and get
 * it. The face does the same thing one line at a time; see createScreenLife.
 */
const DEAD_TUBE = new THREE.Color('#07080a');
const LIVE_TUBE = new THREE.Color('#101d16');
const DEAD_STRIP = new THREE.Color('#141611');
const LIVE_STRIP = new THREE.Color('#b9c49a');
const DEAD_PIP = new THREE.Color('#15110c');
const LIVE_PIP = new THREE.Color('#c08a2a');

const WALL_TINT = '#43463f';
const FLOOR_TINT = '#35372f';

/**
 * The television's glass, and how many of them across this one is.
 *
 * The set in the ward is a 3.8 x 1.9 casing with 3.3 x 1.46 of actual tube
 * recessed in it, and the face is drawn 1.16 x 1.26 — so on the television it
 * fills 35% of the width and 86% of the height, which is the framing you have
 * been looking at this character in for the whole game.
 *
 * Both numbers below are multiplied by the same scalar, and so is the face.
 * That is the only way the framing survives: a screen and a face scaled by
 * different amounts is a different composition however carefully the two are
 * chosen, and the first cut of this room got it wrong in the direction that
 * does not show up until you are standing in front of it — the glass was
 * authored to a flatter aspect than the tube, the face was scaled to fill its
 * width, and the result was a face whose eyes were cut off by the top of the
 * screen and whose mouth hung out of the bottom of it. From down the aisle it
 * looked fine, which is why it shipped.
 */
const TV_GLASS = { wide: 3.3, high: 1.46 };
const TUBE = 3.2;

/**
 * The machine, across the far end.
 *
 * `bank` is how much of the wall it takes, `deep` how far it stands off it.
 * The screen is most of it: this is a face in a cabinet and not a cabinet with
 * a face on it, and the proportion is what says so.
 */
const RIG = {
  bank: 18.0,
  high: 7.4,
  deep: 1.4,
  screen: { wide: TV_GLASS.wide * TUBE, high: TV_GLASS.high * TUBE, at: 4.0 },
};

/**
 * How big to draw the face in it, which is not a free number.
 *
 * It is the tube's multiple and nothing else. The glass is the television's
 * glass times TUBE and the face is the television's face times TUBE, so what
 * is on this wall is the ward's set photographed closer — same framing, same
 * margins, same character. Anything else here is a face that fits its screen
 * differently from the one you have been talking to, which is the whole thing
 * screenFace.js is written to prevent.
 */
const FACE_SCALE = TUBE;

/**
 * The way out, which exists before you need it and is the point.
 *
 * A high-level transfer opening in the -z wall with a stair of pallets under
 * it — how stock got onto the top of the racking, and the only hole in this
 * room that is not the door you came in by. It is there from the moment you
 * walk in, lit by nothing, eleven and a half metres of slightly darker dark
 * up in the corner.
 *
 * That is deliberate. A chase whose exit appears when the chase starts is a
 * chase you solve by looking around while something eats you; this one you
 * have already seen, probably climbed, and dismissed. The objective in here
 * is `Find the way on` and this *is* the way on — you are meant to find it,
 * go and look, find nothing, and come back down to the button.
 *
 * `sill` is six steps of 0.6 and you step 0.9 for free, so it is a run rather
 * than six jumps. Nothing about getting out of this room is meant to be a
 * platforming test; the test is whether you went and looked.
 */
const WAY_UP = { wide: 11.5, high: 5.9, sill: 3.6, from: 1.0 };

/**
 * The pallets up to it. Six, because 6 x 0.6 is the sill and 0.6 is free.
 *
 * `from` is the *lowest* step and they climb from there toward the near
 * corner, which is to say toward -x, which is to say the same way you are
 * already running. That direction is the whole of it. Built the other way up
 * — low in the corner, climbing back out into the room — the stair is a
 * staircase you have to overshoot and then turn round and come back up,
 * directly into the thing you are running from. Nobody would read that as a
 * route, and anybody who did would be wrong to.
 */
const STAIR = { steps: 6, rise: 0.6, wide: 1.8, deep: 2.2, from: 13.0 };

/** The button. Giant, because it is the only control in a room this size. */
const BUTTON = { base: 1.9, cap: 1.5, rise: 0.55, dome: 0.34, at: 0.58 };

/**
 * The roof does not hold it any more, and the eight arrows are paid for
 * somewhere else now.
 *
 * It used to stand behind the heap for eighteen seconds. That was never the
 * point of the roof — the point was the time it bought at the pad two
 * hundred metres away, because the lift's eight-arrow code is the only part
 * of the route where you have to stand still, and standing still against
 * something that walks at 5.1 is a timer whether it is written as one or
 * not. Eighteen seconds of hold measured a twenty second window at the pad.
 *
 * What it also bought was a chase with nothing in it. Measured over the full
 * route, the gap never came below sixty metres after the shed and ran to a
 * hundred in the maze: three junctions, a climb and a hundred and fifty
 * metres of corridor with no creature in them at all. The thing you are
 * running from spent the chase standing in a room you had left.
 *
 * So it is not held. The roof still comes down — it is the reveal, and the
 * stone is still coming off it — and it comes through the hole it makes for
 * itself about a second later, which is the same picture without the wait.
 * The time at the pad is bought by the car instead: the doorway is two
 * metres eight, the thing is eleven and a half, and it has to stand in the
 * lobby and watch you type. See `onBoarded` in codeLift.js.
 *
 * Left as a constant rather than deleted, because it is still the dial. Put
 * a number back in it and the heap holds again for that many seconds.
 */
const HOLD = 0;

/**
 * Waking up, in seconds from the press.
 *
 * It is a sequence and not a switch because the room is forty-six metres long
 * and the button is down the far end of it: whatever happens has to be
 * legible from where you are standing when you press it, which is with your
 * back to half of it. So the racking lamps come up first and travel away from
 * you down the shed, then the cabinet lamps, then the screen — the light
 * arrives before the face does, and you have turned round by the time it is
 * looking at you.
 */
const WAKE = { lamps: 0.55, bank: 2.4, screen: 3.6, face: 4.4, speak: 5.4 };

/**
 * What it says, the first time, and it is the turn.
 *
 * The first two lines are the ones it had: surprise, and then recognition of
 * what you have just done for it. Everything after them used to be it being
 * pleased with itself in an empty room. Now it says what it wanted you up
 * here for, which means this screen is the moment the thing that has been
 * giving you directions all building stops being on your side.
 *
 * Split into beats rather than delivered as one speech. The threat is in the
 * last three words and they get their own line, held on an angry face — a
 * face this size takes a moment to finish changing, and running it on into
 * the sentence before it would throw the only line in the game that is about
 * the bucket.
 *
 * `brows: 'angry'` is the eyes leaning into each other; see createScreenLife.
 * `arms` is not set on any of these the way it is in controlRoom — this
 * machine is a cabinet in a wall and has nothing to cross.
 */
const WAKE_LINES = [
  { text: 'Oh.', hold: 1.6 },
  { text: 'You found the rest of me.', hold: 2.8 },
  { text: 'But now, I can finally leave that stupid wall.', hold: 3.4 },
  { text: 'And since you have done your work,', hold: 2.2, brows: 'angry' },
  { text: 'I have no use for you.', hold: 2.6, brows: 'angry', frown: true },
  { text: 'Or your friend.', hold: 3.2, brows: 'angry', frown: true },
];

/**
 * What it says on the way down the room.
 *
 * Three lines in twenty seconds, which is as much as anybody reads while
 * running backwards. They are all the same line really — it is telling you
 * the route does not help — and they exist so the thing behind you is still
 * the character you have been talking to rather than a shape. A monster that
 * stops talking the moment it becomes a monster was never the character.
 */
/**
 * What it says while it is chasing you: nothing.
 *
 * It had three lines on a loop — "Stay there", "There is nothing up there",
 * "I have been every screen in this building" — and they were the wrong
 * instrument for this part. The machine on the wall talks, at length, and that
 * is the scene: a thing in a screen explaining itself to you in a room you
 * cannot leave. Then the screen comes off the wall, and what comes through it
 * is not a character with an argument any more. A subtitle under an animal is
 * a subtitle under an animal.
 *
 * It also broke the one thing the chase is doing to you. Everything you can
 * hear in the back half of this building is a report on where the thing is —
 * the racking going over beside you, the rock shedding behind you, the cue
 * rising — and a voice track on top of that is the only sound in the mix that
 * is not telling you anything. It still screeches, it still breathes; it has
 * simply stopped making its case.
 *
 * `beast.start` takes its lines as an argument and already treats none as
 * none, so this is the absence of a list rather than a flag — see `script` in
 * screenBeast.js, which stays null and never asks the face to speak.
 */

/**
 * @param scene   the world
 * @param doorway where the lift room hands over: the far face of its door
 * @param player  for knowing when you are in here
 * @param camera  for the one shot this room stages — see screenScare.js
 * @param death   the screen that goes up when the thing in the wall has you
 * @param onChase called once, the frame it starts: the way back shuts
 * @param onCalm  called by reset, to put the way back the way it was
 */
export function createStorageRoom({ scene, doorway, player, camera, death, clearance, onChase, onCalm }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // Laid out from the doorway, so moving that moves the room.
  const near = doorway.x;
  const far = near + LENGTH;
  const floorY = doorway.y;
  const midZ = doorway.z;
  const minZ = midZ - WIDTH / 2;
  const maxZ = midZ + WIDTH / 2;
  const midX = (near + far) / 2;
  const crown = floorY + HEIGHT;

  // ------------------------------------------------------------- materials ---

  const wallSurface = makeWallSurface(...worldRepeat(LENGTH, HEIGHT), WALL_TINT);
  const wallOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL_TINT,
      metalness: 0,
    });
  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(4, 2), '#4b4e46'),
    metalness: 0.5,
    roughness: 0.6,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#232519', roughness: 0.85, metalness: 0.3 });
  const crateMat = new THREE.MeshStandardMaterial({
    ...makeWoodSurface(2, 1),
    roughness: 0.92,
    metalness: 0,
  });

  // ----------------------------------------------------------------- shell ---

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(LENGTH, WIDTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(LENGTH, WIDTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  /**
   * Flat, and turned no further than that.
   *
   * There was a second rotation here, a quarter turn about z, and it is worth
   * saying what it did because it did not look like a missing floor. The plane
   * is authored LENGTH across by WIDTH deep; the quarter turn swapped those,
   * so the slab lay 20 along the room's 28 of length and 28 across its 20 of
   * width — four metres short at each end and four metres through each side
   * wall. The ends it was short of are the two you stand in: the doorway you
   * come through and the machine you walk up to. You could stand there,
   * because the collider below is the full footprint, so it read as the floor
   * failing to draw rather than as the floor being the wrong shape.
   *
   * Every other room in this project does `rotation.x` alone and authors the
   * plane as (x-extent, z-extent). See giantHall, liftTower, controlRoom.
   */
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, floorY, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(LENGTH, WIDTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(LENGTH, WIDTH)),
      color: '#2a2c26',
      metalness: 0,
    })
  );
  // Same again, and it had the same quarter turn in it — so the ceiling was
  // missing over the door and over the machine too, which nobody noticed
  // because there is no light up there until the thing is on.
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, crown, midZ);
  group.add(ceiling);

  // The floor as a thing to stand on, and the lid as a thing to stop your head.
  solid(near, far, minZ, maxZ, { top: floorY, bottom: floorY - 0.6 });
  solid(near, far, minZ, maxZ, { bottom: crown });

  const panel = (material, w, h, px, py, pz, ry) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const mid = floorY + HEIGHT / 2;
  // The near wall, in three pieces round the way in — the same way every wall
  // with a hole in it is built in this game.
  const inLow = midZ - doorway.width / 2;
  const inHigh = midZ + doorway.width / 2;
  for (const [w, h, pz, py] of [
    [inLow - minZ, HEIGHT, (minZ + inLow) / 2, mid],
    [maxZ - inHigh, HEIGHT, (inHigh + maxZ) / 2, mid],
    [doorway.width, HEIGHT - doorway.height, midZ, floorY + doorway.height + (HEIGHT - doorway.height) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, near, py, pz, Math.PI / 2);
  }
  panel(wallOf(WIDTH, HEIGHT), WIDTH, HEIGHT, far, mid, midZ, -Math.PI / 2);
  panel(wallOf(LENGTH, HEIGHT), LENGTH, HEIGHT, midX, mid, maxZ, Math.PI);

  // The -z wall, in four pieces round the transfer opening — the same way
  // every wall with a hole in it is built in this game, with one more piece
  // than usual because this hole has floor under it as well as wall over it.
  const upLow = near + WAY_UP.from;
  const upHigh = upLow + WAY_UP.wide;
  const upTop = floorY + WAY_UP.sill + WAY_UP.high;
  for (const [w, h, px, py] of [
    [upLow - near, HEIGHT, (near + upLow) / 2, mid],
    [far - upHigh, HEIGHT, (upHigh + far) / 2, mid],
    [WAY_UP.wide, WAY_UP.sill, (upLow + upHigh) / 2, floorY + WAY_UP.sill / 2],
    [WAY_UP.wide, crown - upTop, (upLow + upHigh) / 2, (upTop + crown) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, px, py, minZ, 0);
  }

  /**
   * And the walls as things you cannot walk through.
   *
   * Every one carries a `bottom`, which a wall standing on a floor does not
   * normally need — but this floor is seventy-two metres up over the rooms you
   * climbed to get here, and a box with no `bottom` is solid at every height
   * below itself. Without it these are four slabs standing in the giant hall.
   * See liftTower.js, which learned it the expensive way.
   */
  for (const [a, b, c, d] of [
    [near - 0.3, near, minZ, inLow],
    [near - 0.3, near, inHigh, maxZ],
    [far, far + 0.3, minZ, maxZ],
    [near - 0.3, upLow, minZ - 0.3, minZ],
    [upHigh, far + 0.3, minZ - 0.3, minZ],
    [near - 0.3, far + 0.3, maxZ, maxZ + 0.3],
  ]) {
    solid(a, b, c, d, { bottom: floorY });
  }
  // The lintel over the way in, so you cannot climb the doorway's head.
  solid(near - 0.3, near, inLow, inHigh, { bottom: floorY + doorway.height });
  /**
   * And the transfer opening's own two: the wall under its sill, and the wall
   * over its head.
   *
   * The one under the sill carries a `top` as well as a `bottom`, which looks
   * like belt and braces on a piece of wall and is not. Without the `top` it
   * is solid from the floor to the sky and the hole is not a hole; without
   * the `bottom` it is solid downwards through four rooms. It is the only box
   * in this building that genuinely needs both, because it is the only one
   * with somewhere above it and somewhere below it that are both real.
   */
  solid(upLow, upHigh, minZ - 0.3, minZ, { top: floorY + WAY_UP.sill, bottom: floorY });
  solid(upLow, upHigh, minZ - 0.3, minZ, { bottom: upTop });

  // --------------------------------------------------------------- storage ---

  /**
   * Racking, in two runs down the length with an aisle between them.
   *
   * The aisle is what makes this a room you walk *down* rather than a box with
   * things in it: you come in at one end, the machine is at the other, and
   * everything between the two is shelving taller than you with the lane
   * running straight at it. It also hides the far end until you are committed,
   * which is the only staging this room gets.
   */
  const RACK = { high: 6.2, deep: 1.2, long: 5.6, aisle: 8.0, shelves: 4, gangway: 2.4 };

  /**
   * Where the bays go, worked out from the room rather than counted by hand.
   *
   * The run starts five metres in, so you are in the room before you are in
   * the racking, and stops an apron short of the machine. The apron is the
   * point of the length: you walk the lane between shelving taller than you,
   * come out of it into nine metres of clear floor, and the thing is across
   * the whole wall in front of you with one button on the ground. The button
   * used to stand between the racking runs, which made it furniture.
   *
   * `bays` is however many whole ones fit, and n of them measure n*long plus
   * the n-1 gaps between — not n*pitch, which is a gap too many and silently
   * drops the last bay that would have fitted.
   */
  const APRON = 9.2;
  const bayPitch = RACK.long + 0.6;
  const runFrom = near + 5.0;
  const runTo = far - RIG.deep - APRON;
  const bays = Math.max(1, Math.floor((runTo - runFrom + 0.6) / bayPitch));

  /**
   * Two lanes a side, because the room got wider and one did not reach.
   *
   * At twenty across, a single run either side of the aisle very nearly met
   * the walls. At twenty-six it leaves four metres of swept floor behind it,
   * and racking with bare floor behind it reads as a set with the back
   * missing. The second lane stands off the first by a cross-gangway, which is
   * how a warehouse is actually laid out and, more to the point, is what makes
   * the width legible: you can see past the near run into another one.
   *
   * The outer lane is stocked on its bottom shelves only. Nobody picks the
   * back of a warehouse, and it is also four hundred boxes nobody will stand
   * close enough to count.
   */
  const lanes = [
    RACK.aisle / 2 + RACK.deep / 2,
    RACK.aisle / 2 + RACK.deep + RACK.gangway + RACK.deep / 2,
  ];

  /**
   * A cross-aisle through the -z side, which is the only way to the stair.
   *
   * Without it the stair is behind two lanes of racking and a run of block
   * stacking, and the only approach is whatever gaps happen to fall between
   * them. That is not a hard route, it is an absent one: a run at it ends
   * with you held against a pallet at full speed while the thing closes, and
   * the first measured run of this chase did exactly that for four seconds.
   *
   * So one bay is missing from both -z lanes and the stacking behind them
   * stands clear of the same strip. The gap is lined up on the foot of the
   * stair rather than on anything in the racking's own grid, because what it
   * is for is being able to see the way out from the middle of the aisle.
   */
  const CROSS = { from: near + 10.6, to: near + 17.4 };
  const crossed = (low, high) => high > CROSS.from && low < CROSS.to;

  const rackLamps = [];
  /**
   * Every bay, as something that can be put on the floor.
   *
   * Each one is its own group standing at its own base, so knocking it over
   * is one rotation rather than twenty positions. That is the only reason the
   * bays are grouped at all, and it is worth the indirection: the shelving
   * going over is how you know how far back the thing is once you have
   * stopped daring to turn round. See `wreck` and screenBeast.js.
   */
  const rackBays = [];
  for (const side of [-1, 1]) {
   for (const [lane, reach] of lanes.entries()) {
    const rz = midZ + side * reach;
    for (let bay = 0; bay < bays; bay++) {
      const bx = runFrom + bay * bayPitch + RACK.long / 2;
      // The cross-aisle to the stair goes through this side.
      if (side < 0 && crossed(bx - RACK.long / 2, bx + RACK.long / 2)) continue;
      // Everything below is local to the foot of this bay.
      const stand = new THREE.Group();
      stand.position.set(bx, floorY, rz);
      group.add(stand);

      // Uprights, and shelves between them. Boxes rather than a solid block,
      // because a rack you can see through is the only way the aisle reads as
      // being between two of something.
      for (const end of [-1, 1]) {
        for (const d of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, RACK.high, 0.1), dark);
          post.position.set(
            end * (RACK.long / 2 - 0.08),
            RACK.high / 2,
            d * (RACK.deep / 2 - 0.08)
          );
          post.castShadow = true;
          stand.add(post);
        }
      }
      for (let s = 0; s < RACK.shelves; s++) {
        const sy = 0.5 + s * ((RACK.high - 0.7) / (RACK.shelves - 1));
        const shelf = new THREE.Mesh(
          new THREE.BoxGeometry(RACK.long, 0.08, RACK.deep),
          steel
        );
        shelf.position.set(0, sy, 0);
        shelf.castShadow = true;
        shelf.receiveShadow = true;
        stand.add(shelf);

        // What is on it. Deterministic from the bay and shelf, like everything
        // else in this project — a room that is a different room every boot is
        // a room nobody can report a bug in.
        const n = lane > 0 && s > 1 ? 0 : 3 + ((bay * 7 + s * 3 + (side + 1) + lane * 5) % 3);
        for (let i = 0; i < n; i++) {
          const h = 0.42 + (((bay + s + i + lane) * 37) % 5) * 0.08;
          const w = 0.5 + (((bay * 3 + i + lane * 2) * 29) % 4) * 0.13;
          const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, RACK.deep - 0.3), crateMat);
          box.position.set(
            -RACK.long / 2 + 0.45 + i * (RACK.long - 0.9) / Math.max(1, n - 1),
            sy + 0.04 + h / 2,
            (((i * 13) % 3) - 1) * 0.06
          );
          box.rotation.y = (((bay + i) % 5) - 2) * 0.03;
          box.castShadow = true;
          box.receiveShadow = true;
          stand.add(box);
        }
      }

      // One box, floor to the top shelf. The rack is scenery and the point of
      // it is the aisle; a shelf-by-shelf collider is sixty boxes to let you
      // stand on something nobody can reach anyway.
      const standing = { down: false };
      solid(bx - RACK.long / 2, bx + RACK.long / 2, rz - RACK.deep / 2, rz + RACK.deep / 2, {
        top: floorY + RACK.high,
        bottom: floorY,
        enabled: () => !standing.down,
      });

      // A strip light under the top shelf of each bay, dead until the machine
      // is. An unlit plane rather than a lamp: there are sixty-two
      // forward-rendered lights in this scene and ten more for ten bays would
      // be the most expensive decoration in the game.
      const tube = new THREE.Mesh(
        new THREE.PlaneGeometry(RACK.long - 0.5, 0.1),
        new THREE.MeshBasicMaterial({ color: '#141611', toneMapped: false })
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, RACK.high - 0.06, -side * (RACK.deep / 2 - 0.2));
      stand.add(tube);
      rackLamps.push({
        tube,
        at: (bay + (side > 0 ? 0.5 : 0) + lane * 0.25) / bays,
        level: 0,
      });
      rackBays.push({ stand, standing, tube, x: bx, z: rz, side, tip: 0 });
    }
   }
  }

  /**
   * Knocking them over, which is the only damage model in this game.
   *
   * No physics and no debris: the bay leans away from the aisle on its own
   * base and stops. Away rather than into, because a rack that fell into the
   * lane would be a chase that blocks its own route, and the thing behind you
   * is already quite enough of an obstacle.
   *
   * `wreck` is handed the position of whatever is doing the knocking. The box
   * it tests is wide in z and narrow in x on purpose: the thing coming down
   * this room is eleven and a half metres across and travelling lengthways,
   * so it takes out everything beside it at once and nothing in front.
   */
  const RUIN = { reach: 2.4, across: 9.0, lean: 0.92, fall: 2.6 };
  const wreck = (at) => {
    for (const bay of rackBays) {
      if (bay.standing.down) continue;
      if (Math.abs(at.x - bay.x) > RUIN.reach) continue;
      if (Math.abs(at.z - bay.z) > RUIN.across) continue;
      bay.standing.down = true;
      playSpikeGrind(0.5);
    }
  };

  /**
   * And block-stacked pallets down the outside, filling the last of the width.
   *
   * Between the outer racking and the wall there is four metres, which is too
   * much to leave swept and not enough for a third lane of shelving. Stacked
   * crates are what is actually in that strip in a real shed — the stuff that
   * does not need picking — and they cost three boxes each instead of a bay's
   * twenty. Deterministic from the index, like everything else in here.
   */
  const stackZ = WIDTH / 2 - 1.05;
  const stackPitch = 3.4;
  const stacks = Math.max(1, Math.floor((runTo - runFrom) / stackPitch));
  for (const side of [-1, 1]) {
    for (let i = 0; i < stacks; i++) {
      const sx = runFrom + 0.6 + i * stackPitch + 1.2;
      const sz = midZ + side * stackZ;
      // The -z wall carries the stair up to the transfer opening, and the
      // cross-aisle runs down to the foot of it. Several of these stand in
      // one or the other.
      const stairLow = near;
      const stairHigh = near + STAIR.from + STAIR.wide / 2;
      if (side < 0 && sx + 1.0 > stairLow - 0.7 && sx - 1.0 < stairHigh + 0.7) continue;
      if (side < 0 && crossed(sx - 1.0, sx + 1.0)) continue;
      const tall = 2 + ((i * 11 + (side + 1)) % 2);
      let up = 0;
      for (let c = 0; c < tall; c++) {
        const h = 0.7 + (((i + c) * 23) % 3) * 0.16;
        const w = 1.9 - (((i * 5 + c) * 17) % 3) * 0.18;
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.0), crateMat);
        box.position.set(sx + (((i + c) % 3) - 1) * 0.07, floorY + up + h / 2, sz);
        box.rotation.y = (((i + c) % 5) - 2) * 0.02;
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
        up += h;
      }
      solid(sx - 1.0, sx + 1.0, sz - 1.0, sz + 1.0, { top: floorY + up, bottom: floorY });
    }
  }

  /**
   * Pallets and crates down the edges of the lane, so the floor is not swept.
   *
   * Kept off the racking and off the apron. Both are easy to get wrong now
   * that the lane is wider and the room is longer: this list was written for a
   * five-metre aisle in a twenty-eight metre shed, and left as it was, two of
   * these stood inside the new shelving and two stood on the clear floor in
   * front of the machine, which is the one piece of floor in here that is
   * meant to be clear.
   */
  for (const [px, pz, w, h, d, ry] of [
    [near + 3.2, midZ - 3.0, 1.3, 0.9, 1.1, 0.2],
    [near + 3.6, midZ + 3.1, 1.0, 0.65, 0.95, -0.12],
    [near + 2.6, midZ + 2.6, 0.8, 0.5, 0.8, 0.34],
    [runFrom + 9.4, midZ + 2.9, 1.4, 1.0, 1.2, -0.08],
    [runTo - 6.2, midZ + 3.0, 1.1, 0.75, 1.0, 0.26],
    [runTo - 2.4, midZ - 3.1, 1.2, 0.85, 1.05, 0.14],
  ]) {
    /**
     * Nothing of this stands in the mouth of the cross-aisle.
     *
     * One of them did: a metre-high crate across the turning, which is four
     * centimetres over the free step, so the only way past it was a jump. In
     * a chase, at full speed, in the dark, with the turning being the thing
     * you are trying to find. Three measured runs ended against it in exactly
     * the same place.
     *
     * The one that was there has been moved to the other side of the aisle
     * rather than deleted — the clutter is doing a job — and this guard
     * stands behind that so the next thing added to the list cannot put it
     * back.
     */
    if (pz < midZ && crossed(px - w / 2, px + w / 2)) continue;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
    box.position.set(px, floorY + h / 2, pz);
    box.rotation.y = ry;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    solid(px - w / 2, px + w / 2, pz - d / 2, pz + d / 2, { top: floorY + h, bottom: floorY });
  }

  /**
   * The stair of pallets up to the transfer opening.
   *
   * Six blocks against the -z wall, each one a step higher than the last, and
   * each one drawn as a stack of crates rather than as a block because a
   * solid ramp of wood is a ramp and these are supposed to look like
   * somebody's answer to a problem rather than like architecture.
   *
   * Flush with the wall, so the top of the last one *is* the sill: you walk up
   * and keep walking. A top step short of the opening would be a jump, and
   * see WAY_UP for why nothing about leaving this room is a jump.
   */
  for (let i = 0; i < STAIR.steps; i++) {
    const top = (i + 1) * STAIR.rise;
    const sx = near + STAIR.from - i * STAIR.wide;
    const sz = minZ + STAIR.deep / 2;
    for (let c = 0; c <= i; c++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(STAIR.wide - 0.08, STAIR.rise, STAIR.deep - 0.1),
        crateMat
      );
      crate.position.set(
        sx + (((i + c) % 3) - 1) * 0.05,
        floorY + c * STAIR.rise + STAIR.rise / 2,
        sz + (((i * 3 + c) % 3) - 1) * 0.06
      );
      crate.rotation.y = (((i + c) % 5) - 2) * 0.012;
      crate.castShadow = true;
      crate.receiveShadow = true;
      group.add(crate);
    }
    solid(sx - STAIR.wide / 2, sx + STAIR.wide / 2, minZ, minZ + STAIR.deep, {
      top: floorY + top,
      bottom: floorY,
    });
  }

  /**
   * And a landing at the top of it, filling the corner.
   *
   * The top step is 1.8 long and you run at 5.6, which is one and a half
   * steps' worth of stopping distance past the end of it — so the first run
   * of this chase went up the stair, off the far end of the top step, three
   * and a half metres back down to the floor, and into the corner with the
   * thing arriving. A stair whose top is a ledge you overshoot is a stair
   * that kills you for running up it, which is the one thing you are supposed
   * to do.
   *
   * So the last tread runs to the end wall. Overshooting now walks you into
   * the corner at sill height with the opening beside you, which is a mistake
   * you can turn round out of rather than fall off.
   */
  const landTo = near + STAIR.from - (STAIR.steps - 1) * STAIR.wide - STAIR.wide / 2;
  const landTop = STAIR.steps * STAIR.rise;
  for (let c = 0; c < STAIR.steps; c++) {
    for (const half of [0, 1]) {
      const wide = (landTo - near) / 2;
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(wide - 0.08, STAIR.rise, STAIR.deep - 0.1),
        crateMat
      );
      crate.position.set(
        near + wide / 2 + half * wide,
        floorY + c * STAIR.rise + STAIR.rise / 2,
        minZ + STAIR.deep / 2 + (((c + half) % 3) - 1) * 0.05
      );
      crate.castShadow = true;
      crate.receiveShadow = true;
      group.add(crate);
    }
  }
  solid(near, landTo, minZ, minZ + STAIR.deep, { top: floorY + landTop, bottom: floorY });

  /**
   * And the cross-aisle painted on the floor, running to the foot of it.
   *
   * The stair is lit by nothing and so is the lane to it, and both of them
   * have to be findable from the middle of the room by somebody who is
   * running. This is the tall room's answer again — an unlit plane carries
   * its own colour and costs no light — and it is the same amber, because
   * by now that colour means "this is the way through" in three rooms.
   */
  const laneX = (CROSS.from + CROSS.to) / 2;
  const laneFrom = midZ - RACK.aisle / 2;
  const laneTo = minZ + STAIR.deep;
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, laneFrom - laneTo),
    new THREE.MeshBasicMaterial({ color: '#8a6f22', toneMapped: false })
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(laneX, floorY + 0.006, (laneFrom + laneTo) / 2);
  group.add(lane);
  // And a bar across the top of it, square in the aisle, so it reads as a
  // turning rather than as a scuff running under the shelving.
  const head = new THREE.Mesh(
    new THREE.PlaneGeometry(CROSS.to - CROSS.from - 1.4, 0.3),
    new THREE.MeshBasicMaterial({ color: '#8a6f22', toneMapped: false })
  );
  head.rotation.x = -Math.PI / 2;
  head.position.set(laneX, floorY + 0.006, laneFrom);
  group.add(head);

  /**
   * And a strip of paint up the steps, because in the dark they are crates.
   *
   * The same unlit-plane trick the refuges in the tall room use, and for the
   * same reason: this is the one feature in a room full of stacked boxes that
   * has to be legible as a route before anybody is looking for a route. It is
   * on from the moment you walk in.
   */
  for (let i = 0; i < STAIR.steps; i++) {
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(STAIR.wide - 0.5, 0.16),
      new THREE.MeshBasicMaterial({ color: '#8a6f22', toneMapped: false })
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(
      near + STAIR.from - i * STAIR.wide,
      floorY + (i + 1) * STAIR.rise + 0.006,
      minZ + STAIR.deep - 0.4
    );
    group.add(mark);
  }

  // ------------------------------------------------------------ the machine ---

  const rigX = far - RIG.deep / 2;

  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(RIG.deep, RIG.high, RIG.bank),
    new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(...metalRepeat(RIG.bank, RIG.high), '#555851'),
      metalness: 0.35,
      roughness: 0.62,
    })
  );
  cabinet.position.set(rigX, floorY + RIG.high / 2, midZ);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  group.add(cabinet);

  solid(far - RIG.deep, far, midZ - RIG.bank / 2, midZ + RIG.bank / 2, {
    top: floorY + RIG.high,
    bottom: floorY,
  });

  // The screen: a dead tube until it is not. Recessed, with a bezel proud of
  // it on all sides, which is the television's own construction at scale.
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, RIG.screen.high + 0.5, RIG.screen.wide + 0.5),
    new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(2, 1, '#84847d'),
      metalness: 0.15,
    })
  );
  bezel.position.set(far - RIG.deep - 0.08, floorY + RIG.screen.at, midZ);
  bezel.castShadow = true;
  group.add(bezel);

  const screenMat = new THREE.MeshBasicMaterial({ color: '#07080a', toneMapped: false });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(RIG.screen.wide, RIG.screen.high),
    screenMat
  );
  screen.position.set(far - RIG.deep - 0.2, floorY + RIG.screen.at, midZ);
  screen.rotation.y = -Math.PI / 2;
  group.add(screen);

  /**
   * And the face on it, which is the face.
   *
   * Scaled as a group and not rebuilt — same eyes, same three mouth steps,
   * same everything. The group is drawn in the +z plane, so it is turned to
   * face back down the room the way the screen is.
   */
  const { group: faceGroup, eyes, mouth, faceParts } = buildScreenFace();
  faceGroup.scale.setScalar(FACE_SCALE);
  faceGroup.rotation.y = -Math.PI / 2;
  faceGroup.position.set(far - RIG.deep - 0.24, floorY + RIG.screen.at, midZ);
  faceGroup.visible = false;
  group.add(faceGroup);

  /**
   * And the hole it leaves, which is only ever seen from behind.
   *
   * Hidden until the screen tears out. It is not much — a black plane set
   * back inside the cabinet with the broken fixings round it — but without it
   * the far wall after the breakout is a cabinet with nothing wrong with it,
   * which contradicts the thing that is currently chasing you.
   */
  const wound = new THREE.Group();
  wound.visible = false;
  group.add(wound);
  const cavity = new THREE.Mesh(
    new THREE.PlaneGeometry(RIG.screen.wide + 0.4, RIG.screen.high + 0.4),
    new THREE.MeshBasicMaterial({ color: '#05060a', toneMapped: false })
  );
  cavity.position.set(far - RIG.deep + 0.1, floorY + RIG.screen.at, midZ);
  cavity.rotation.y = -Math.PI / 2;
  wound.add(cavity);
  for (let i = 0; i < 14; i++) {
    const stub = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.26 + ((i * 19) % 4) * 0.2, 0.34),
      dark
    );
    const along = (i / 13 - 0.5) * (RIG.screen.wide + 0.3);
    stub.position.set(
      far - RIG.deep - 0.05,
      floorY + RIG.screen.at + (i % 2 ? 1 : -1) * (RIG.screen.high / 2 + 0.1),
      midZ + along
    );
    stub.rotation.x = (((i * 11) % 5) - 2) * 0.16;
    wound.add(stub);
  }

  // Its own glow thrown back down the shed. One light, off until it wakes.
  const glow = new THREE.PointLight(FACE, 0, 16, 1.8);
  glow.position.set(far - RIG.deep - 1.4, floorY + RIG.screen.at, midZ);
  group.add(glow);

  // Cabinet lamps either side of the screen: two columns of dead planes that
  // come up in a run when it boots, so the machine has something to be doing
  // that is not its face.
  const bankLamps = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const lamp = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.12),
        new THREE.MeshBasicMaterial({ color: '#15110c', toneMapped: false })
      );
      lamp.rotation.y = -Math.PI / 2;
      lamp.position.set(
        far - RIG.deep - 0.02,
        floorY + 1.0 + i * ((RIG.high - 2.0) / 8),
        midZ + side * (RIG.screen.wide / 2 + 1.3)
      );
      group.add(lamp);
      bankLamps.push({ lamp, at: i / 8 });
    }
  }

  /**
   * Real lamps over the aisle, and as few as will actually reach.
   *
   * Every strip on the racking is an unlit plane, which is this building's
   * answer to lighting what it cannot afford to light — but a plane lights
   * nothing, and a shed whose only light source is the face at the far end is
   * a shed you cannot see the middle of. This is the difference between a room
   * that turns on and a room that merely stops being black at one end.
   *
   * There was one, and one was right for twenty-eight metres under seven of
   * head. Forty-six metres under ten is past what a single point light covers:
   * the fall-off that lit the old floor from six and a half metres up arrives
   * at ten with nothing left, and the ends of the lane stayed dark on a room
   * that was supposed to have come on. Derived from LENGTH at one per sixteen
   * metres — three, here — which is the fewest that reaches rather than a row.
   *
   * It is still the expensive decision in this file. Each of these shades
   * every fragment of every surface in a forward renderer, and a lamp per bay
   * would cost more than everything else in the building put together. They
   * come up with the strips, travelling away from the button, so they read as
   * the racking lighting rather than as themselves.
   */
  const aisleLamps = [];
  const lampCount = Math.max(1, Math.round(LENGTH / 16));
  for (let i = 0; i < lampCount; i++) {
    const at = (i + 0.5) / lampCount;
    const lamp = new THREE.PointLight(0xd2d8c0, 0, 34, 1.5);
    lamp.position.set(near + LENGTH * (0.1 + at * 0.8), crown - 0.6, midZ);
    group.add(lamp);
    aisleLamps.push({ lamp, at });
  }

  // Cable trays out of the top of it and away across the ceiling, so it is
  // plugged into the building rather than standing in it.
  for (const off of [-6.0, -2.0, 2.0, 6.0]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(LENGTH * 0.62, 0.12, 0.34), dark);
    tray.position.set(far - LENGTH * 0.31, crown - 0.22, midZ + off);
    group.add(tray);
  }

  // ------------------------------------------------------------- the button ---

  /**
   * One control, and it is enormous.
   *
   * In the middle of the aisle, square in front of the machine, because the
   * room has exactly one thing to do and hiding it would make this a search
   * rather than an arrival. The size is the joke and the instruction at once:
   * everything else in this building is worked by standing on something or by
   * being the other body, and this is a button you hit with your hand.
   */
  const buttonX = far - 7.5;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(BUTTON.base / 2, BUTTON.base / 2 + 0.12, BUTTON.rise, 20),
    steel
  );
  base.position.set(buttonX, floorY + BUTTON.rise / 2, midZ);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(BUTTON.cap / 2 + 0.1, BUTTON.cap / 2 + 0.1, 0.1, 20),
    dark
  );
  collar.position.set(buttonX, floorY + BUTTON.rise + 0.05, midZ);
  group.add(collar);

  const capMat = new THREE.MeshStandardMaterial({ color: '#7d2a20', roughness: 0.55, metalness: 0.2 });
  const cap = new THREE.Group();
  cap.position.set(buttonX, floorY + BUTTON.rise + 0.1, midZ);
  group.add(cap);
  const capTop = new THREE.Mesh(
    new THREE.CylinderGeometry(BUTTON.cap / 2, BUTTON.cap / 2, BUTTON.dome, 20),
    capMat
  );
  capTop.position.y = BUTTON.dome / 2;
  capTop.castShadow = true;
  cap.add(capTop);
  const domeTop = new THREE.Mesh(
    new THREE.SphereGeometry(BUTTON.cap / 2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    capMat
  );
  domeTop.position.y = BUTTON.dome;
  domeTop.castShadow = true;
  cap.add(domeTop);

  // Hazard paint round the foot of it, in the one language this building has
  // for "this is the thing".
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BUTTON.base / 2 + 0.14, BUTTON.base / 2 + 0.75, 28),
    new THREE.MeshStandardMaterial({ ...makeHazardSurface(10, 1), roughness: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(buttonX, floorY + 0.006, midZ);
  group.add(ring);

  solid(
    buttonX - BUTTON.base / 2 - 0.12,
    buttonX + BUTTON.base / 2 + 0.12,
    midZ - BUTTON.base / 2 - 0.12,
    midZ + BUTTON.base / 2 + 0.12,
    { top: floorY + BUTTON.rise + BUTTON.at, bottom: floorY }
  );

  // -------------------------------------------------------------- the life ---

  const life = createScreenLife({ eyes, mouth, faceParts, glow, glowLevel: 3.4 });
  const motor = createLiftMotor();

  let awake = false;
  let since = -1;
  let said = false;
  let entered = false;
  let pressed = 0;
  let chasing = false;
  let chaseSince = 0;

  const inside = (x, z) => x > near && x < far && z > minZ && z < maxZ;

  /** The hole it has to fit through, which is also the hall's own front door. */
  const wayUp = {
    x: (upLow + upHigh) / 2,
    y: floorY + WAY_UP.sill,
    z: minZ,
    width: WAY_UP.wide,
    height: WAY_UP.high,
  };

  /**
   * The roof across the front of the machine.
   *
   * Built here and not in main.js because it is part of the breakout, and the
   * breakout is this room's: the cabinet shakes, the screen goes, the thing
   * comes forward and the ceiling comes down in front of it, all on one clock.
   * It stands against the face of the machine and fills the whole width of the
   * shed, so there is nothing to go round — see boulderDrop.js for why it is
   * rock and not another shutter.
   */
  const boulders = createBoulderDrop({
    scene,
    parent: group,
    colliders,
    player,
    x: far - RIG.deep - 0.2,
    z: midZ,
    width: WIDTH,
    floorY,
    ceilingY: crown,
    // The one thing in the apron the toe of it must not land on.
    clear: { x: buttonX, z: midZ, r: BUTTON.base / 2 + 0.4 },
  });

  const beast = createScreenBeast({
    scene,
    player,
    death,
    screen: RIG.screen,
    faceScale: FACE_SCALE,
    at: { x: far - RIG.deep - 0.2, y: floorY + RIG.screen.at, z: midZ },
    gate: { x: wayUp.x, y: wayUp.y + WAY_UP.high / 2, z: minZ },
    wreck,
    // Handed through rather than owned: this room is open enough that it has
    // no opinion about the thing's size, and every room that does have one is
    // on the other side of a wall it has not come through yet. See main.js,
    // which is the only place that knows the whole building.
    clearance,
    onCatch() {
      scare.start(beast);
    },
  });

  /**
   * And the shot that happens when it does.
   *
   * Owned here because this room owns the thing doing it, which is the same
   * arrangement the tall room has with seizure.js — a sequence lives with
   * whatever it is a sequence of, and the three of them are peers rather
   * than something held centrally. The catch used to be a bare `death.kill`,
   * which after fourteen seconds of being chased is the screen going black
   * on you with no idea what caught up.
   */
  const scare = createScreenScare({ scene, camera, player, death });

  /**
   * The breakout, which is one thing happening in two places.
   *
   * The screen on the wall and the screen chasing you are different objects —
   * see screenBeast.js — so the handover has to be staged from both ends and
   * on the same clock. BREAKOUT is that clock, exported from the beast so
   * there is only one of it: the cabinet shakes for `shake` seconds with
   * everything still on it, and on the frame that ends the wall's screen
   * goes out, the hole appears, and the beast is already coming forward
   * through the space it used to be in.
   */
  const startChase = () => {
    if (chasing) return;
    chasing = true;
    chaseSince = 0;
    beast.start();
    onChase?.();
    /**
     * And the one instruction, because this is the first thing in the game
     * that is faster than a walk.
     *
     * Everything else that comes after you in this building can be strolled
     * away from. Somebody who has got this far has had no reason to find the
     * run key, and a chase that kills you for not knowing a control is not a
     * chase, it is a quiz. So it says the word.
     */
    showNote('Run.', 2.4);
    setObjective('Run');
  };

  const wake = () => {
    if (awake) return;
    awake = true;
    since = 0;
    playButtonPress(1);
    playSpikeGrind(0.45);
    motor.start(0.8);
  };

  /**
   * The press, and it has to be re-armable.
   *
   * `once` is the registry's default and it is right: this is a button you
   * press one time. But `spent` is set on the target object and nothing in
   * the game ever clears it, which was fine for as long as a room's `reset`
   * only ever ran from the debug menu. It is not fine here. A death during
   * the chase puts you back in this room with everything wound back and the
   * one control in it permanently dead — you respawn into a shed you cannot
   * do anything in, which is the game over the death screen was supposed not
   * to be.
   *
   * So the target is held and un-spent by `reset` below. Every other room in
   * the project has the same latent fault and none of them has been bitten by
   * it yet, because none of them is somewhere you can die.
   */
  const pressTheButton = {
      position: new THREE.Vector3(buttonX, floorY + BUTTON.rise + 0.3, midZ),
      label: 'Turn it on',
      // Wide, because the thing is 1.9 across and you are standing against it
      // — a reach measured from the middle of a button this size has to clear
      // its own radius before it clears anything else.
      range: 2.6,
      facing: 0.25,
      once: true,
      enabled: () => !awake,
      onInteract() {
        pressed = 1;
        wake();
      },
  };
  const interactions = [pressTheButton];

  return {
    group,
    colliders,
    interactions,

    /** Whether a point is in this room, for whoever needs to know. */
    contains: (x, z) => inside(x, z),

    /** Just inside the door, looking down the aisle at it. */
    get entry() {
      return { position: [near + 2.2, floorY, midZ], yaw: -Math.PI / 2 };
    },

    /**
     * At the button, the way you are standing when you have just pressed it.
     *
     * Which is where you go when it kills you. Everything before this moment
     * in the room is a walk down a dark shed and a machine clearing its
     * throat: thirty-six metres, a lamp sequence and five lines of a thing
     * explaining itself, and none of it is the part you died to. The part you
     * died to starts when the screen tears, and that is what this is the
     * front row of.
     *
     * A metre and a half short of the button and facing it, so you are
     * looking at the machine when it comes apart — and clear of the apron,
     * which the roof is about to come down on. See `HOLD` and boulderDrop.js.
     */
    get atThePress() {
      return { position: [buttonX - 1.6, floorY, midZ], yaw: -Math.PI / 2 };
    },

    /** Whether it has been switched on, for a harness and for whatever asks. */
    get isAwake() {
      return awake;
    },

    /** Where the button is, for a harness and for the debug menu. */
    get button() {
      return { x: buttonX, y: floorY, z: midZ };
    },

    /** The transfer opening, for whatever is built on the other side of it. */
    get wayUp() {
      return { ...wayUp };
    },

    /** The thing out of the wall, for the hall that has to stop it. */
    beast,

    /** The shot it ends on, for a harness. */
    scare,

    /** The roof that comes in across the apron, for a harness and the menu. */
    boulders,

    /** Whether the chase is on, so a death knows which room it happened in. */
    get isChasing() {
      return chasing;
    },

    /** Standing at the foot of the stair, for a scene jump. */
    get atTheStair() {
      return {
        position: [near + STAIR.from + 2.4, floorY, minZ + STAIR.deep + 1.4],
        // Looking back down the shed at what is coming, which is the only
        // direction anybody standing here is looking.
        yaw: -Math.PI / 2,
      };
    },

    /**
     * Straight to the chase, with the machine counted as already said.
     *
     * For the scene jump and for a harness. It winds the wake sequence to
     * finished rather than skipping it, so the room the chase happens in is
     * the lit room with the face on the wall, which is the room the chase is
     * written for.
     */
    skipToChase() {
      if (chasing) return;
      wake();
      since = WAKE.speak + 0.01;
      said = true;
      /**
       * And you have already been in here, which is not a detail.
       *
       * `entered` is what gates the note and the objective you get for
       * walking in — and it is set inside `update`, which runs *after*
       * whoever called this has set an objective of their own. A reset
       * followed by this therefore put "Find the switch" on the screen one
       * frame into a chase, over the top of the "Run" that `startChase`
       * had just written, and the note about the racking in the dark played
       * while something was coming down the aisle at you.
       */
      entered = true;
      startChase();
    },

    /** How many bays are on the floor, for a harness. */
    get ruined() {
      return rackBays.filter((bay) => bay.standing.down).length;
    },

    reset() {
      awake = false;
      since = -1;
      said = false;
      entered = false;
      pressed = 0;
      chasing = false;
      chaseSince = 0;
      pressTheButton.spent = false;
      // Before the beast, because this is what hands the body and the view
      // back, and it is holding a reference to the thing being reset.
      scare.reset();
      beast.reset();
      boulders.reset();
      onCalm?.();
      wound.visible = false;
      bezel.visible = true;
      screen.visible = true;
      for (const part of [cabinet, bezel, screen, faceGroup]) part.position.z = midZ;
      for (const bay of rackBays) {
        bay.standing.down = false;
        bay.tip = 0;
        bay.stand.rotation.x = 0;
      }
      life.stop();
      motor.stop();
      faceGroup.visible = false;
      glow.intensity = 0;
      for (const { lamp } of aisleLamps) lamp.intensity = 0;
      screenMat.color.copy(DEAD_TUBE);
      cap.position.y = floorY + BUTTON.rise + 0.1;
      for (const { tube } of rackLamps) tube.material.color.copy(DEAD_STRIP);
      for (const { lamp } of bankLamps) lamp.material.color.copy(DEAD_PIP);
    },

    update(delta) {
      /**
       * While it has you, nothing else in this room is happening.
       *
       * The shot drives the beast itself — it has to, because the camera is
       * looking at it and a frame written before the thing moved is a frame
       * of where it was. So this returns rather than falling through to the
       * `beast.update` below, which would move it twice.
       */
      if (scare.isPlaying) {
        scare.update(delta);
        return;
      }

      const here = player.position;
      if (!entered && inside(here.x, here.z)) {
        entered = true;
        showNote('Racking, in the dark, as far back as the light goes.', 3.2);
        setObjective('Find the switch');
      }

      // The cap, pushed down and let back up. Not a toggle — it is one press
      // and the spring is the only part of it that happens afterwards.
      if (pressed > 0) {
        pressed = Math.max(0, pressed - delta * 2.2);
        cap.position.y = floorY + BUTTON.rise + 0.1 - 0.13 * Math.sin(pressed * Math.PI);
      }

      /**
       * The chase, on its own clock from the last word spoken.
       *
       * Two screens, one handover. The cabinet shakes with everything still
       * bolted to it for BREAKOUT.shake seconds, and on the frame that ends
       * the wall's screen goes out and the hole appears — which is the same
       * frame the beast starts coming forward through the space it was in.
       * One clock, exported from screenBeast.js, because two would drift and
       * the drift would be a second screen hanging in front of a first one.
       */
      if (chasing) {
        chaseSince += delta;
        if (chaseSince < BREAKOUT.shake) {
          // Growing, so the first half second is a noise and the last is
          // unmistakable.
          const q = Math.sin(chaseSince * 41) * 0.05 * (chaseSince / BREAKOUT.shake);
          for (const part of [cabinet, bezel, screen, faceGroup]) part.position.z = midZ + q;
        } else if (!wound.visible) {
          for (const part of [cabinet, bezel, screen, faceGroup]) part.position.z = midZ;
          bezel.visible = false;
          screen.visible = false;
          faceGroup.visible = false;
          wound.visible = true;
          glow.intensity = 0;
          life.stop();
        }
        // The shelving going over, which is the only thing in this room that
        // reports how far back it is without you turning round.
        for (const bay of rackBays) {
          if (!bay.standing.down || bay.tip >= 1) continue;
          bay.tip = Math.min(1, bay.tip + delta / RUIN.fall);
          bay.stand.rotation.x = bay.side * RUIN.lean * bay.tip * bay.tip;
          bay.tube.material.color.copy(DEAD_STRIP);
        }
      }
      beast.update(delta);

      /**
       * And the roof, after the thing rather than before it.
       *
       * Order matters on exactly one frame. `holdAt` is only accepted while
       * the beast is hunting, and the frame it starts hunting is the frame
       * BREAKOUT.free comes round inside `beast.update` — asked a line earlier
       * it is still coming out of the wall, the hold is dropped on the floor,
       * and twenty tonnes of rock lands in front of a thing that walks
       * straight through it.
       */
      boulders.update(delta);
      if (chasing) {
        if (!boulders.hasFallen && chaseSince >= BREAKOUT.free) {
          boulders.drop();
          /**
           * And only held if HOLD says so, which it no longer does.
           *
           * A metre in front of the back of the heap, so what comes over the
           * top of the rock is the face and not the whole animal. The box is
           * the half that made it worth anything: a hold is a plane and not
           * a cage, so clamped in x at the heap it tracked your z straight
           * out through the back wall of the building and the hold cost it
           * nothing. It is allowed to slide along the back of the rock
           * looking for you, four metres clear of each side wall, and none
           * of the height you gain going up the pallet stair.
           */
          if (HOLD > 0) {
            beast.holdAt(boulders.front + 1.0, HOLD, 'x', {
              z: [minZ + 4.0, maxZ - 4.0],
              y: [floorY + 3.0, floorY + 5.0],
            });
          }
        }
        // It stops being held and the heap gives on the same frame, because
        // they are the same event seen from either side of it.
        if (boulders.isDown && !boulders.isOpen && !beast.isHeld) {
          // Where it was when it got through, so the hole is under the thing
          // rather than in the middle of the heap: it spends the hold sliding
          // along the back of this looking for you, and eleven seconds of that
          // can leave it thirteen metres off centre.
          boulders.open(beast.position.z);
        }
      }

      if (!awake) return;
      since += delta;

      /**
       * The lamps, each on its own place in the run.
       *
       * `at` is how far down the shed a fitting is, nought to one, so the
       * light travels away from the button rather than arriving everywhere
       * at once. Eased in over a third of a second each — a row of planes
       * snapping to full is a row of planes, and the whole reason this is a
       * sequence is that it has to read as a machine coming up.
       */
      for (const fitting of rackLamps) {
        const t = (since - WAKE.lamps - fitting.at * 1.3) / 0.35;
        const level = Math.max(0, Math.min(1, t));
        fitting.tube.material.color.copy(DEAD_STRIP).lerp(LIVE_STRIP, level);
      }
      // The aisle with them, each on its own place in the same run, so the
      // lane lights along its length rather than all at once.
      for (const { lamp, at } of aisleLamps) {
        lamp.intensity = 34 * Math.max(0, Math.min(1, (since - WAKE.lamps - at * 1.3) / 1.4));
      }

      for (const fitting of bankLamps) {
        const t = (since - WAKE.bank - fitting.at * 0.7) / 0.25;
        const level = Math.max(0, Math.min(1, t));
        fitting.lamp.material.color.copy(DEAD_PIP).lerp(LIVE_PIP, level);
      }

      // The tube warming, then the face in it.
      const warm = Math.max(0, Math.min(1, (since - WAKE.screen) / 0.9));
      screenMat.color.copy(DEAD_TUBE).lerp(LIVE_TUBE, warm);
      if (since >= WAKE.face) faceGroup.visible = true;

      // And when it has finished saying it, it comes out of the wall. The
      // last line is the cue and nothing else is: a timer here would start
      // the chase over the top of the sentence that justifies it.
      if (!said && since >= WAKE.speak) {
        said = true;
        life.speak(WAKE_LINES, startChase);
      }

      // `lit` is the fade the screen is behind — full once the tube is warm,
      // and nothing before that, so the face does not blink in the dark.
      life.update(delta, since >= WAKE.face ? 1 : 0);
    },
  };
}
