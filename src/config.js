// Central tuning values. The room is deliberately oversized — the player should
// feel small, and the far wall should be far enough that the text reads as a
// landmark rather than a sign.

export const ROOM = {
  width: 44, // x
  depth: 42, // z
  height: 22,
};

// Fixtures hang well below the ceiling on long chains — in a room this tall,
// light mounted flush to the ceiling never reaches the floor.
export const FIXTURE_HEIGHT = 8.5;

// Doorway in the far wall, directly under the text.
export const DOOR = {
  width: 2.4,
  height: 3.4,
  /** The wall it sits in. */
  z: -ROOM.depth / 2,
};

// The room you wake up in.
//
// It used to sit at [70, 0, 0] — parked well away from the main building so
// nothing could overlap, with a copy of the dark room built next to it to walk
// back into. It is joined on properly now: the corridor past the ward opens
// through the dark room's far wall, and the room you come out into is that
// room, not a replica of it.
//
// The centre is what makes the two line up, and it is arithmetic, not taste.
// The medical block's own back room runs from z 8 to 26 in local coordinates
// and is sixteen wide about local x -1.5; putting that on top of BACK_ROOM,
// which runs from DOOR.z - depth to DOOR.z and is sixteen wide about x 0, is
// the only pair of numbers that works:
//
//   x:  0 - (-1.5)              =   1.5
//   z:  (DOOR.z - depth) - 8    = -21 - 18 - 8  = -47
//
// medicalRoom.js checks this at import and says so if it drifts.
export const MEDICAL = {
  center: [1.5, 0, -47],
  // Low ceilinged, and wide enough for a row of beds down each wall with the
  // wrecked ones dragged into the middle.
  width: 13,
  depth: 11,
  height: 3.6,
};

/**
 * Render layers. three.js filters lights by the *camera's* layers, not by each
 * object's, so a single pass cannot give one room ambient light and deny it to
 * another. The scene is drawn twice instead: once for MAIN with the room's
 * lights, once for DARK with only the spotlight. Depth is shared between the
 * passes, so the two rooms occlude each other correctly through the doorway.
 */
export const LAYER = { MAIN: 0, DARK: 1 };

// The room through that door. Small, low and bare — one light and nothing else,
// until you come back into it from the far end with the power on.
export const BACK_ROOM = {
  width: 16,
  depth: 18,
  height: 8,
  /** Distance past the doorway that the single spotlight stands. */
  lightOffset: 3.2,
};

/**
 * The second way into the back room: the corridor past the medical ward, in
 * its far wall.
 *
 * Shared between the two files that have to agree about it — room.js cuts the
 * hole and medicalRoom.js puts the door in it — so the wall and the door
 * cannot end up in different places. Its z is the far wall, derived rather
 * than written down, because DOOR.z moves when the editor resizes the hall and
 * this has to move with it.
 *
 * Off to one side rather than centred: opposite the hall doorway you would be
 * looking straight down the room at where you were taken, which gives the
 * whole thing away before you have crossed the floor. In the corner you come
 * out along the wall and have to turn.
 */
export const BACK_DOOR = {
  x: 6.9,
  width: 1.2,
  height: 2.3,
  get z() {
    return DOOR.z - BACK_ROOM.depth;
  },
};

/**
 * The red door in the back room's left-hand wall — the one the sign points at.
 *
 * Shared for the same reason BACK_DOOR is: room.js cuts the hole in the wall
 * and hangs the leaves, and gauntlet.js builds the hall on the other side, and
 * the two cannot be allowed to disagree about where the opening is. Its z is
 * derived from the far wall, so resizing the back room takes the door and the
 * hall behind it along with it.
 *
 * `inset` is measured from the far wall, so it sits a few metres along from the
 * corner you arrive at rather than jammed into it — you come out of the
 * corridor, read the sign, walk that way, and it is in front of you.
 *
 * `swing` used to be 1.9, which stood the leaves a little past square and sent
 * their free edges 0.88m back into a dead alcove built to receive them. There
 * is a hall through there now and its near wall is the outside face of this
 * one, a metre back, so the leaves are folded further — at 2.15 they lie nearly
 * flat along the wall, 0.78m back, and clear it.
 */
