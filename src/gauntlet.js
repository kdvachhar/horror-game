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
 * shutter across both lanes, a switch up on a gantry in *your* lane, and a
 * plate up a stack of ledges in *its* lane. The switch opens the shutter on the
 * far side. The plate opens the shutter on this one. So the only order that
 * works is: climb to the switch and throw it, take the bucket over, drive it
 * through the gate you just opened and up its own climb onto the plate, come
 * back to your own body, and go through. Then the next station has you doing it
 * again with the sides swapped over — which is the whole rhythm of the place,
 * and why the divider never opens. Both climbs get harder each time; see
 * STATION_CLIMBS.
 *
 * The bucket puts *itself* in the left-hand lane the moment you are both
 * through the red door, and paces you down it through the bars. See
 * friendTarget: getting it across by hand was the first thing the room used to
 * ask of you and the least interesting thing in it.
 *
 * That it needs the bucket at all is a consequence of two facts already true
 * elsewhere in this game: the plates take weight and nothing else, and the
 * divider is taller than either of you can jump. Neither is a rule invented
 * for this room.
 *
 * **The chase.** A wall of spikes starts down the hall once you are through the
 * first station, and never stops. It is slower than you — 0.45 m/s against a
 * walk of 3.1 — so it never wins a race. What it does is charge you for
 * standing still, and the whole puzzle is made of standing still: every second
 * spent inside the bucket is a second your own body is stood in the lane doing
 * nothing. That is the
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

/**
 * Eight metres. It opened at 3.4 and went to 5 before this.
 *
 * The height is what the platforming is made of. A riser has to clear the
 * player's 0.9m free step to be a jump at all and stay under their 1.31m peak
 * to be possible, so a climb is a stack of one-metre risers and nothing else —
 * and how many of them will fit is purely how much headroom there is. At 3.4
 * there was room for one. At 5, two. At 8 the last station stacks four and
 * finishes at 3.8 with its switch at 5.25, and there is still two metres of air
 * over your head when you get there.
 */
const HEIGHT = 8;
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
/**
 * And where the divider stops, so the two lanes run back into one room.
 *
 * It used to be -35, which left three metres of divided lane past the last
 * station — not enough for the bucket's climb to fit in, and the plate at the
 * top of it would have ended up in the shared chamber where you could simply
 * walk over and stand on it yourself.
 */
const DIVIDER_END = -41.5;
/** The end wall, with the last button on it. */
const END = -48;

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
/**
 * The strip of its lane the bucket walks when it is simply following you.
 *
 * Along the divider rather than down the middle: the middle is where the climb
 * stands now, and a leash pointed at it would walk the bucket into the first
 * ledge every time you went past one.
 */
const LANE_WALK = laneNear(FRIEND_SIDE) + FRIEND_SIDE * 0.6;

const SHUTTER_HEIGHT = HEIGHT - 0.6;
const SHUTTER_THICK = 0.14;
/** How long a shutter takes to roll up. */
const SHUTTER_SECONDS = 1.1;

