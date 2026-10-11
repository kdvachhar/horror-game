import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  worldRepeat,
  metalRepeat,
  cloneSurface,
} from './textures.js';
import { playWardDoor, playSpikeGrind } from './audio.js';
import { showNote, setObjective } from './hud.js';

/**
 * The hall above the racking, and the only way out of the shed.
 *
 * It is a high-level transfer run: the opening it starts at is how pallets got
 * onto the top of the racking, the crates stepping up to it are how somebody
 * got up there to load them, and none of that is why you are going to use it.
 *
 * **It is sized off the thing chasing you and nothing else.** Thirteen across
 * and six and a half high, against a screen eleven and a half across and five
 * and a half high with its frame on. That is a hall you can see the far end of
 * from the near end and a hall the thing behind you fits down with half a
 * metre either side, which is the whole point: it does not get stuck at the
 * opening, it does not lose you at the corner, there is no corner. You get out
 * of here by being faster, and the room is built to make sure you know that
 * before you have finished climbing into it.
 *
 * **The shutter at the far end is the end of the chase.** It stands up until
 * you are nearly through it and comes down behind you, which is the one thing
 * in this hall that is not fair and is the reason the hall is survivable. See
 * SHUTTER.
 *
 * Not orientable: the opening faces -z and the hall is the space at -z of it.
 * See the top of controlRoom.js for why none of these are written to turn
 * round.
 */

/** The run. Long enough to be a chase, straight enough to be a bad one. */
const WIDE = 13;
const HIGH = 6.4;
const LONG = 42;

/**
 * The hole in the far end, which used to be a wall.
 *
 * Past the shutter this hall was the frontier of the building: a short landing
 * and a flat wall, because there was nothing to put behind it. There is now.
 *
 * It is a breach and not a door, and the difference is the whole of what the
 * next hour of this building is. A door is a thing somebody fitted, which
 * means somebody meant you to be able to leave; six metres of broken wall with
 * the rock still lying in it means the way on is a thing that happened to the
 * building rather than a thing it offers. You have just been chased through a
 * wall by something that came out of one. This is the room agreeing with that.
 */
const ONWARD = { wide: 6.0, high: 4.2 };

/**
 * The shutter, and why it is a cheat.
 *
 * The thing behind you is slower than a run and faster than a walk, so a
 * player who never stops never gets caught and a player who stops once is
 * dead. That is a fine rule for forty-two metres and a terrible one for ever:
 * without an end, the chase is a corridor that you are always losing and never
 * lose, which stops being frightening about nine seconds in.
 *
 * So the hall ends. `trip` is how far short of it the shutter starts coming
 * down and `fall` is how long it takes, tuned so that it is still visibly
 * moving as you go under it — a shutter that is already shut when you arrive
 * is a door, and a door is not an escape. The thing hits the other side of it.
 *
 * It is on a trigger and not on a timer, because a timer would be a second
 * race you cannot see the clock of.
 *
 * **Both numbers were wrong and the arithmetic says so.** They were a trip of
 * 9 and a fall of 1.15, and you run at 5.6: nine metres takes 1.61 seconds,
 * which is half a second after the shutter has finished landing. Nobody has
 * ever got under this. It did not show for two weeks because the far side of
 * it was a blank wall — being stopped by the shutter and being stopped by the
 * end of the building are the same experience, right up to the moment there
 * is a building on the other side.
 *
 * So: a longer fall and a shorter run at it. Seven metres is 1.25 seconds,
 * by which point the slab is a third of the way down and there are four
 * metres of air under it; it lands two thirds of a second after you are
 * through. The other half of the fix is that the shutter's collider now
 * follows the slab — see `bottom`, below.
 */
const SHUTTER = { trip: 7.0, fall: 1.9, thick: 0.42 };

