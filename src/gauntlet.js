import * as THREE from 'three';
import { SIDE_DOOR, PLAYER, LAYER } from './config.js';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  cloneSurface,
  surfaceTextures,
  worldRepeat,
  UNITS_PER_TILE,
} from './textures.js';
import { setObjective, showNote } from './hud.js';
import { playButtonPress, playWardDoor, playKnockout, playSpikeGrind } from './audio.js';

/**
 * The red hall behind the red door.
 *
 * A short hall that forks into two lanes with a barred divider down the middle,
 * three stations along it, and something with teeth on it coming up behind.
 *
 * **The puzzle.** You cannot get down your own lane and your friend cannot get
 * down its one; each of you holds the key to the other's. Every station has a
 * shutter across both lanes, a switch on the wall of *your* lane, and a floor
 * plate in *its* lane. The switch opens the shutter on the far side. The plate
 * opens the shutter on this one. So the only order that works is: throw the
 * switch, take the bucket over, walk it through the gate you just opened and
 * stand it on the plate, come back to your own body, and go through. Then the
 * next station has you doing it again with the sides swapped over — which is
 * the whole rhythm of the place, and why the divider never opens.
 *
 * That it needs the bucket at all is a consequence of two facts already true
 * elsewhere in this game: the plates take weight and nothing else, and the
 * divider is taller than either of you can jump. Neither is a rule invented
 * for this room.
 *
 * **The chase.** A wall of spikes starts down the hall once you are through the
 * first station, and never stops. It is slow — 0.24 m/s against a walk of 3.1 —
 * so it never wins a race. What it does is charge you for standing still, and the
 * whole puzzle is made of standing still: every second spent inside the bucket
 * is a second your own body is stood in the lane doing nothing. That is the
 * point of it, and it is why the divider is bars above waist height rather than
 * a solid wall. You have to be able to see what is happening to the body you
 * left behind.
 */

/*
 * Everything is laid out from the door, so moving the door moves the hall.
 *
 * `AXIS` is the centre line the whole thing is mirrored about, in z. The hall
 * runs away from the back room in -x, so all of these are descending.
 *
 * A word on left and right, because this project has already put a door in the
 * wrong wall once by guessing. Walking in, you face -x. Left is up x forward,
 * which is (0,1,0) x (-1,0,0) = (0,0,1): **+z is on your left**. So the lane at
 * +z is the left-hand one and the lane at -z is the right-hand one. The bucket
 * gets the left; you get the right.
 */
const AXIS = SIDE_DOOR.z;

/** The face of the back room's left-hand wall, on this side. Its collider ends here. */
const NEAR = SIDE_DOOR.x - 1;

const HEIGHT = 3.4;
/** Half the full width of the hall, so both lanes and the divider fit inside it. */
const HALF = 2.6;
/** Half the divider's thickness. */
const DIV = 0.2;
/** A lane, therefore, is this wide. */
const LANE_WIDTH = HALF - DIV;

const PLAYER_SIDE = -1;
const FRIEND_SIDE = 1;

/** Centre of a lane, given which side of the divider it is on. */
const laneCentre = (side) => AXIS + side * (DIV + LANE_WIDTH / 2);
const laneNear = (side) => AXIS + side * DIV;
const laneFar = (side) => AXIS + side * HALF;

/** Where the divider starts and the hall becomes two halls. */
const FORK = NEAR - 5;
/** And where it stops, so the two lanes run back into one room at the end. */
const DIVIDER_END = -35;
/** The end wall, with the last button on it. */
const END = -41;

/**
 * The three stations, at their shutters.
 *
 * Seven metres apart. Closer and the switch for the next one is in reach before
 * you are through this one, which collapses the alternation into a single dash;
 * further and the walk between them is dead time you are being timed on.
 */
const STATIONS = [-18, -25, -32];
/** How far back up the lane from its shutter the wall switch is. */
const SWITCH_OFFSET = 1.6;
/** And how far past its shutter the floor plate is. Past, so the gate has to open first. */
const PLATE_OFFSET = 1.5;

const SHUTTER_HEIGHT = 2.95;
const SHUTTER_THICK = 0.14;
/** How long a shutter takes to roll up. */
const SHUTTER_SECONDS = 1.1;

const PLATE_SIZE = 1.15;
/** How far the plate sinks under the bucket. Small: it is a switch, not a lift. */
const PLATE_TRAVEL = 0.045;
/** The standing surface. A low step, so both of you can walk onto it. */
const PLATE_TOP = 0.145;