/**
 * The climbs, one pair per station, and they get harder as you go.
 *
 * Each entry is `[how far back up the lane, how long, how high, how far off the
 * wall]`. The last of each list is the one that matters — the pad the switch is
 * over, and the deck the plate sits on — and it always sits at `back: 0` from
 * its own anchor so the switch is over the middle of it. That last one also
 * always comes back to the wall, because the switch is on the wall and the
 * reach is measured from wherever you are standing when you try it.
 *
 * **Yours escalates upward.** The player steps up 0.9m without being asked and
 * jumps to 1.31, so the whole usable band for a riser is three tenths of a
 * metre wide: a climb is a stack of one-metre risers and there is no other
 * shape it can take. Station one is a flat run of four at 1.0 with easy gaps —
 * the one teaching you the switch is out of reach at all, so nothing about it
 * should be in doubt. Station two adds two risers and finishes at 3.0. Station
 * three adds three, finishes at 3.8 with its switch at 5.25, shortens the pads
 * to 0.8, and stands every other one 0.8m off the wall so each jump is a step
 * across the lane as well as up it.
 *
 * **The bucket's escalates in the risers.** It steps only 0.25 and clears 1.15,
 * so for it almost anything is a jump and the question is how much of its
 * ceiling each one spends. Station one is a contiguous staircase at
 * 0.6/0.7/0.7/0.6 — no gaps, nothing to miss. By station three it is
 * 0.8/0.95/0.95/0.9 with real gaps between the ledges, and 0.95 against a 1.145
 * peak leaves a fifth of a metre. Deliberately not more: at a 1.05 riser with
 * those gaps the arc measured out at 0.94m over the gap, which is a jump that
 * cannot be made however well you time it. Its lane is not staggered — it is
 * driven, its air control is deliberately sluggish, and a diagonal jump on top
 * of a 0.95 riser measured at seven centimetres of clearance.
 *
 * `SWITCH_RANGE` is what makes any of it necessary rather than decorative, and
 * it is a reach and not a rule. The verification sweeps every standable surface
 * at every station — the floor, and each pad below the top one — and checks
 * that the only place the switch comes inside that range is the top pad. On a
 * flat climb the pad before the top is the dangerous one, because it is at the
 * same height and only the distance is keeping it out: station one's used to
 * stand 2.1 back and reach to within 1.34 of a switch you are refused at 1.25,
 * which is nine centimetres of margin. It stands 2.6 back now, and 1.74.
 */
const SWITCH_RANGE = 1.25;
/** The switch's own standby light, and what it goes to once it is thrown. */
const SWITCH_IDLE = '#8e1a12';
const SWITCH_DONE = '#2fd46a';
/** How far above its pad a switch hangs. From up there it is 0.23 below eye level. */
const SWITCH_LIFT = 1.45;
const CLIMB_DEPTH = 1.15;
const BUCKET_CLIMB_DEPTH = 1.2;

const STATION_CLIMBS = [
  {
    // Flat, four pads, easy gaps. The one that teaches you the switch is up
    // there at all, so nothing about it should be in doubt.
    player: [[6.3, 1.0, 1.0], [4.2, 1.0, 1.0], [2.6, 1.0, 1.0], [0, 1.6, 1.0]],
    bucket: [[1.5, 1.0, 0.6], [2.6, 1.0, 1.3], [3.7, 1.0, 2.0], [5.0, 1.7, 2.6]],
  },
  {
    // Two risers and gaps that want a bit of pace.
    player: [[6.6, 0.9, 1.0], [4.4, 0.9, 1.0], [2.2, 0.9, 2.0], [0, 1.9, 3.0]],
    bucket: [[1.6, 0.9, 0.7], [3.0, 0.9, 1.55], [4.4, 0.9, 2.4], [5.9, 1.6, 3.2]],
  },
  {
    // Three risers, short pads, and every jump diagonal: the pads alternate
    // between the wall and 0.8 out into the lane, so each one is a step across
    // as well as up. The top pad comes back to the wall, because the switch is
    // on the wall and the reach is measured from where you land.
    player: [
      [6.4, 0.8, 1.0, 0.8],
      [4.4, 0.8, 2.0, 0],
      [2.4, 0.8, 2.9, 0.8],
      [0, 1.8, 3.8, 0],
    ],
    bucket: [[1.7, 0.8, 0.8], [3.2, 0.8, 1.75], [4.7, 0.8, 2.7], [6.3, 1.5, 3.6]],
  },
];

/** The last button gets the hardest of them, since it is the last thing asked. */
const FINAL_CLIMB = STATION_CLIMBS[STATION_CLIMBS.length - 1].player;

/** The top of a climb: how high its last pad is. */
const topOf = (climb) => climb[climb.length - 1][2];