const WALL_TINT = '#3c4039';
const FLOOR_TINT = '#32342d';
/** Dead and live, as colours rather than numbers — see storageRoom.js. */
const DEAD_STRIP = new THREE.Color('#131510');
const LIVE_STRIP = new THREE.Color('#9fb089');

/**
 * @param scene   the world
 * @param doorway the opening it hangs off: { x, y, z, width, height }
 * @param player  for knowing where you are and when you are nearly out
 * @param onSeal  called once, the frame the shutter starts coming down
 */
export function createTransferHall({ scene, doorway, player, onSeal }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // Laid out from the opening, so moving that moves the hall.
  const head = doorway.z;
  const foot = head - LONG;
  const midZ = (head + foot) / 2;
  const midX = doorway.x;
  const minX = midX - WIDE / 2;
  const maxX = midX + WIDE / 2;
  const floorY = doorway.y;
  const crown = floorY + HIGH;

  // ------------------------------------------------------------- materials ---

  const wallSurface = makeWallSurface(...worldRepeat(LONG, HIGH), WALL_TINT);
  const wallOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL_TINT,
      metalness: 0,
    });
  const dark = new THREE.MeshStandardMaterial({ color: '#202218', roughness: 0.88, metalness: 0.3 });

  // ----------------------------------------------------------------- shell ---

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDE, LONG),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(WIDE, LONG)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  // Flat and nothing else. See the note on the storage room's floor for what
  // the second rotation did there.
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, floorY, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDE, LONG),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(WIDE, LONG)),
      color: '#282a24',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, crown, midZ);
  group.add(ceiling);

  solid(minX, maxX, foot, head, { top: floorY, bottom: floorY - 0.6 });
  solid(minX, maxX, foot, head, { bottom: crown });

  const panel = (material, w, h, px, py, pz, ry) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const mid = floorY + HIGH / 2;
  panel(wallOf(LONG, HIGH), LONG, HIGH, minX, mid, midZ, Math.PI / 2);
  panel(wallOf(LONG, HIGH), LONG, HIGH, maxX, mid, midZ, -Math.PI / 2);

  /**
   * The far end, in three pieces round the breach.
   *
   * Same shape as the near end and for the same reason: two returns and a
   * head. What is left of a thirteen metre wall with a six metre hole in it.
   */
  const outLow = midX - ONWARD.wide / 2;
  const outHigh = midX + ONWARD.wide / 2;
  for (const [w, h, px, py] of [
    [outLow - minX, HIGH, (minX + outLow) / 2, mid],
    [maxX - outHigh, HIGH, (outHigh + maxX) / 2, mid],
    [ONWARD.wide, HIGH - ONWARD.high, midX, floorY + ONWARD.high + (HIGH - ONWARD.high) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, px, py, foot, 0);
  }

  /**
   * The near end, in three pieces round the way in.
   *
   * The hall is thirteen across and the opening is eleven and a half, so these
   * are two narrow returns and a head — not much wall, but it is the thing
   * that makes the opening read as a hole into somewhere rather than as the
   * end of the shed being open.
   */
  const inLow = doorway.x - doorway.width / 2;
  const inHigh = doorway.x + doorway.width / 2;
  for (const [w, h, px, py] of [
    [inLow - minX, HIGH, (minX + inLow) / 2, mid],
    [maxX - inHigh, HIGH, (inHigh + maxX) / 2, mid],
    [doorway.width, HIGH - doorway.height, midX, floorY + doorway.height + (HIGH - doorway.height) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, px, py, head, Math.PI);
  }

  /**
   * And the walls as things you cannot walk through.
   *
   * Every one carries a `bottom`. This floor is seventy-six metres up over
   * four rooms, and a box with no `bottom` is solid at every height below
   * itself — without them these are slabs standing in the giant hall. See
   * liftTower.js, which learned it the expensive way.
   */
  for (const [a, b, c, d] of [
    [minX - 0.3, minX, foot - 0.3, head + 0.3],
    [maxX, maxX + 0.3, foot - 0.3, head + 0.3],
    [minX - 0.3, outLow, foot - 0.3, foot],
    [outHigh, maxX + 0.3, foot - 0.3, foot],
    [minX, inLow, head, head + 0.3],
    [inHigh, maxX, head, head + 0.3],
  ]) {
    solid(a, b, c, d, { bottom: floorY });
  }
  // The heads over the two openings, so each has a top from this side too.
  solid(inLow, inHigh, head, head + 0.3, { bottom: floorY + doorway.height });
  solid(outLow, outHigh, foot - 0.3, foot, { bottom: floorY + ONWARD.high });

  // ----------------------------------------------------------- the fitting ---

  /**
   * Strip lights down both sides, dead until the thing comes through the wall.
   *
   * Unlit planes, which is this building's answer to lighting what it cannot
   * afford to light — but a plane lights nothing, so there are three real
   * lamps down the middle on top of them. Three is as few as reaches forty-two
   * metres and this is the one room in the game where not being able to see
   * the end of it would be a bug rather than an atmosphere.
   */
  const strips = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, LONG / 8),
        new THREE.MeshBasicMaterial({ color: DEAD_STRIP.clone(), toneMapped: false })
      );
      strip.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      strip.position.set(midX + side * (WIDE / 2 - 0.06), crown - 0.9, head - 2.6 - i * (LONG / 7.6));
      group.add(strip);
      strips.push({ strip, at: i / 6 });
    }
  }

  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.PointLight(0xc6cfb4, 0, 26, 1.5);
    lamp.position.set(midX, crown - 0.5, head - LONG * (0.16 + i * 0.33));
    group.add(lamp);
    lamps.push(lamp);
  }

  // Gantry ribs across the ceiling, which are what give the run a cadence —
  // without them forty-two metres of flat tunnel does not read as moving.
  for (let i = 1; i < 14; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(WIDE, 0.22, 0.3), dark);
    rib.position.set(midX, crown - 0.13, head - i * (LONG / 14));
    group.add(rib);
  }

  // ----------------------------------------------------------- the shutter ---

  const gateZ = foot + 6.0;
  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(WIDE, HIGH), '#595c53'),
    metalness: 0.5,
    roughness: 0.58,
  });

  const shutter = new THREE.Group();
  group.add(shutter);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(WIDE, HIGH, SHUTTER.thick), steel);
  slab.position.set(midX, floorY + HIGH / 2, gateZ);
  slab.castShadow = true;
  shutter.add(slab);
  for (let v = 0.4; v < HIGH - 0.2; v += 0.5) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(WIDE - 0.1, 0.07, SHUTTER.thick + 0.04), dark);
    rib.position.set(midX, floorY + v, gateZ);
    shutter.add(rib);
  }
  // Hazard paint along the bottom edge, in the one language this building has
  // for a thing that is going to move.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(WIDE, 0.3, SHUTTER.thick + 0.06),
    new THREE.MeshStandardMaterial({ ...makeHazardSurface(14, 1), roughness: 0.8 })
  );
  lip.position.set(midX, floorY + 0.15, gateZ);
  shutter.add(lip);

  /** Up out of the way until it is not. 0 is shut, 1 is open. */
  let open = 1;
  shutter.position.y = HIGH;

  /**
   * And it blocks what it covers, which it did not.
   *
   * This was one box from the floor to the ceiling, switched on the instant
   * the shutter was told to move — so a slab that was visibly six metres in
   * the air was, to anything walking at it, a wall. That is the other half of
   * why nobody ever got under it.
   *
   * `bottom` is the underside of the slab and it is written every frame from
   * the same number that draws it, so the hole under a half-shut shutter is
   * exactly as tall as it looks. A box with a `bottom` and no `top` is solid
   * from there upward and nothing below it — see collision.js — which is the
   * definition of a thing hanging from a ceiling.
   */
  const gateBox = {
    minX,
    maxX,
    minZ: gateZ - SHUTTER.thick / 2,
    maxZ: gateZ + SHUTTER.thick / 2,
    bottom: floorY + HIGH,
  };
  colliders.push(gateBox);


  const inside = (x, z) => x > minX && x < maxX && z > foot && z < head;

  let sealed = false;
  let stopped = false;
  let entered = false;
  let lit = 0;
  let said = false;

  return {
    group,
    colliders,

    /** Whether a point is in here, for whoever needs to know. */
    contains: (x, z) => inside(x, z),

    /** Through the hole and standing in it, for a scene jump. */
    get entry() {
      return { position: [midX, floorY, head - 2.6], yaw: 0 };
    },

    /** The breach in the far end, for whatever is built on the other side. */
    get onward() {
      return { x: midX, y: floorY, z: foot, width: ONWARD.wide, height: ONWARD.high };
    },

    /** The hole, for whatever is coming through it. */
    get mouth() {
      return { x: midX, y: floorY + doorway.height / 2, z: head, width: doorway.width, height: doorway.height };
    },

    /** Whether the shutter has come down. */
    get isSealed() {
      return sealed;
    },

    /** How far up the shutter is, nought to one, for a harness. */
    get gate() {
      return +open.toFixed(3);
    },

    /** Lamps up, as the thing behind you comes through the wall. */
    wake() {
      lit = Math.max(lit, 0.001);
    },

    reset() {
      sealed = false;
      stopped = false;
      entered = false;
      said = false;
      lit = 0;
      open = 1;
      shutter.position.y = HIGH;
      gateBox.bottom = floorY + HIGH;
      for (const lamp of lamps) lamp.intensity = 0;
      for (const { strip } of strips) strip.material.color.copy(DEAD_STRIP);
    },

    update(delta) {
      const here = player.position;

      if (!entered && inside(here.x, here.z)) {
        entered = true;
        this.wake();
      }

      // The lights, travelling away from the hole so the run reads before you
      // have taken it.
      if (lit > 0 && lit < 1) lit = Math.min(1, lit + delta * 0.9);
      for (const { strip, at } of strips) {
        const level = Math.max(0, Math.min(1, (lit - at * 0.45) / 0.3));
        strip.material.color.copy(DEAD_STRIP).lerp(LIVE_STRIP, level);
      }
      lamps.forEach((lamp, i) => {
        lamp.intensity = 26 * Math.max(0, Math.min(1, (lit - i * 0.16) / 0.4));
      });

      // The shutter: tripped by arriving, not by a clock.
      if (!sealed && entered && here.z < gateZ + SHUTTER.trip && inside(here.x, here.z)) {
        sealed = true;
        playSpikeGrind(0.7);
      }
      if (sealed && open > 0) {
        const was = open;
        open = Math.max(0, open - delta / SHUTTER.fall);
        shutter.position.y = HIGH * open;
        if (was > 0 && open === 0) playWardDoor();
      }
      gateBox.bottom = floorY + HIGH * open;

      /**
       * And the thing behind you only gives up once this has shut *and* you
       * are on the far side of it.
       *
       * It used to stop on the frame the shutter was triggered, which is the
       * one arrangement that can wedge the game: a player who does not make
       * it under ends up alive, sealed into a dead-end corridor, with the
       * only thing that could have killed them switched off nine metres
       * away. Now, if you are on the wrong side when it lands, it is still
       * coming — and being caught here puts you back in the shed with the
       * racking up and the shutter raised, which is a retry rather than a
       * wedge. See death.onRestart in main.js.
       */
      if (sealed && !stopped && open === 0 && here.z < gateZ) {
        stopped = true;
        onSeal?.();
      }

      if (sealed && !said && here.z < gateZ) {
        said = true;
        showNote('It is on the other side of that. For now.', 3.6);
        setObjective('Keep going');
      }
    },
  };
}
