import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  worldRepeat,
} from './textures.js';
import { setObjective, showNote } from './hud.js';
import { playButtonPress, playWardDoor } from './audio.js';

/**
 * The room on the other side of the red hall's way out.
 *
 * Small on purpose. The hall is thirty-nine metres of running and climbing with
 * a wall coming; what is through the door at the end of it should be four walls,
 * a light, and something to do with your hands. Arriving somewhere is the
 * reward, and a second big space would take it back.
 *
 * It replaces the dead landing's back wall. That wall existed because a way out
 * that opened onto the outside of the world would say there is no more level
 * far louder than a small dark room does — which was the right call while there
 * was nothing to build behind it.
 *
 * The doorway is passed in rather than written down again. gauntlet.js cuts the
 * hole and lines the landing, this builds what is on the far side of it, and two
 * files agreeing about one opening by both being handed the same numbers is the
 * only arrangement that cannot drift. Same reason SIDE_DOOR lives in config.
 */
const DEPTH = 7.2;
const HALF_WIDTH = 4;
const HEIGHT = 3.4;

/** Concrete, a shade off the hall's red — you are out of it, and it should look it. */
const WALL_TINT = '#8f8d86';
const FLOOR_TINT = '#7c7a75';
const TRIM = '#3c4147';

/** What the console has to say for itself, once it is awake. */
const SCREEN_LINES = [
  'CORRIDOR 3',
  'CYCLE COMPLETE',
  '',
  'SUBJECT UPRIGHT',
  'ASSET RECOVERED',
  '',
  'PREPARING NEXT ROOM',
];

/**
 * The screen face, drawn to a canvas.
 *
 * Unlit and exempt from tone mapping, the same as the television's face in the
 * ward: ACES lifts hard through the mids, and a green picked at the value you
 * want to read comes out mint. Drawn rather than modelled because a terminal is
 * mostly text, and text out of boxes is a lot of boxes.
 */
function makeScreenTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#04120a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Scan lines. Cheap, and the single thing that says screen rather than sign.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let y = 0; y < canvas.height; y += 4) ctx.fillRect(0, y, canvas.width, 2);

  ctx.font = '600 30px "Courier New", monospace';
  ctx.textBaseline = 'top';
  SCREEN_LINES.forEach((line, i) => {
    if (!line) return;
    const y = 34 + i * 44;
    // Drawn twice, the second pass blurred, so the glyphs bloom the way a tube
    // does instead of sitting on the glass like print.
    ctx.fillStyle = 'rgba(96, 226, 128, 0.35)';
    ctx.fillText(line, 40, y + 1);
    ctx.fillStyle = '#8dffb0';
    ctx.fillText(line, 38, y);
  });

  // A cursor, on the line after the last thing it said.
  ctx.fillStyle = '#8dffb0';
  ctx.fillRect(38, 34 + SCREEN_LINES.length * 44, 20, 30);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createExitRoom({ scene, doorway }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const colliders = [];
  const interactions = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  let powered = false;
  let awake = false;
  let entered = false;

  // The near wall is the plane the landing ends on; the room runs on from there.
  const near = doorway.x;
  const far = near - DEPTH;
  const axis = doorway.z;
  const midX = (near + far) / 2;

  const wallSurface = makeWallSurface(...worldRepeat(DEPTH, HEIGHT), WALL_TINT);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPTH, HALF_WIDTH * 2),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(DEPTH, HALF_WIDTH * 2)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, axis);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPTH, HALF_WIDTH * 2),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(DEPTH, HALF_WIDTH * 2)),
      color: '#6f6d68',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, HEIGHT, axis);
  group.add(ceiling);

  // The two long walls, and the far one.
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPTH, HEIGHT),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    wall.position.set(midX, HEIGHT / 2, axis + side * HALF_WIDTH);
    wall.rotation.y = side === 1 ? Math.PI : 0;
    wall.receiveShadow = true;
    group.add(wall);
    solid(far - 1, near + 1, Math.min(axis + side * HALF_WIDTH, axis + side * (HALF_WIDTH + 1)),
      Math.max(axis + side * HALF_WIDTH, axis + side * (HALF_WIDTH + 1)), {});
  }

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_WIDTH * 2, HEIGHT),
    new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
  );
  back.position.set(far, HEIGHT / 2, axis);
  back.rotation.y = Math.PI / 2;
  back.receiveShadow = true;
  group.add(back);
  solid(far - 1, far, axis - HALF_WIDTH, axis + HALF_WIDTH, {});

  // The near wall, round the way in. Three pieces, the way every other wall in
  // this game that has a hole in it is built.
  const openLow = axis - doorway.width / 2;
  const openHigh = axis + doorway.width / 2;
  for (const [pw, ph, pz, py] of [
    [openLow - (axis - HALF_WIDTH), HEIGHT, (axis - HALF_WIDTH + openLow) / 2, HEIGHT / 2],
    [axis + HALF_WIDTH - openHigh, HEIGHT, (openHigh + axis + HALF_WIDTH) / 2, HEIGHT / 2],
    [doorway.width, HEIGHT - doorway.height, axis, (HEIGHT + doorway.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    mesh.position.set(near, py, pz);
    mesh.rotation.y = -Math.PI / 2;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Only the two cheeks are solid. The lintel is above head height and giving it
  // a box would put a ceiling across the doorway you walk through.
  solid(near, near + 1, axis - HALF_WIDTH, openLow, {});
  solid(near, near + 1, openHigh, axis + HALF_WIDTH, {});

  // ------------------------------------------------------------------ light ---

  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.3 });
  const tubeMat = new THREE.MeshStandardMaterial({
    color: '#d8d6cc',
    roughness: 0.4,
    emissive: '#000000',
  });

  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1.9), trimMat);
  fixture.position.set(midX + 0.6, HEIGHT - 0.12, axis);
  group.add(fixture);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), tubeMat);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(midX + 0.6, HEIGHT - 0.2, axis);
  group.add(tube);

  // One light, built with the room and turned up rather than added when the
  // power arrives. Changing the number of lights in the scene rebuilds every
  // material that can be lit — measured at whole seconds — so nothing in this
  // project ever adds or removes one at runtime. No shadow: the hall's own
  // fixtures gave theirs up for the same reason.
  const lamp = new THREE.PointLight(0xffe9d5, 0, 22, 2);
  lamp.position.set(midX + 0.6, HEIGHT - 0.45, axis);
  group.add(lamp);

  // ---------------------------------------------------------------- console ---

  // Authored two stops down, the way everything lit in this project has to be:
  // at an exposure of 1.42 ACES lifts hard through the mids, and a mid grey desk
  // comes out the colour of a fridge.
  const deskMat = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.7, metalness: 0.25 });
  const caseMat = new THREE.MeshStandardMaterial({ color: '#26291f', roughness: 0.75, metalness: 0.1 });

  const DESK_X = far + 0.75;
  const DESK_TOP = 0.78;

  const desk = new THREE.Group();
  desk.position.set(DESK_X, 0, axis);
  group.add(desk);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 2.4), deskMat);
  slab.position.y = DESK_TOP - 0.035;
  slab.castShadow = true;
  slab.receiveShadow = true;
  desk.add(slab);

  for (const z of [-1.05, 1.05]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, DESK_TOP - 0.07, 0.06), deskMat);
    leg.position.set(0, (DESK_TOP - 0.07) / 2, z);
    desk.add(leg);
  }
  solid(DESK_X - 0.45, DESK_X + 0.45, axis - 1.2, axis + 1.2, { top: DESK_TOP });

  // The monitor: a deep case with the glass set back in it, facing the door.
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.72), caseMat);
  monitor.position.set(-0.05, DESK_TOP + 0.29, -0.35);
  monitor.castShadow = true;
  desk.add(monitor);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.6), caseMat);
  bezel.position.set(0.27, DESK_TOP + 0.3, -0.35);
  desk.add(bezel);

  const darkGlass = new THREE.MeshStandardMaterial({
    color: '#0a0f0c',
    roughness: 0.25,
    metalness: 0.15,
  });
  // Unlit, so it is the value written down and not what the room does to it.
  const litGlass = new THREE.MeshBasicMaterial({ map: makeScreenTexture(), toneMapped: false });

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), darkGlass);
  screen.position.set(0.29, DESK_TOP + 0.3, -0.35);
  screen.rotation.y = Math.PI / 2;
  desk.add(screen);

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.62), caseMat);
  keyboard.position.set(0.15, DESK_TOP + 0.02, 0.42);
  keyboard.rotation.z = -0.04;
  desk.add(keyboard);

  // A conduit off the back of it and up the wall, so the thing is plugged into
  // the building rather than standing in it.
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), trimMat);
  conduit.position.set(far + 0.12, 0.75, axis - 0.9);
  group.add(conduit);

  // ----------------------------------------------------------------- button ---

  const PLINTH_X = near - 2.4;
  const PLINTH_TOP = 1.02;

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.5, PLINTH_TOP, 0.5), deskMat);
  plinth.position.set(PLINTH_X, PLINTH_TOP / 2, axis);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
  solid(PLINTH_X - 0.25, PLINTH_X + 0.25, axis - 0.25, axis + 0.25, { top: PLINTH_TOP });

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 16), trimMat);
  collar.position.set(PLINTH_X, PLINTH_TOP + 0.03, axis);
  group.add(collar);

  const capMat = new THREE.MeshStandardMaterial({ color: '#5e1410', roughness: 0.45 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 16), capMat);
  cap.position.set(PLINTH_X, PLINTH_TOP + 0.1, axis);
  group.add(cap);

  // The state light is a ring round the cap and not the cap itself. Red to
  // green is the language every switch in the hall already speaks, and making
  // the head of a mushroom button emissive instead just turns it a colour no
  // button has ever been.
  const ringMat = new THREE.MeshStandardMaterial({
    color: '#8e1a12',
    roughness: 0.4,
    emissive: '#000000',
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 8, 20), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(PLINTH_X, PLINTH_TOP + 0.055, axis);
  group.add(ring);

  interactions.push({
    position: new THREE.Vector3(PLINTH_X, PLINTH_TOP + 0.1, axis),
    label: 'Press the button',
    range: 1.5,
    once: false,
    enabled: () => powered && !awake,
    onInteract() {
      if (awake) return;
      awake = true;
      playButtonPress();
      playWardDoor(0.6);
      screen.material = litGlass;
      ringMat.color.set('#2fd46a');
      ringMat.emissive.set('#12561f');
      cap.position.y = PLINTH_TOP + 0.075;
      showNote('The console wakes up.', 2.4);
      setObjective('Read the console');
    },
  });

  interactions.push({
    position: new THREE.Vector3(DESK_X + 0.3, DESK_TOP + 0.3, axis - 0.35),
    label: 'Read the console',
    range: 1.6,
    once: false,
    enabled: () => powered && awake,
    onInteract() {
      showNote(SCREEN_LINES.filter(Boolean).join(' · '), 5);
      setObjective('Wait for the next room');
    },
  });

  /** Inside the room at all. Used to decide when to say you have arrived. */
  const contains = (x, z) =>
    x < near && x > far && z > axis - HALF_WIDTH && z < axis + HALF_WIDTH;

  return {
    group,
    colliders,
    interactions,
    contains,

    get isAwake() {
      return awake;
    },

    /** On the same switch as the hall — it is the far end of the same circuit. */
    powerUp() {
      if (powered) return;
      powered = true;
      group.visible = true;
      lamp.intensity = 48;
      tubeMat.emissive.set('#4a4a44');
    },

    powerDown() {
      powered = false;
      awake = false;
      group.visible = false;
      lamp.intensity = 0;
      tubeMat.emissive.set('#000000');
      screen.material = darkGlass;
      ringMat.color.set('#8e1a12');
      ringMat.emissive.set('#000000');
      cap.position.y = PLINTH_TOP + 0.1;
    },

    /** Says the room's one line, the first time you are actually standing in it. */
    update(bodyPosition) {
      if (!powered || entered) return;
      if (!contains(bodyPosition.x, bodyPosition.z)) return;
      entered = true;
      setObjective('See what is in here');
    },
  };
}