/** Where the spike wall parks when it is not chasing you. */
const SPIKE_HOME = NEAR - 0.7;
/** And where it gives up, hard against the end wall. */
const SPIKE_LIMIT = END + 0.9;
const SPIKE_SPEED = 0.24;
const SPIKE_HEIGHT = 2.9;
/**
 * Past this and the trap arms. Deliberately *past the first station*, not at
 * the fork.
 *
 * The bucket walks in at your heels, which puts it in your lane, and the only
 * way to get it into its own is to take it back out to the fork and round the
 * nose. Armed at the fork, the wall is between you and that crossing within a
 * few seconds of your arriving at the first shutter — measured: the bucket got
 * as far as -10.9 on its way back out and was caught there. The room was
 * unsolvable from the moment it started.
 *
 * So the first station is untimed, and it is where the transfer happens. Once
 * you are through it you are both committed to a lane apiece for the rest of
 * the hall, every remaining station is forwards-only, and *that* is when the
 * wall starts. Which also makes the first one a place to work out what the
 * room wants before it starts charging you for thinking.
 */
const ARM_X = STATIONS[0] - 1.2;
/** How close the front of the spikes has to get to count as having got you. */
const SPIKE_REACH = 0.4;

/** The way on, in the end wall. Shut until the last button goes in. */
const EXIT = { width: 1.7, height: 2.4, landing: 2.6 };

// Authored dark, the same as the red door in the wall this hall is behind, and
// for the same reason: everything here is lit and tone mapped, and ACES lifts
// hard through the mids. A red picked at the value you want to read comes back
// as pink.
const HALL_RED = '#4a1f1c';
const TRIM_RED = '#5c2320';

/**
 * A wall panel, offset so the boards run continuously across the pieces a wall
 * is built from rather than restarting at every join.
 *
 * Same trick the hall and the back room use. `along` is how far along the wall
 * the piece starts, which is what the offset is measured in.
 */
function wallPanel(surface, width, height, along, base) {
  const panel = cloneSurface(surface, ...worldRepeat(width, height));
  for (const map of surfaceTextures(panel)) {
    map.offset.set(along / UNITS_PER_TILE, base / UNITS_PER_TILE);
  }
  return new THREE.MeshStandardMaterial({ ...panel, metalness: 0 });
}

/**
 * A roller shutter across one lane.
 *
 * It rolls up into the housing under the ceiling. There is not actually room up
 * there for it — the curtain is nearly as tall as the hall — but the ceiling is
 * a single-sided plane facing down, so once the bottom of the curtain reaches
 * the housing the rest of it is above the ceiling and cannot be seen. Which is
 * what a real one does behind its hood anyway.
 */
function buildShutter() {
  const group = new THREE.Group();

  const slat = new THREE.MeshStandardMaterial({
    color: '#6b2a24',
    roughness: 0.62,
    metalness: 0.35,
  });
  const hazard = new THREE.MeshStandardMaterial({ color: '#8d7a2e', roughness: 0.7 });
  const housingMat = new THREE.MeshStandardMaterial({
    color: '#2c1513',
    roughness: 0.8,
    metalness: 0.2,
  });

  // The curtain, which is the part that moves.
  const curtain = new THREE.Group();
  group.add(curtain);

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(SHUTTER_THICK, SHUTTER_HEIGHT, LANE_WIDTH - 0.04),
    slat
  );
  face.position.y = SHUTTER_HEIGHT / 2;
  face.castShadow = true;
  face.receiveShadow = true;
  curtain.add(face);

  // Ribs across it, so it reads as a shutter and not a slab, and so you can see
  // it moving. Without them a flat panel sliding up is almost impossible to
  // read at a glance.
  for (let y = 0.22; y < SHUTTER_HEIGHT - 0.1; y += 0.24) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(SHUTTER_THICK + 0.035, 0.05, LANE_WIDTH - 0.1),
      housingMat
    );
    rib.position.y = y;
    curtain.add(rib);
  }

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(SHUTTER_THICK + 0.05, 0.3, LANE_WIDTH - 0.12),
    hazard
  );
  stripe.position.y = 0.24;
  curtain.add(stripe);

  // The hood. Fixed — the curtain disappears behind it.
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, HEIGHT - SHUTTER_HEIGHT, LANE_WIDTH),
    housingMat
  );
  housing.position.y = (HEIGHT + SHUTTER_HEIGHT) / 2;
  housing.castShadow = true;
  group.add(housing);

  // Guide rails either side, which is what stops the opening reading as a hole
  // with a slab in it.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, SHUTTER_HEIGHT, 0.1),
      housingMat
    );
    rail.position.set(0, SHUTTER_HEIGHT / 2, side * (LANE_WIDTH / 2 - 0.05));
    rail.castShadow = true;
    group.add(rail);
  }

  return { group, curtain };
}

/**
 * The wall switch that opens the far lane's shutter.
 *
 * A backplate, a big domed button, and a lamp that goes green once it is in.
 * Deliberately the same shape of object as the console the bucket presses in
 * the store room — you have pressed one of these before, and the game should
 * not have to explain a second one.
 */
