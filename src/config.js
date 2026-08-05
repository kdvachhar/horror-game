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

// The room you wake up in. Set well away from the main building so nothing
// overlaps; you are moved here rather than walking.
export const MEDICAL = {
  center: [70, 0, 0],
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

// The room through that door. Small, low and bare — one light and nothing else.
export const BACK_ROOM = {
  width: 16,
  depth: 18,
  height: 8,
  /** Distance past the doorway that the single spotlight stands. */
  lightOffset: 3.2,
};

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