const PLATE_SIZE = 1.15;
/** How far the plate sinks under the bucket. Small: it is a switch, not a lift. */
const PLATE_TRAVEL = 0.045;
/** The standing surface. A low step, so both of you can walk onto it. */
const PLATE_TOP = 0.145;

/** Where the spike wall parks when it is not chasing you. */
const SPIKE_HOME = NEAR - 0.7;
/** And where it gives up, hard against the end wall. */
const SPIKE_LIMIT = END + 0.9;
/**
 * How fast the wall comes, in metres per second.
 *
 * It opened at 0.24, which never lost. The budget is worth writing down: the
 * trap arms with the wall 9.5m behind you, you cover 24.8m of hall at a walk of
 * 3.1 and gain on it the whole way, so what you actually have is about a minute
 * of standing still before it arrives — and standing still is all the room asks
 * of you. Two stations at roughly eighteen seconds each and the climb at the
 * end come to about forty of that. Raise this much past 0.45 and the margin
 * goes, along with any room to fumble a jump.
 */
const SPIKE_SPEED = 0.45;
const SPIKE_HEIGHT = HEIGHT - 0.7;
/**
 * Past this and the trap arms. Deliberately *past the first station*, not at
 * the fork.
 *
 * Originally because the room was otherwise unsolvable. The bucket used to walk
 * in at your heels, which put it in your lane, and the only way to get it into
 * its own was to take it back out to the fork and round the nose — with the
 * wall between you and that crossing within seconds of your reaching the first
 * shutter. Measured: the bucket got as far as -10.9 on its way back out and was
 * ground up there.
 *
 * That reason is gone — see friendTarget, the bucket takes its own lane now —
 * and this stays where it is for a better one. The first station is where the
 * room explains itself: a switch you cannot reach, a gantry to get up to it, a
 * gate that opens on the wrong side of the wall, and a plate only the bucket
 * can stand on. That is four things at once, and none of them are worth
 * teaching under a clock. Get through it and you are both committed to a lane
 * for the rest of the hall, every station after it is forwards-only, and that
 * is when the wall starts.
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
  face.receiveShadow = true;
  curtain.add(face);

  // Ribs across it, so it reads as a shutter and not a slab, and so you can see
  // it moving. Without them a flat panel sliding up is almost impossible to
  // read at a glance. Spaced wider than they were: these are seven metres tall
  // now and there are six of them, and at the old pitch that was a hundred and
  // eighty separate little boxes for a detail you read at a glance.
  for (let y = 0.26; y < SHUTTER_HEIGHT - 0.1; y += 0.36) {
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
  group.add(housing);

  // Guide rails either side, which is what stops the opening reading as a hole
  // with a slab in it.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, SHUTTER_HEIGHT, 0.1),
      housingMat
    );
    rail.position.set(0, SHUTTER_HEIGHT / 2, side * (LANE_WIDTH / 2 - 0.05));
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
  group.add(plate);

  const button = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.08, 18),
    new THREE.MeshStandardMaterial({ color: '#7d1a14', roughness: 0.45 })
  );
  button.rotation.x = Math.PI / 2;
  button.position.set(0, 0.09, 0.08);
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

  // A ring of standby light around the button, so the switch is findable from
  // the floor. The climbs finish above the lamps now — station three's top pad
  // is at 3.8 and its switch at 5.25, both of them over the line the hall's
  // fittings hang on — and a black panel on a black wall five metres up is not
  // something you can plan a jump toward.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 20),
    new THREE.MeshBasicMaterial({ color: SWITCH_IDLE, toneMapped: false })
  );
  halo.position.set(0, 0.09, 0.05);
  group.add(halo);

  return { group, button, lampMat, halo };
}

/**
 * One pad of the gantry run: a deck on two brackets, bolted to the wall.
 *
 * Built as something you would find in a service corridor rather than as a
 * platform, so the run reads as a cable tray you are abusing and not as a
 * staircase someone left for you.
 */