export const SIDE_DOOR = {
  width: 1.9,
  height: 2.6,
  inset: 3.6,
  swing: 2.15,
  /** The wall it sits in. */
  get x() {
    return -BACK_ROOM.width / 2;
  },
  get z() {
    return DOOR.z - BACK_ROOM.depth + SIDE_DOOR.inset;
  },
};

/**
 * What the red door is made of, for the doors at both ends of the hall behind
 * it.
 *
 * Shared for the same reason SIDE_DOOR is: two files build these, and a pair of
 * doors meant to be the same kit stop being it the moment one of them is
 * retuned. The way out at the far end used to be its own colour with a metalness
 * of 0.4, and under six red lamps that read as orange — a different door, in a
 * hall where the doors being the same is the only thing saying you are still
 * inside the same building.
 *
 * Authored dark, like everything else in this project that is lit: ACES lifts
 * hard through the mids, and a red picked at the value you want it to read as
 * comes out pink.
 */
export const DOOR_RED = {
  leaf: '#4a0f0c',
  trim: '#3b4240',
  hazard: '#8d7a2e',
  roughness: 0.66,
  metalness: 0.08,
};

/**
 * And the orange one, on the left wall of the room behind the hall: the way on
 * to whatever is next.
 *
 * The same kit in a different colour, and the colour is the whole job it does.
 * Every door you have been through so far has been red, and red is the way you
 * came; this is the first one that is not, and it opens on its own when the
 * thing on the screen has finished with you.
 *
 * Authored dark like the red one — it is under a white lamp rather than red
 * ones, which is more light, not less, and ACES lifts hard through the mids.
 * A leaf picked at the orange you want it to read as comes out apricot.
 */
export const DOOR_ORANGE = {
  leaf: '#7c3a10',
  trim: '#3b4240',
  hazard: '#8d7a2e',
  roughness: 0.66,
  metalness: 0.08,
};

/**
 * Whether a world position is standing in the back room.
 *
 * The test used to be `z < DOOR.z` — everything past the hall's far wall was
 * the dark room, because nothing else was back there. The medical block is now,
 * all of it, so that test claims the ward, the corridor and the store room too
 * and would put anything standing in them into the dark pass, where the only
 * light is a spotlight eighteen metres away through a wall.
 */
export function insideBackRoom(x, z) {
  const half = BACK_ROOM.width / 2;
  return x > -half && x < half && z > DOOR.z - BACK_ROOM.depth && z < DOOR.z;
}

export const PLAYER = {
  eyeHeight: 1.68,
  radius: 0.42,
  walkSpeed: 3.1,
  runSpeed: 5.6,
  accel: 34,
  damping: 11,
  lookSensitivity: 0.0022,
  bobFrequency: 9.5,
  bobAmplitude: 0.055,
  // Tuned together: peak height is jumpSpeed^2 / (2 * gravity), ~1.3m, which
  // clears the tallest crate in the room with a little to spare.
  jumpSpeed: 7.6,
  gravity: 22,
  // Metres covered per footstep. Running strides are longer, so the cadence
  // rises less than the speed does — which is how real running sounds.
  walkStride: 1.25,
  runStride: 1.7,
};

// Spawn against the back wall, facing -Z, which is the wall carrying the text.
// position is the player's feet, not the camera.
export const SPAWN = {
  position: [0, 0, ROOM.depth / 2 - 4],
  yaw: 0,
};

// The machine sits at the centre of the room with its conveyor running toward
// the text wall, so the belt leads your eye straight to it.
export const MACHINE = {
  center: [0, 0, 0],
  bodyWidth: 5.2,
  plinthHeight: 0.5,
  bodyHeight: 2.6,
  tankRadius: 1.8,
  tankHeight: 3.4,
  // The conveyor runs out to +X so it's side-on from the spawn point rather
  // than hidden behind the machine.
  // Starts inside the housing so the hood emerges from it rather than floating
  // alongside. bodyWidth / 2 is the housing face, at 2.6.
  conveyorStart: 1.6,
  conveyorLength: 12,
  conveyorWidth: 2.4,
  beltHeight: 1.3,
  gooColor: 0xa855f7,
};

export const WALL_TEXT = "Can't Make friends? Create one yourself!";

// Cycled per character, in order, forever.
export const TEXT_COLORS = ['#3dff88', '#3aa2ff', '#a855f7'];
