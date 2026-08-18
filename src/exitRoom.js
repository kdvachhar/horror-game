import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  worldRepeat,
} from './textures.js';
import { setObjective, showNote } from './hud.js';
import { playButtonPress, playWardDoor } from './audio.js';
import { buildTelevision, createScreenLife } from './screenFace.js';
import { createWallArms } from './wallArms.js';
import { blackWireMaterial, buildWirePort } from './wire.js';

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
/**
 * Taller than a service room needs to be, because of what is on the far wall.
 * The television is 1.9 high and throws loose wires a metre past the top of its
 * casing; at 3.4 they went through the ceiling.
 */
const HEIGHT = 4.2;

/** Concrete, a shade off the hall's red — you are out of it, and it should look it. */
const WALL_TINT = '#8f8d86';
const FLOOR_TINT = '#7c7a75';
const TRIM = '#3c4147';

/**
 * What it says when you wake it up.
 *
 * The same voice as the television in the ward, because it is the same thing:
 * it went dark when it had said its piece, and the next screen it appears on is
 * at the far end of the room it just watched you run. Pleased with itself,
 * which is the only register this character has.
 */
const CONSOLE_LINES = [
  { text: 'Oh — you made it.', hold: 2.2 },
  { text: 'Corridor three. Both of you, even.', hold: 2.9, eyes: 'closed', arms: 'crossed' },
  { text: 'I am preparing the next room.', hold: 2.8 },
  { text: 'Don\u2019t go far.', hold: 2.4, eyes: 'closed' },
];

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
  /** Counts down from the button to the first word. */
  let wakeIn = 0;

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

  /**
   * And the screen it is on: the ward's television, the same object at the same
   * size, mounted on the far wall above the desk.
   *
   * It had its own small monitor here first, with the face scaled down to fit
   * the glass. That was wrong. The set is as much the character as the eyes
   * are — a wide grey box with the face floating in far too much screen, loose
   * wires out of the top and bottom, and its own green glow on the wall — and
   * shrunk onto a desk it read as a computer with a face on it rather than as
   * the thing that talked to you in the ward.
   */
  const television = buildTelevision();
  // Against the wall, turned to face the door, and hung so its bottom edge
  // clears the desk in front of it.
  television.group.position.set(far + television.depth / 2 + 0.02, 2.05, axis);
  television.group.rotation.y = Math.PI / 2;
  group.add(television.group);

  // Its glow is part of the set, so it comes with it — that is a second light
  // in this room and it is not free, because in a forward renderer every light
  // is shaded on every surface in the world. It is worth it: the green thrown
  // on the wall behind is how you know from the doorway that the thing is on.
  const life = createScreenLife({
    eyes: television.eyes,
    mouth: television.mouth,
    faceParts: television.faceParts,
    glow: television.glow,
  });

  /**
   * And its arms, out of the wall either side of it.
   *
   * They are not attached to the television in the ward and they are not
   * attached to it here — that is the whole of the effect, and it is why they
   * are built by the character rather than by whichever room it turns up in.
   *
   * The anchor is what tells them where the wall is and which way it faces:
   * this one is turned a quarter turn, because the ward's wall looks down the
   * room in +z and this one looks back up the hall in +x. Everything in the
   * arms is written in the wall's own frame and this is the only place that
   * knows the difference.
   */
  const armAnchor = new THREE.Group();
  armAnchor.position.set(far, 0, axis);
  armAnchor.rotation.y = Math.PI / 2;
  group.add(armAnchor);
  const wallArms = createWallArms({
    parent: armAnchor,
    colliders,
    origin: new THREE.Vector3(far, 0, axis),
    yaw: Math.PI / 2,
    startRetracted: true,
  });
  /**
   * How far up the picture is, 0 to 1.
   *
   * The set is always there — dead casing, dark tube, wires — and this is what
   * arrives when the button goes in. Hiding the whole television and switching
   * it on read as a rendering fault rather than as a fright: four metres of grey
   * box does not appear in a lit room. It is the same fade the ward uses when it
   * goes dark, run the other way.
   */
  let lit = 0;

  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.62), caseMat);
  keyboard.position.set(0.15, DESK_TOP + 0.02, 0.42);
  keyboard.rotation.z = -0.04;
  desk.add(keyboard);

  // A conduit off the back of it and up the wall, so the thing is plugged into
  // the building rather than standing in it.
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), trimMat);
  conduit.position.set(far + 0.12, 0.75, axis - 0.9);
  group.add(conduit);

  // ------------------------------------------------------------- the wire ---

  /**
   * The black wire, arriving.
   *
   * The far end of the cable that comes out of the television in the ward. It
   * crosses the back room, goes under the red door, runs the whole length of the
   * red hall at the foot of the divider, and goes into the wall beside the way
   * out; this is it coming out of the other face of that wall and going into the
   * set on the end wall in here.
   *
   * That is the only reason it is worth having. Two screens with the same face
   * on them are a repeated prop; two screens with one cable between them are one
   * thing in two places, and the cable is the only part of that claim the player
   * can check. It is the last thing you walked past on the way in.
   *
   * The hole is not written down here. gauntlet.js hands its z, its height and
   * the cable's thickness over with the doorway, because it is the same hole
   * seen from the other side and a second opinion about where it is would put a
   * kink inside a wall that neither file can see.
   */
  {
    const { z: portZ, y: portY, radius: r } = doorway.wire;

    const port = buildWirePort();
    port.position.set(near - 0.02, portY, portZ);
    // Turned to face into the room: the hall's one faces back up the hall.
    port.rotation.y = Math.PI;
    group.add(port);

    // Out of the wall, down to the floor, along the room a little wide of the
    // desk, and up the far wall into the underside of the casing among the
    // loose wires already hanging off it.
    const RUN_Z = axis - 1.45;
    const curve = new THREE.CatmullRomCurve3(
      [
        [near - 0.14, portY, portZ],
        [near - 0.55, 0.24, portZ - 0.08],
        [near - 1.3, r, axis - 1.36],
        [near - 3.2, r, RUN_Z - 0.06],
        [far + 2.2, r, RUN_Z + 0.05],
        [far + 0.62, r, RUN_Z],
        [far + 0.16, 0.26, RUN_Z],
        [far + 0.1, 0.86, RUN_Z],
        // Six centimetres past the bottom edge of the casing, so it ends inside
        // the set rather than against it.
        [far + 0.13, 1.16, RUN_Z + 0.05],
      ].map((p) => new THREE.Vector3(...p))
    );

    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 90, r, 6, false),
      blackWireMaterial()
    );
    wire.castShadow = true;
    wire.receiveShadow = true;
    group.add(wire);

    // Clips on the floor run only — a saddle screwed to mid-air up the wall
    // would be a saddle screwed to nothing.
    const clipMat = new THREE.MeshStandardMaterial({
      color: '#3a3d3f',
      roughness: 0.6,
      metalness: 0.05,
    });
    const clips = Math.round(curve.getLength() / 2.5);
    for (let i = 1; i < clips; i++) {
      const at = curve.getPointAt(i / clips);
      if (at.y > 0.2) continue;
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.06), clipMat);
      saddle.position.set(at.x, 0.015, at.z);
      saddle.rotation.y = Math.random() * Math.PI;
      group.add(saddle);
    }
  }

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
      ringMat.color.set('#2fd46a');
      ringMat.emissive.set('#12561f');
      cap.position.y = PLINTH_TOP + 0.075;
      // A beat before it says anything. Screens take a moment to come up, and
      // the face arriving in silence and *then* speaking is a great deal worse
      // to be in a room with than one that talks the instant it appears.
      wakeIn = 1.1;
      setObjective('Listen');
    },
  });

  interactions.push({
    // On the set itself rather than on the desk under it: it is the thing you
    // would be talking to.
    position: new THREE.Vector3(far + 0.4, 2.05, axis),
    label: 'Ask it again',
    range: 2.1,
    once: false,
    enabled: () => powered && awake && wakeIn <= 0 && !life.isSpeaking,
    onInteract() {
      life.speak(CONSOLE_LINES);
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
      entered = false;
      wakeIn = 0;
      lit = 0;
      life.stop();
      group.visible = false;
      lamp.intensity = 0;
      tubeMat.emissive.set('#000000');
      ringMat.color.set('#8e1a12');
      ringMat.emissive.set('#000000');
      cap.position.y = PLINTH_TOP + 0.1;
    },

    get isSpeaking() {
      return life.isSpeaking;
    },

    update(delta, bodyPosition) {
      if (!powered) return;

      if (!entered && contains(bodyPosition.x, bodyPosition.z)) {
        entered = true;
        setObjective('See what is in here');
      }

      // The picture coming up, and then the face on it. Both run every frame
      // rather than only while it is awake, so the blink and the breathing
      // carry on between the lines instead of freezing mid-sentence.
      if (awake) lit += (1 - lit) * (1 - Math.exp(-3.2 * delta));
      if (wakeIn > 0) {
        wakeIn -= delta;
        if (wakeIn <= 0) life.speak(CONSOLE_LINES);
      }
      life.update(delta, lit);
      // The arms come out of the wall with the picture and go back into it if
      // the room is ever wound down, which is the same movement the ward uses
      // when the thing has said its piece — run backwards to arrive.
      wallArms.update(delta, {
        speaking: life.isSpeaking,
        cross: life.line?.arms === 'crossed',
        retract: !awake,
      });
    },
  };
}