function buildStep(length, depth, top) {
  const group = new THREE.Group();

  const steel = new THREE.MeshStandardMaterial({
    color: '#4a4d4c',
    roughness: 0.55,
    metalness: 0.55,
  });
  // Faintly lit, not merely painted. These are the only things in the hall you
  // have to judge a jump against, and half of them are above the lamps.
  const edge = new THREE.MeshStandardMaterial({
    color: '#8d7a2e',
    roughness: 0.7,
    emissive: '#4a3c10',
  });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.09, depth), steel);
  deck.position.y = top - 0.045;
  deck.receiveShadow = true;
  group.add(deck);

  // A painted lip along the open edge, which is the one you fall off.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.07), edge);
  lip.position.set(0, top + 0.015, depth / 2 - 0.035);
  group.add(lip);

  // Brackets down to the wall, set in from the ends so the deck overhangs them.
  for (const s of [-1, 1]) {
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, top - 0.09, depth * 0.75),
      steel
    );
    bracket.position.set(s * (length / 2 - 0.22), (top - 0.09) / 2, -depth * 0.1);
    group.add(bracket);
  }

  return group;
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
    piece.add(back);

    // Rows offset by half a pitch, so it is a bed of nails rather than a grid.
    //
    // Fewer and longer than the first pass, which used 0.055 x 0.42 at a 0.42
    // pitch and read down the hall as a studded door rather than as something
    // with points on it. At this distance the silhouette is the whole message.
    const across = Math.max(2, Math.round(width / 0.62));
    // Scaled to the wall's height rather than a fixed count, so it stays a bed
    // of spikes at seven metres instead of six rows a metre and a half apart.
    // Kept coarse on purpose: this is 96 separate cones as it is, and it is the
    // one object in the hall that is on screen while you are being chased.
    const up = Math.max(4, Math.round(SPIKE_HEIGHT / 0.85));
    for (let row = 0; row < up; row++) {
      const y = 0.3 + row * ((SPIKE_HEIGHT - 0.6) / (up - 1));
      for (let i = 0; i < across; i++) {
        const stagger = row % 2 ? 0.5 : 0;
        const t = (i + 0.5 + stagger) / across;
        if (t > 1) continue;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.68, 7), spikeMat);
        // A cone points +y; turned a quarter about z the other way it points
        // -x, which is where it is going and where you are. Rotating it +PI/2
        // rather than -PI/2 is the whole difference between a wall of spikes
        // and a wall with spikes on the back of it.
        spike.rotation.z = Math.PI / 2;
        spike.position.set(-0.51, y, (t - 0.5) * width);
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