function buildSwitch() {
  const group = new THREE.Group();

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.62, 0.09),
    new THREE.MeshStandardMaterial({ color: '#2b2f31', roughness: 0.7, metalness: 0.3 })
  );
  plate.castShadow = true;
  group.add(plate);

  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.08, 18),
    new THREE.MeshStandardMaterial({ color: '#7d1a14', roughness: 0.45 })
  );
  button.rotation.x = Math.PI / 2;
  button.position.set(0, 0.09, 0.08);
  button.castShadow = true;
  group.add(button);

  // Starts black. Emissive is self-lit whatever the lighting is doing, so a
  // lamp left glowing would be a green pinprick hanging in an unpowered hall.
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#1a2b1e',
    roughness: 0.4,
    emissive: '#000000',
  });
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.045, 14), lampMat);
  lamp.position.set(0, -0.16, 0.047);
  group.add(lamp);

  return { group, button, lampMat };
}

/**
 * The floor plate the bucket has to stand on.
 *
 * A recessed frame with a lid that sinks into it. It reads as a thing that
 * takes weight rather than as a thing you press, which is the difference
 * between it and the switch on the wall — one of you can work each.
 */
function buildPlate() {
  const group = new THREE.Group();

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(PLATE_SIZE + 0.22, 0.09, PLATE_SIZE + 0.22),
    new THREE.MeshStandardMaterial({ color: '#26120f', roughness: 0.85, metalness: 0.15 })
  );
  frame.position.y = 0.045;
  frame.receiveShadow = true;
  group.add(frame);

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(PLATE_SIZE, 0.075, PLATE_SIZE),
    new THREE.MeshStandardMaterial({ color: '#7a3029', roughness: 0.55, metalness: 0.35 })
  );
  lid.position.y = 0.105;
  lid.castShadow = true;
  lid.receiveShadow = true;
  group.add(lid);

  // A ring painted on the lid, so it is obvious something is meant to go in the
  // middle of it and not merely on it somewhere. Parented to the lid, so it
  // sinks with it — its y is measured from the lid's own centre.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(PLATE_SIZE * 0.26, PLATE_SIZE * 0.33, 24),
    new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.8 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.039;
  lid.add(ring);

  return { group, lid };
}

/**
 * The wall of spikes.
 *
 * Two panels, one per lane, plus a filler that bridges them while the hall is
 * still one hall. Past the fork the filler is switched off rather than left to
 * grind through the divider — the divider is bars for most of its height and a
 * plate sliding through them looks like a mistake, where two panels either side
 * of the bars look like one wall seen through a fence, which is what it is.
 */
function buildSpikeWall() {
  const group = new THREE.Group();

  const frameMat = new THREE.MeshStandardMaterial({
    color: '#241110',
    roughness: 0.75,
    metalness: 0.4,
  });
  const spikeMat = new THREE.MeshStandardMaterial({
    color: '#8a8d8c',
    roughness: 0.36,
    metalness: 0.75,
  });

  /** One panel of backing plate with spikes on it, centred on z. */
  const panel = (width, z) => {
    const piece = new THREE.Group();
    piece.position.z = z;

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, SPIKE_HEIGHT, width), frameMat);
    back.position.y = SPIKE_HEIGHT / 2;
    back.castShadow = true;
    piece.add(back);

    // Rows offset by half a pitch, so it is a bed of nails rather than a grid.
    //
    // Fewer and longer than the first pass, which used 0.055 x 0.42 at a 0.42
    // pitch and read down the hall as a studded door rather than as something
    // with points on it. At this distance the silhouette is the whole message.
    const across = Math.max(2, Math.round(width / 0.55));
    const up = 6;
    for (let row = 0; row < up; row++) {
      const y = 0.26 + row * ((SPIKE_HEIGHT - 0.55) / (up - 1));
      for (let i = 0; i < across; i++) {
        const stagger = row % 2 ? 0.5 : 0;
        const t = (i + 0.5 + stagger) / across;
        if (t > 1) continue;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.6, 7), spikeMat);
        // A cone points +y; turned a quarter about z the other way it points
        // -x, which is where it is going and where you are. Rotating it +PI/2
        // rather than -PI/2 is the whole difference between a wall of spikes
        // and a wall with spikes on the back of it.
        spike.rotation.z = Math.PI / 2;
        spike.position.set(-0.47, y, (t - 0.5) * width);
        spike.castShadow = true;
        piece.add(spike);
      }
    }
    return piece;
  };

  for (const side of [PLAYER_SIDE, FRIEND_SIDE]) {
    group.add(panel(LANE_WIDTH, laneCentre(side)));
  }
  const filler = panel(DIV * 2, AXIS);
  group.add(filler);

  return { group, filler };
}