/*
 * Nothing in this hall casts a shadow, deliberately.
 *
 * Its own lamps do not cast — they are six-render cube maps apiece and there
 * are three of them — so a `castShadow` on anything in here could only ever be
 * paid to some *other* room's light, which is thirty metres away through two
 * walls and cannot see any of it. It would be pure cost for no pixel.
 */

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

  /**
   * A run of pads against the outer wall of a lane, with a collider apiece.
   *
   * `anchor` is the x the run is measured from and `sense` which way `back`
   * counts: yours runs back up the lane from the switch (+1), the bucket's runs
   * on down the lane away from the shutter (-1).
   *
   * The z of the pads is worked out from the lane's side rather than written
   * down, so the same list builds a run against either wall — and the collider's
   * bounds are sorted, because which of the wall face and the inner edge is the
   * smaller z depends on which side that is. Written straight through once
   * before, and it made an empty box you walked through.
   */
  function buildClimb(pads, anchor, side, depth, sense = 1) {
    const inward = -side;
    const face = laneFar(side);
    for (const [back, length, top, shift = 0] of pads) {
      const px = anchor + sense * back;
      // `shift` stands the pad off the wall, so a run of them can zig-zag
      // across the lane and every jump becomes a step sideways as well as up.
      const near = face + inward * shift;
      const far = near + inward * depth;
      const pad = buildStep(length, depth, top);
      pad.position.set(px, 0, (near + far) / 2);
      pad.rotation.y = inward > 0 ? 0 : Math.PI;
      group.add(pad);
      solid(px - length / 2, px + length / 2, Math.min(near, far), Math.max(near, far), {
        top,
      });
    }
  }

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
    kerb.receiveShadow = true;
    group.add(kerb);

    const barMat = new THREE.MeshStandardMaterial({
      color: '#4a4d4c',
      roughness: 0.5,
      metalness: 0.6,
    });
    for (let x = FORK - 0.3; x > DIVIDER_END; x -= 0.6) {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, HEIGHT - SOLID_TO, 6),
        barMat
      );
      bar.position.set(x, (HEIGHT + SOLID_TO) / 2, AXIS);
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
    group.add(nose);

    solid(DIVIDER_END, FORK + DIV, AXIS - DIV, AXIS + DIV, {});
  }

  // --------------------------------------------------------------- lights ---

  /**
   * Red service lighting, and not much of it.
   *
   * Three lamps over thirty metres, which leaves most of every span dim. The
   * hall is meant to be somewhere you can see the next station and not the one
   * after it.
   *
   * It was six. Six point lights in a scene that already had twenty-eight cost
   * 95ms of a 504ms frame — nineteen per cent of the game's whole frame for one
   * corridor's ceiling — because a forward renderer evaluates every light on
   * every fragment of every surface anywhere in the world. Three at a longer
   * reach light the same hall for half of that.
   *
   * The fittings are still hung in sixes, so the ceiling reads the way it did;
   * every other one is a dead tube, which this building is full of anyway.
   *
   * Emissives start black for the same reason the switch lamps do — they do not
   * care whether the room has power, so they have to be told.
   */
  const lamps = [];
  const tubeMat = new THREE.MeshStandardMaterial({
    color: '#2a0d0c',
    roughness: 0.5,
    emissive: '#000000',
  });
  const deadTubeMat = new THREE.MeshStandardMaterial({ color: '#2a0d0c', roughness: 0.5 });
  // Hung well below the ceiling on a drop, not flush to it. At eight metres a
  // fitting on the slab lights the top of the walls and leaves the floor —
  // where the jumping happens — in the dark. The main hall's fixtures hang for
  // the same reason and it is 22m tall.
  const LAMP_Y = 5;
  const stemMat = new THREE.MeshStandardMaterial({ color: '#2a1614', roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const x = NEAR - 2.6 - i * ((length - 4.5) / 5);
    const z = AXIS + (i % 2 ? 1.4 : -1.4);
    const live = i % 2 === 0;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, HEIGHT - LAMP_Y, 6),
      stemMat
    );
    stem.position.set(x, (HEIGHT + LAMP_Y) / 2, z);
    group.add(stem);

    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.07, 0.16),
      live ? tubeMat : deadTubeMat
    );
    tube.position.set(x, LAMP_Y, z);
    group.add(tube);
    if (!live) continue;

    const light = new THREE.PointLight(0xff3521, 0, 24, 2);
    light.position.set(x, LAMP_Y - 0.22, z);
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

    // This station's pair of climbs. They get harder with `index`.
    const climbs = STATION_CLIMBS[index];
    const switchY = topOf(climbs.player) + SWITCH_LIFT;
    station.switchY = switchY;

    const wallSwitch = buildSwitch();
    // On the outer wall of your lane, facing in, and up out of reach. Not on
    // the divider: the solid part of that stops at the waist and a switch
    // mounted this high on it would be floating between two bars.
    wallSwitch.group.position.set(x + SWITCH_OFFSET, switchY, laneFar(PLAYER_SIDE) + 0.06);
    wallSwitch.group.rotation.y = 0;
    group.add(wallSwitch.group);
    station.wallSwitch = wallSwitch;

    // And the climb to it, running back up the lane against the same wall. The
    // inward direction is -PLAYER_SIDE, so this reads the same whichever side
    // of the divider the lane is on rather than only working for -z.
    buildClimb(climbs.player, x + SWITCH_OFFSET, PLAYER_SIDE, CLIMB_DEPTH);

    // The bucket's climb, in its own lane against the outer wall. Anchored at
    // the shutter and running away from it, so `back` counts forward down the
    // lane rather than up it the way yours does.
    //
    // The last deck is sunk by the plate's own thickness, so the height written
    // in the table is the height of the thing you actually land on. The plate
    // is 0.145 proud and the deck is only 0.225 wider than it, which is inside
    // the bucket's radius — so it is always the plate holding the bucket up, not
    // the deck, and building the deck at the listed height quietly added 0.145
    // to the last jump of every climb. Measured, that left station three's last
    // riser 1.1 against a peak of 1.145: three centimetres, and unmakeable.
    const bucketPads = climbs.bucket.map(([back, length, top], i) =>
      i === climbs.bucket.length - 1 ? [back, length, top - PLATE_TOP] : [back, length, top]
    );
    buildClimb(bucketPads, x, FRIEND_SIDE, BUCKET_CLIMB_DEPTH, -1);

    // And the plate on the deck at the top of it.
    const deck = climbs.bucket[climbs.bucket.length - 1];
    const plate = buildPlate();
    const plateX = x - deck[0];
    const plateZ = laneFar(FRIEND_SIDE) - FRIEND_SIDE * BUCKET_CLIMB_DEPTH / 2;
    const plateY = deck[2] - PLATE_TOP;
    plate.group.position.set(plateX, plateY, plateZ);
    group.add(plate.group);
    station.plate = plate;
    station.plateAt = new THREE.Vector3(plateX, plateY, plateZ);
    station.plateTop = deck[2];
    // A `top` and nothing else, so it is a low step up off the deck rather than
    // a box in the way. The bucket has to actually stand on it — the test below
    // reads its feet, and reading a plate it is walking through would fire from
    // a metre up in the air on the way past.
    solid(
      plateX - PLATE_SIZE / 2, plateX + PLATE_SIZE / 2,
      plateZ - PLATE_SIZE / 2, plateZ + PLATE_SIZE / 2,
      { top: station.plateTop }
    );

    interactions.push({
      position: new THREE.Vector3(
        x + SWITCH_OFFSET,
        switchY,
        laneFar(PLAYER_SIDE) - PLAYER_SIDE * 0.2
      ),
      label: 'Throw the switch',
      range: SWITCH_RANGE,
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
        station.wallSwitch.lampMat.emissive.set(SWITCH_DONE);
        station.wallSwitch.halo.material.color.set(SWITCH_DONE);
        setObjective(
          'Take control of your friend and stand it on the plate'
        );
      },
    });

    return station;
  });

  // ---------------------------------------------------------- last button ---

  // In the corner of the end chamber, up on a gantry of its own, and away from
  // the way out — the two were both on the centre line to begin with, which put
  // the button inside the door. Up there for the same reason the others are:
  // arriving in the chamber is not the last thing the hall asks of you.
  const FINAL_Z = laneFar(PLAYER_SIDE) - PLAYER_SIDE * 0.4;
  const FINAL_Y = topOf(FINAL_CLIMB) + SWITCH_LIFT;
  const finalPanel = buildSwitch();
  finalPanel.group.scale.setScalar(1.5);
  finalPanel.group.position.set(END + 0.14, FINAL_Y, FINAL_Z);
  finalPanel.group.rotation.y = Math.PI / 2;
  group.add(finalPanel.group);

  // Its climb runs back into the chamber off the end wall, which is the same
  // arrangement as a station's with the anchor at the wall instead of a switch.
  buildClimb(FINAL_CLIMB, END + 1.1, PLAYER_SIDE, CLIMB_DEPTH);

  // The way out, held shut by the same button.
  const exitDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, EXIT.height - 0.04, EXIT.width - 0.04),
    new THREE.MeshStandardMaterial({ color: '#5d2723', roughness: 0.6, metalness: 0.4 })
  );
  const exitShut = (EXIT.height - 0.04) / 2;
  exitDoor.position.set(END + 0.08, exitShut, AXIS);
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
  // Mutated rather than replaced, so nothing downstream is holding a stale one.
  const leash = new THREE.Vector3();

  /** So the first station's instruction is only given once per run. */
  let coached = false;
  /** And so walking in only sets the objective once. */
  let entered = false;

  spikes.group.position.x = spikeX;
  spikes.group.visible = false;

  interactions.push({
    position: new THREE.Vector3(END + 1.1, FINAL_Y, laneFar(PLAYER_SIDE) - PLAYER_SIDE * 0.25),
    label: 'Press the button',
    range: SWITCH_RANGE,
    once: false,
    enabled: () => powered && !solved,
    onInteract() {
      if (solved) return;
      solved = true;
      armed = false;
      playButtonPress();
      playWardDoor();
      finalPanel.lampMat.emissive.set(SWITCH_DONE);
      finalPanel.halo.material.color.set(SWITCH_DONE);
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
      station.wallSwitch.halo.material.color.set(SWITCH_IDLE);
      for (const side of [PLAYER_SIDE, FRIEND_SIDE]) {
        const shutter = station.shutters[side];
        shutter.lift = 0;
        shutter.curtain.position.y = 0;
      }
      station.plate.lid.position.y = 0.105;
    }
    finalPanel.lampMat.emissive.set('#000000');
    finalPanel.halo.material.color.set(SWITCH_IDLE);
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
      for (const light of lamps) light.intensity = 40;
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
     * Where the bucket should be walking, while you are both in here.
     *
     * Not at you. It is a point in *its* lane, level with you — so the moment
     * you step through the red door it peels off into the left-hand hall and
     * paces you down it through the bars, which is where the room needs it and
     * where it would otherwise never go on its own.
     *
     * It used to just follow you, which meant it came through the door at your
     * heels into your lane, and getting it across was a chore you had to do by
     * hand at the fork before anything else could happen. That was the least
     * interesting thing in the room and it was the first thing the room asked
     * of you.
     *
     * Clamped short of any shutter of its own that is still down, because a
     * leash that pulls it into steel it cannot pass just makes it stand there
     * hopping — the stuck-hop reads "something is in the way" and tries to get
     * over it, forever. Stopped a metre short instead, it waits.
     *
     * Returns null when this is none of our business, and the caller follows
     * you the ordinary way.
     */
    friendTarget(bodyPosition, friendPosition) {
      if (!powered) return null;
      // Both of you, not just you. The doorway is 1.9m of a 5.2m wall, and a
      // leash into the left-hand lane pulls anything still on the other side of
      // it sideways into the wall *beside* the door — measured: the bucket got
      // as far as x -7.6, level with its lane and a metre and a half from the
      // opening, and stood there. Until it is through, it follows you through.
      if (!inHall(bodyPosition.x, bodyPosition.z)) return null;
      if (!inHall(friendPosition.x, friendPosition.z)) return null;
      leash.set(bodyPosition.x, bodyPosition.y, LANE_WALK);
      for (const station of stations) {
        if (!station.shutters[FRIEND_SIDE].open && leash.x < station.x + 1.2) {
          leash.x = station.x + 1.2;
        }
      }
      return leash;
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
          if (near && Math.abs(friend.position.y - station.plateTop) < 0.07) {
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
        // The lid's y is local to the plate group, which now sits on the deck,
        // so the numbers above are unchanged by the plate having gone up.
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