export function createGauntlet({ scene, onCaught }) {
  const group = new THREE.Group();
  // Nothing through that door has any power until the ward's console gives the
  // back room its own. Hidden rather than merely unlit, because an unlit room
  // built out of emissive lamps and hazard stripes is not unlit.
  group.visible = false;
  scene.add(group);

  const colliders = [];
  const interactions = [];

  /** A solid box, in the same shape the player and the friend both read. */
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // ---------------------------------------------------------------- shell ---

  const length = NEAR - END;
  const midX = (NEAR + END) / 2;

  const wallSurface = makeWallSurface(...worldRepeat(12, HEIGHT), HALL_RED);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(length, HALF * 2),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(length, HALF * 2)),
      // The floor texture is poured concrete and there is only one of it in the
      // project. Tinting the map is how it joins in with the walls, which are
      // baked red at source because they are the ones you look at.
      color: '#9c5f57',
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, AXIS);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(length, HALF * 2),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(length, HALF * 2)),
      color: '#7d4a44',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, HEIGHT, AXIS);
  group.add(ceiling);

  // The two long walls. A plane turned about y has its width running in x, so
  // these are as wide as the hall is long.
  for (const side of [PLAYER_SIDE, FRIEND_SIDE]) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, HEIGHT),
      wallPanel(wallSurface, length, HEIGHT, 0, 0)
    );
    wall.position.set(midX, HEIGHT / 2, laneFar(side));
    wall.rotation.y = side === FRIEND_SIDE ? Math.PI : 0;
    wall.receiveShadow = true;
    group.add(wall);
    // Behind the plane, not straddling it — there is nothing on the far side of
    // these to be stopped short of.
    const face = laneFar(side);
    solid(END - 1, NEAR + 1, Math.min(face, face + side), Math.max(face, face + side), {});
  }

  // The near wall, round the doorway you came through. Its plane is the outer
  // face of the back room's left-hand wall — room.js puts the collider there
  // and stops one metre short of it on the far side, and this is the other
  // face of that same metre.
  const doorLow = AXIS - SIDE_DOOR.width / 2;
  const doorHigh = AXIS + SIDE_DOOR.width / 2;
  for (const [pw, ph, pz, py] of [
    [doorLow - (AXIS - HALF), HEIGHT, (AXIS - HALF + doorLow) / 2, HEIGHT / 2],
    [AXIS + HALF - doorHigh, HEIGHT, (doorHigh + AXIS + HALF) / 2, HEIGHT / 2],
    [SIDE_DOOR.width, HEIGHT - SIDE_DOOR.height, AXIS, (HEIGHT + SIDE_DOOR.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      wallPanel(wallSurface, pw, ph, pz - pw / 2 - (AXIS - HALF), py - ph / 2)
    );
    mesh.position.set(NEAR, py, pz);
    mesh.rotation.y = -Math.PI / 2;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The threshold: the metre of wall the doorway goes through, lined. Its
  // cheeks sit a centimetre and a half outside the reveals room.js hangs in the
  // same opening, so the two never end up coplanar and fighting.
  const trim = new THREE.MeshStandardMaterial({ color: TRIM_RED, roughness: 0.88 });
  const threshold = new THREE.Group();
  group.add(threshold);
  {
    const depth = SIDE_DOOR.x - NEAR;
    const mid = (SIDE_DOOR.x + NEAR) / 2;
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.PlaneGeometry(depth, SIDE_DOOR.height), trim);
      cheek.position.set(mid, SIDE_DOOR.height / 2, AXIS + side * (SIDE_DOOR.width / 2 + 0.015));
      cheek.rotation.y = side === 1 ? Math.PI : 0;
      cheek.receiveShadow = true;
      threshold.add(cheek);
    }
    const soffit = new THREE.Mesh(new THREE.PlaneGeometry(depth, SIDE_DOOR.width + 0.03), trim);
    soffit.rotation.x = Math.PI / 2;
    soffit.position.set(mid, SIDE_DOOR.height + 0.005, AXIS);
    threshold.add(soffit);

    const sill = new THREE.Mesh(new THREE.PlaneGeometry(depth, SIDE_DOOR.width + 0.03), trim);
    sill.rotation.x = -Math.PI / 2;
    sill.position.set(mid, 0.003, AXIS);
    sill.receiveShadow = true;
    threshold.add(sill);
  }

  // The end wall, round the way out.
  const exitLow = AXIS - EXIT.width / 2;
  const exitHigh = AXIS + EXIT.width / 2;
  for (const [pw, ph, pz, py] of [
    [exitLow - (AXIS - HALF), HEIGHT, (AXIS - HALF + exitLow) / 2, HEIGHT / 2],
    [AXIS + HALF - exitHigh, HEIGHT, (exitHigh + AXIS + HALF) / 2, HEIGHT / 2],
    [EXIT.width, HEIGHT - EXIT.height, AXIS, (HEIGHT + EXIT.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      wallPanel(wallSurface, pw, ph, pz - pw / 2 - (AXIS - HALF), py - ph / 2)
    );
    mesh.position.set(END, py, pz);
    mesh.rotation.y = Math.PI / 2;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  solid(END - 1, END, AXIS - HALF - 1, exitLow, {});
  solid(END - 1, END, exitHigh, AXIS + HALF + 1, {});

  // What is through it: a dead landing, lined like the threshold. There is no
  // level past this yet, and a way out that opens onto the outside of the world
  // would say so far more loudly than a small dark room does.
  {
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(EXIT.width, EXIT.height),
      new THREE.MeshStandardMaterial({ color: '#0c0708', roughness: 0.95 })
    );
    back.position.set(END - EXIT.landing, EXIT.height / 2, AXIS);
    back.rotation.y = Math.PI / 2;
    group.add(back);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.PlaneGeometry(EXIT.landing, EXIT.height), trim);
      cheek.position.set(END - EXIT.landing / 2, EXIT.height / 2, AXIS + side * EXIT.width / 2);
      cheek.rotation.y = side === 1 ? Math.PI : 0;
      group.add(cheek);
    }
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(EXIT.landing, EXIT.width), trim);
    lid.rotation.x = Math.PI / 2;
    lid.position.set(END - EXIT.landing / 2, EXIT.height, AXIS);
    group.add(lid);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(EXIT.landing, EXIT.width), trim);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(END - EXIT.landing / 2, 0.003, AXIS);
    group.add(deck);
    solid(END - EXIT.landing - 1, END - EXIT.landing, AXIS - HALF, AXIS + HALF, {});
  }

  // -------------------------------------------------------------- divider ---

  // Solid to the waist, barred above it. Both halves are one collider: you can
  // see your body through the bars and you cannot reach it, which is the shape
  // of the whole room.
  const dividerLength = FORK - DIVIDER_END;
  const dividerMid = (FORK + DIVIDER_END) / 2;
  const SOLID_TO = 1.1;
  {
    const kerb = new THREE.Mesh(
      new THREE.BoxGeometry(dividerLength, SOLID_TO, DIV * 2),
      new THREE.MeshStandardMaterial({ color: '#3b1815', roughness: 0.9 })
    );
    kerb.position.set(dividerMid, SOLID_TO / 2, AXIS);
    kerb.castShadow = true;
    kerb.receiveShadow = true;
    group.add(kerb);

    const barMat = new THREE.MeshStandardMaterial({
      color: '#4a4d4c',
      roughness: 0.5,
      metalness: 0.6,
    });
    for (let x = FORK - 0.25; x > DIVIDER_END; x -= 0.5) {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, HEIGHT - SOLID_TO, 6),
        barMat
      );
      bar.position.set(x, (HEIGHT + SOLID_TO) / 2, AXIS);
      bar.castShadow = true;
      group.add(bar);
    }
    // A rail top and bottom, or the bars read as loose sticks.
    for (const y of [SOLID_TO + 0.05, HEIGHT - 0.09]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(dividerLength, 0.09, DIV * 1.5),
        barMat
      );
      rail.position.set(dividerMid, y, AXIS);
      group.add(rail);
    }

    // The nose at the fork, so the split is a shape you walk up to rather than
    // a wall that appears between your feet.
    const nose = new THREE.Mesh(
      new THREE.CylinderGeometry(DIV, DIV, SOLID_TO, 14),
      new THREE.MeshStandardMaterial({ color: '#5e2622', roughness: 0.85 })
    );
    nose.position.set(FORK, SOLID_TO / 2, AXIS);
    nose.castShadow = true;
    group.add(nose);

    solid(DIVIDER_END, FORK + DIV, AXIS - DIV, AXIS + DIV, {});
  }

  // --------------------------------------------------------------- lights ---

  /**
   * Red service lighting, and not much of it.
   *
   * Five lamps over thirty metres, which leaves the middle of every span dim.
   * The hall is meant to be somewhere you can see the next station and not the
   * one after it. Emissives start black for the same reason the switch lamps
   * do — they do not care whether the room has power, so they have to be told.
   */
  const lamps = [];
  const tubeMat = new THREE.MeshStandardMaterial({
    color: '#2a0d0c',
    roughness: 0.5,
    emissive: '#000000',
  });
  for (let i = 0; i < 6; i++) {
    const x = NEAR - 2.6 - i * ((length - 4.5) / 5);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.16), tubeMat);
    tube.position.set(x, HEIGHT - 0.11, AXIS + (i % 2 ? 1.4 : -1.4));
    group.add(tube);

    const light = new THREE.PointLight(0xff3521, 0, 11, 2);
    light.position.set(tube.position.x, HEIGHT - 0.35, tube.position.z);
    group.add(light);
    lamps.push(light);
  }

  // ------------------------------------------------------------- stations ---

  /**
   * One station: a shutter across each lane, a switch on your wall before
   * yours, and a plate on its floor past its one.
   *
   * `switchOn` opens the friend's shutter, `plateOn` opens the player's. Both
   * latch. A plate that only held while it was stood on would shut the gate
   * behind a bucket that had wandered off after you, through no decision you
   * made, and the spike wall is quite enough pressure on its own.
   */
  const stations = STATIONS.map((x, index) => {
    const station = { x, index, switchOn: false, plateOn: false, shutters: {} };

    for (const side of [PLAYER_SIDE, FRIEND_SIDE]) {
      const shutter = buildShutter();
      shutter.group.position.set(x, 0, laneCentre(side));
      group.add(shutter.group);
      // Open is "the far side's trigger has been thrown". Yours opens off the
      // plate in its lane; its opens off the switch in yours.
      const isPlayers = side === PLAYER_SIDE;
      station.shutters[side] = {
        ...shutter,
        lift: 0,
        get open() {
          return isPlayers ? station.plateOn : station.switchOn;
        },
      };
      // Sorted, because laneNear and laneFar are the divider side and the wall
      // side and which of those is the smaller z depends on which lane it is.
      // Written straight through, the -z lane got a box whose min was above its
      // max: an empty volume, and a shutter you walked through.
      const a = laneNear(side);
      const c = laneFar(side);
      solid(x - SHUTTER_THICK, x + SHUTTER_THICK, Math.min(a, c), Math.max(a, c), {
        enabled: () => !station.shutters[side].open,
      });
    }

    const wallSwitch = buildSwitch();
    // On the outer wall of your lane, facing in. Not on the divider: the solid
    // part of that stops at the waist and a switch mounted at chest height on
    // it would be floating between two bars.
    wallSwitch.group.position.set(x + SWITCH_OFFSET, 1.28, laneFar(PLAYER_SIDE) + 0.06);
    wallSwitch.group.rotation.y = 0;
    group.add(wallSwitch.group);
    station.wallSwitch = wallSwitch;

    const plate = buildPlate();
    const plateX = x - PLATE_OFFSET;
    const plateZ = laneCentre(FRIEND_SIDE);
    plate.group.position.set(plateX, 0, plateZ);
    group.add(plate.group);
    station.plate = plate;
    station.plateAt = new THREE.Vector3(plateX, 0, plateZ);
    // A `top` and nothing else, so it is a low step both of you can walk onto
    // rather than a box in the way. The bucket has to actually stand on it —
    // the test below reads its feet, and reading a plate it is walking through
    // would fire from a metre up in the air on the way past.
    solid(
      plateX - PLATE_SIZE / 2, plateX + PLATE_SIZE / 2,
      plateZ - PLATE_SIZE / 2, plateZ + PLATE_SIZE / 2,
      { top: PLATE_TOP }
    );

    interactions.push({
      position: new THREE.Vector3(
        x + SWITCH_OFFSET,
        1.28,
        laneFar(PLAYER_SIDE) + 0.2
      ),
      label: 'Throw the switch',
      range: 2.4,
      once: false,
      // Not `once`, so a run that ends under the spikes can be started again.
      // The interaction list has no way to un-spend a target, and reaching in
      // to give it one for this is a worse trade than a flag read here.
      enabled: () => powered && !station.switchOn,
      onInteract() {
        if (station.switchOn) return;
        station.switchOn = true;
        playButtonPress();
        playWardDoor(0.7);
        station.wallSwitch.lampMat.emissive.set('#2fd46a');
        setObjective(
          'Take control of your friend and stand it on the plate'
        );
      },
    });

    return station;
  });

  // ---------------------------------------------------------- last button ---

  // Beside the way out rather than on it — the two were both on the centre line
  // to begin with, which put the button inside the door.
  const FINAL_Z = AXIS + 1.6;
  const finalPanel = buildSwitch();
  finalPanel.group.scale.setScalar(1.5);
  finalPanel.group.position.set(END + 0.1, 1.35, FINAL_Z);
  finalPanel.group.rotation.y = Math.PI / 2;
  group.add(finalPanel.group);

  // The way out, held shut by the same button.
  const exitDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, EXIT.height - 0.04, EXIT.width - 0.04),
    new THREE.MeshStandardMaterial({ color: '#5d2723', roughness: 0.6, metalness: 0.4 })
  );
  const exitShut = (EXIT.height - 0.04) / 2;
  exitDoor.position.set(END + 0.08, exitShut, AXIS);
  exitDoor.castShadow = true;
  group.add(exitDoor);
  // Gated on where the door actually is rather than on the flag, so it stops
  // being solid as it clears your head and not two seconds before.
  solid(END, END + 0.2, exitLow, exitHigh, {
    enabled: () => exitDoor.position.y < exitShut + EXIT.height * 0.6,
  });

  // ----------------------------------------------------------- spike wall ---

  const spikes = buildSpikeWall();
  group.add(spikes.group);

  /**
   * A black plate across the doorway while there is no power.
   *
   * The hall is hidden until the ward's console reaches it, and a hidden hall
   * leaves a hole: from inside the pitch-black back room the opening showed the
   * clear colour, which is a shade lighter than the room and reads as a faint
   * grey rectangle hanging in the dark. Exactly the fault the alcove used to
   * cover by being made of black, and exactly the one the corridor doorway
   * already solves with a blank of its own.
   *
   * Outside `group`, because `group` is the thing being hidden. Unlit and
   * unfogged so it is the same black from anywhere in the room.
   */
  const blank = new THREE.Mesh(
    new THREE.PlaneGeometry(SIDE_DOOR.width + 0.5, SIDE_DOOR.height + 0.4),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
  );
  blank.position.set(SIDE_DOOR.x - 0.12, SIDE_DOOR.height / 2, AXIS);
  blank.rotation.y = Math.PI / 2;
  blank.layers.set(LAYER.DARK);
  scene.add(blank);

  // ------------------------------------------------------------- run state --

  let powered = false;
  let armed = false;
  let solved = false;
  let spikeX = SPIKE_HOME;
  let grindTimer = 0;
  /** So the first station's instruction is only given once per run. */
  let coached = false;
  /** And so walking in only sets the objective once. */
  let entered = false;

  spikes.group.position.x = spikeX;
  spikes.group.visible = false;

  interactions.push({
    position: new THREE.Vector3(END + 0.6, 1.35, FINAL_Z),
    label: 'Press the button',
    range: 2.6,
    once: false,
    enabled: () => powered && !solved,
    onInteract() {
      if (solved) return;
      solved = true;
      armed = false;
      playButtonPress();
      playWardDoor();
      finalPanel.lampMat.emissive.set('#2fd46a');
      setObjective('Go through');
      showNote('The wall stops.', 2.6);
    },
  });

  /** Inside the hall at all — the spikes only have opinions about people in it. */
  const inHall = (x, z) =>
    x < SIDE_DOOR.x && x > END && z > AXIS - HALF && z < AXIS + HALF;

  /**
   * Everything back to how it was found: shutters down, switches out, the wall
   * parked by the door. Used by the debug menu, and every time the spikes get
   * one of you.
   */
  function rewind() {
    armed = false;
    solved = false;
    coached = false;
    entered = false;
    spikeX = SPIKE_HOME;
    spikes.group.position.x = spikeX;
    for (const station of stations) {
      station.switchOn = false;
      station.plateOn = false;
      station.wallSwitch.lampMat.emissive.set('#000000');
      for (const side of [PLAYER_SIDE, FRIEND_SIDE]) {
        const shutter = station.shutters[side];
        shutter.lift = 0;
        shutter.curtain.position.y = 0;
      }
      station.plate.lid.position.y = 0.105;
    }
    finalPanel.lampMat.emissive.set('#000000');
    exitDoor.position.y = exitShut;
  }

  return {
    group,
    colliders,
    interactions,

    /** The ward's console reaches this far too. Called with lightUpBackRoom. */
    powerUp() {
      if (powered) return;
      powered = true;
      group.visible = true;
      blank.visible = false;
      for (const light of lamps) light.intensity = 13;
      tubeMat.emissive.set('#7d1410');
    },

    /** Debug only, and the inverse of the above in every particular. */
    powerDown() {
      powered = false;
      group.visible = false;
      blank.visible = true;
      for (const light of lamps) light.intensity = 0;
      tubeMat.emissive.set('#000000');
      rewind();
    },

    reset: rewind,

    /** Whether a point is inside the hall. Exposed so the friend's give-up-and-
     *  teleport rescue can be switched off in here — see setRecallAllowed. */
    contains: inHall,

    get isPowered() {
      return powered;
    },
    get isArmed() {
      return armed;
    },
    get isSolved() {
      return solved;
    },
    /** Dev handles. */
    get spikeX() {
      return spikeX;
    },
    get progress() {
      return stations.map((s) => ({ x: s.x, switch: s.switchOn, plate: s.plateOn }));
    },
    /** Where to stand you and the bucket when a run has to start over. */
    get entry() {
      return {
        player: [NEAR - 2.2, 0, laneCentre(PLAYER_SIDE)],
        friend: new THREE.Vector3(NEAR - 2.2, 0, laneCentre(FRIEND_SIDE)),
        // Facing down the hall, away from the door. yaw turns the camera's own
        // -z forward about +y, so +PI/2 is -x and -PI/2 is +x: the sign that
        // reads as "away" is the positive one, and the other one stands you in
        // the doorway looking back the way you came.
        yaw: Math.PI / 2,
      };
    },

    /**
     * @param bodyPosition the player's own feet, which is not the camera while
     *   they are inside the bucket — and the body is what the spikes want.
     */
    update(delta, bodyPosition, friend) {
      if (!powered) return;

      const bodyIn = inHall(bodyPosition.x, bodyPosition.z);

      // Arming and disarming. Walking back out through the door you came in by
      // calls the whole thing off and puts the wall back — you left, and a trap
      // that keeps running in an empty room only exists to kill you on the way
      // back in.
      if (!entered && bodyIn) {
        entered = true;
        setObjective('Find the way out of the red hall');
      }
      if (!armed && !solved && bodyIn && bodyPosition.x < ARM_X) {
        armed = true;
        showNote('Something starts moving in the hall behind you.', 3);
        setObjective('Keep ahead of it');
      } else if (armed && !bodyIn && bodyPosition.x > SIDE_DOOR.x) {
        rewind();
      }

      if (armed) {
        spikeX = Math.max(SPIKE_LIMIT, spikeX - SPIKE_SPEED * delta);
        // Retriggered rather than looped, and quieter the further ahead you are.
        grindTimer -= delta;
        if (grindTimer <= 0) {
          grindTimer = 1.15;
          const range = Math.abs(bodyPosition.x - spikeX) / 7;
          playSpikeGrind(1 / (1 + range * range));
        }
      } else if (spikeX < SPIKE_HOME) {
        // Withdrawing, fast, once the last button is in or you have backed out.
        spikeX = Math.min(SPIKE_HOME, spikeX + 9 * delta);
      }
      spikes.group.position.x = spikeX;
      // Only there once it is coming. Parked, it would sit across the way in
      // and you would walk through a wall of spikes to get into the room they
      // are in — which teaches you they are scenery in the one moment the room
      // has to teach you they are not. It appears behind you, six metres back,
      // while you are facing the other way.
      spikes.group.visible = armed || spikeX < SPIKE_HOME - 0.01;
      spikes.filler.visible = spikeX > FORK;

      // Caught. The body counts wherever you happen to be looking from, and so
      // does the bucket — leaving it behind to be ground up is not a solution
      // to the room either.
      //
      // The wall comes from the door, which is +x of you, and travels -x. So
      // its tips are on its -x face and you are caught by being *above* that
      // line, not below it.
      if (armed) {
        const front = spikeX - SPIKE_REACH;
        const bodyHit = bodyIn && bodyPosition.x > front - PLAYER.radius;
        const friendHit =
          friend.isActive &&
          inHall(friend.position.x, friend.position.z) &&
          friend.position.x > front - 0.4;
        if (bodyHit || friendHit) {
          rewind();
          playKnockout();
          onCaught?.(bodyHit ? 'you' : 'friend');
        }
      }

      // Plates. Weight only: the bucket is the only thing that can be over
      // there, but the test is on what is standing on it and not on what it is,
      // the same as the console on the store room shelf.
      //
      // Height is the primary signal, because it is the one that means what the
      // plate means. Being *at* plate height and nowhere else is on it. The
      // footprint is a second check and is generous, because a body of radius R
      // is held up by a box from R outside its edge — measured: the bucket sat
      // on the lip at 0.14m, plainly standing on the thing, and a tight radius
      // read it as six centimetres short and did nothing.
      for (const station of stations) {
        if (!station.plateOn && friend.isActive && friend.isGrounded) {
          const near =
            Math.abs(friend.position.x - station.plateAt.x) < PLATE_SIZE / 2 + 0.45 &&
            Math.abs(friend.position.z - station.plateAt.z) < PLATE_SIZE / 2 + 0.45;
          if (near && Math.abs(friend.position.y - PLATE_TOP) < 0.07) {
            station.plateOn = true;
            playButtonPress(0.8);
            playWardDoor(0.7);
            if (station.index === stations.length - 1) {
              setObjective('Press the button at the end of the hall');
            } else {
              setObjective(armed ? 'Keep ahead of it' : 'Go on through');
            }
          }
        }

        // Shutters ease up or down toward whichever their trigger says.
        for (const side of [PLAYER_SIDE, FRIEND_SIDE]) {
          const shutter = station.shutters[side];
          const want = shutter.open ? 1 : 0;
          if (shutter.lift !== want) {
            const step = delta / SHUTTER_SECONDS;
            shutter.lift = want > shutter.lift
              ? Math.min(want, shutter.lift + step)
              : Math.max(want, shutter.lift - step);
            shutter.curtain.position.y = shutter.lift * SHUTTER_HEIGHT;
          }
        }

        // And the lid of the plate sinks under whatever is on it.
        const sunk = station.plateOn ? PLATE_TRAVEL : 0;
        station.plate.lid.position.y += (0.105 - sunk - station.plate.lid.position.y) * Math.min(1, delta * 8);
      }

      // The first switch is the only one that needs saying out loud. After that
      // the room has taught itself.
      // Not gated on `armed` any more: the trap now starts *after* this
      // station, so waiting for it would be waiting until the advice was moot.
      if (!coached && bodyIn && !stations[0].switchOn && bodyPosition.x < STATIONS[0] + 4) {
        coached = true;
        setObjective('Throw the switch to open your friend’s way');
      }

      if (solved) {
        exitDoor.position.y += (EXIT.height + 0.4 - exitDoor.position.y) * Math.min(1, delta * 2.2);
      }
    },
  };
}
