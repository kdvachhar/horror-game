import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  worldRepeat,
} from './textures.js';
import { DOOR_ORANGE } from './config.js';
import { setObjective, showNote } from './hud.js';
import { playButtonPress, playWardDoor } from './audio.js';
import { buildTelevision, createScreenLife, FACE } from './screenFace.js';
import { createWallArms } from './wallArms.js';
import { blackWireMaterial, buildWirePort, chargeWire, setWireCurrent } from './wire.js';

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
 * What it says when you wake it up, and the only thing it says.
 *
 * The same voice as the television in the ward, because it is the same thing:
 * it went dark when it had said its piece, and the next screen it appears on is
 * at the far end of the room it just watched you run. Pleased with itself,
 * which is the only register this character has — it apologises for the hall in
 * the same breath as it explains what the hall was for, and what it was for is
 * the worst thing anything in this game has said out loud.
 *
 * Then it goes out, and there is no asking it again. A thing that will repeat
 * that on request is a menu rather than a character.
 */
const CONSOLE_LINES = [
  { text: 'You made it.', hold: 1.6, frown: true },
  { text: 'Sorry about the trouble getting here.', hold: 2.0, eyes: 'closed', frown: true },
  { text: 'That spike wall used to be a scanner.', hold: 2.0, frown: true },
  { text: 'It would close the door and send the children back.', hold: 2.6, frown: true },
  // Split at the comma rather than mid-clause. The voice takes its pauses from
  // the punctuation, so a line cut anywhere else is heard as a stumble.
  {
    text: 'Eventually, the smarter experiments replaced it with spikes,',
    hold: 1.2,
    arms: 'crossed',
    frown: true,
  },
  // The only line in the building with the brows on it — and the eyes have to
  // be open for that, so this one lost the shut-eyed delivery it had. It is the
  // better reading anyway: it says this one looking at you.
  {
    text: 'to kill all the remaining people in the building.',
    hold: 2.8,
    arms: 'crossed',
    brows: 'angry',
    frown: true,
  },
  { text: 'Anyway. Go through this door to your next challenge.', hold: 2.6, frown: true },
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
  /**
   * True from the last word to the end of time.
   *
   * It says its piece once and goes out — the same exit the ward's set makes,
   * which is how you know it is the same thing making it. Kept separate from
   * `awake` because the two are not opposites here: it is awake right up until
   * it isn't, and what the arms and the picture do on the way out is run off
   * this rather than off the button being un-pressed, which never happens.
   */
  let shutting = false;

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

  // The right-hand wall, whole — the left one has a door in it and is built
  // below with the rest of that.
  {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPTH, HEIGHT),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    wall.position.set(midX, HEIGHT / 2, axis - HALF_WIDTH);
    wall.receiveShadow = true;
    group.add(wall);
    solid(far - 1, near + 1, axis - HALF_WIDTH - 1, axis - HALF_WIDTH, {});
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

  // ------------------------------------------------------------- the way on ---

  /**
   * The orange door in the left-hand wall, and the dark it opens onto.
   *
   * Left as you come in, which is the wall you are facing when you turn from
   * the screen. It is shut and unremarkable for the whole of the scene — the
   * room reads as a dead end with a television in it — and it opens on its own
   * the moment the thing on the screen goes out, which is the last instruction
   * it gives you.
   *
   * Orange because every door in this building so far has been red, and red is
   * the way you came. See DOOR_ORANGE.
   */
  const WAY_ON = { width: 1.8, height: 2.5, depth: 2.6, slide: 1.86 };
  const wayZ = axis + HALF_WIDTH;
  const wayLow = midX - WAY_ON.width / 2;
  const wayHigh = midX + WAY_ON.width / 2;

  // The wall it is cut into, in three pieces.
  for (const [pw, ph, px, py] of [
    [wayLow - far, HEIGHT, (far + wayLow) / 2, HEIGHT / 2],
    [near - wayHigh, HEIGHT, (wayHigh + near) / 2, HEIGHT / 2],
    [WAY_ON.width, HEIGHT - WAY_ON.height, midX, (HEIGHT + WAY_ON.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    mesh.position.set(px, py, wayZ);
    mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  solid(far - 1, wayLow, wayZ, wayZ + 1, {});
  solid(wayHigh, near + 1, wayZ, wayZ + 1, {});

  /**
   * What is through it: a lined passage that stops in the dark.
   *
   * Not a wall you can see. A door that opens onto a flat black plane at arm's
   * length says there is nothing built past this, which is true and is the last
   * thing the scene should be saying out loud — it has just promised you a next
   * challenge. Two and a half metres of concrete going out of the light says
   * the same thing the corridor past the ward said: it carries on, and you
   * cannot see how far.
   */
  {
    const liner = new THREE.MeshStandardMaterial({ color: '#3a3833', roughness: 0.9 });
    const zEnd = wayZ + WAY_ON.depth;
    for (const [x, turn] of [[wayLow, 0], [wayHigh, Math.PI]]) {
      const cheek = new THREE.Mesh(new THREE.PlaneGeometry(WAY_ON.depth, WAY_ON.height), liner);
      cheek.position.set(x, WAY_ON.height / 2, wayZ + WAY_ON.depth / 2);
      cheek.rotation.y = Math.PI / 2 + turn;
      group.add(cheek);
    }
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(WAY_ON.width, WAY_ON.depth), liner);
    lid.rotation.x = Math.PI / 2;
    lid.position.set(midX, WAY_ON.height, wayZ + WAY_ON.depth / 2);
    group.add(lid);

    const deck = new THREE.Mesh(new THREE.PlaneGeometry(WAY_ON.width, WAY_ON.depth), liner);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(midX, 0.003, wayZ + WAY_ON.depth / 2);
    deck.receiveShadow = true;
    group.add(deck);

    // It used to be capped: a black plane across the end and a collider behind
    // it, so the passage went nowhere and said so quietly. orangeRoom.js is
    // built on the far end of it now — see `wayOn` — so the cap is gone and the
    // near wall of that room is what you come out into. Only the sides are
    // still solid, so you cannot walk out through the length of it.
    solid(far - 1, wayLow, wayZ, zEnd + 1, {});
    solid(wayHigh, near + 1, wayZ, zEnd + 1, {});
  }

  /**
   * The leaf. The red door's kit in orange, and it slides, like the way out of
   * the hall does — the doors in this building do not swing, they are pulled
   * aside by something you never see.
   */
  const wayDoor = new THREE.Group();
  const waySit = (WAY_ON.height - 0.04) / 2;
  {
    const leafMat = new THREE.MeshStandardMaterial({
      color: DOOR_ORANGE.leaf,
      roughness: DOOR_ORANGE.roughness,
      metalness: DOOR_ORANGE.metalness,
    });
    const doorTrim = new THREE.MeshStandardMaterial({
      color: DOOR_ORANGE.trim,
      roughness: 0.5,
      metalness: 0.2,
    });
    const doorHazard = new THREE.MeshStandardMaterial({ color: DOOR_ORANGE.hazard, roughness: 0.7 });

    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(WAY_ON.width - 0.04, WAY_ON.height - 0.04, 0.16),
      leafMat
    );
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    wayDoor.add(leaf);

    // The face you meet it on is -z, into the room.
    const face = -0.08;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(WAY_ON.width - 0.24, 0.1, 0.03),
      doorTrim
    );
    rail.position.set(0, 1.35 - waySit, face - 0.015);
    wayDoor.add(rail);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(WAY_ON.width - 0.16, 0.26, 0.012),
      doorHazard
    );
    stripe.position.set(0, 0.22 - waySit, face - 0.012);
    wayDoor.add(stripe);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, WAY_ON.width - 0.42, 10),
      doorTrim
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.05 - waySit, face - 0.05);
    bar.castShadow = true;
    wayDoor.add(bar);

    for (const bx of [-1, 1]) {
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), doorTrim);
      mount.position.set(bx * ((WAY_ON.width - 0.44) / 2), 1.05 - waySit, face - 0.01);
      wayDoor.add(mount);
    }

    // Hangers up to a track, the same arrangement the way out of the hall has.
    for (const bx of [-1, 1]) {
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 0.05), doorTrim);
      hanger.position.set(bx * 0.6, WAY_ON.height + 0.07 - waySit, -0.02);
      hanger.castShadow = true;
      wayDoor.add(hanger);
    }

    const trackNear = wayHigh + 0.12;
    const trackFar = midX - WAY_ON.slide - (WAY_ON.width - 0.04) / 2 - 0.06;
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(trackNear - trackFar, 0.11, 0.1),
      doorTrim
    );
    track.position.set((trackNear + trackFar) / 2, WAY_ON.height + 0.13, wayZ - 0.05);
    track.castShadow = true;
    group.add(track);
  }
  wayDoor.position.set(midX, waySit, wayZ - 0.08);
  group.add(wayDoor);

  // Solid wherever the leaf is, the same as the hall's: it parks against the
  // inside face of the wall and stands proud of it.
  const wayBox = { minX: midX, maxX: midX, minZ: wayZ - 0.2, maxZ: wayZ };
  colliders.push(wayBox);
  const carryWayDoor = () => {
    const half = (WAY_ON.width - 0.04) / 2;
    wayBox.minX = wayDoor.position.x - half;
    wayBox.maxX = wayDoor.position.x + half;
  };
  carryWayDoor();

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

  // The dead tube's own colour, kept so the charge landing can be measured from
  // it rather than from a second copy of the number screenFace.js picked — and
  // what it lifts towards, which is the face's green because it is the face's
  // charge arriving.
  const screenBase = television.screen.material.color.clone();
  const SURGE = new THREE.Color(FACE);

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
  /**
   * What is landing at the end of the cable, this frame. Driven into the face
   * below — the charge does not stop at the last vertex, it goes into him.
   */
  let arrival = () => 0;
  /**
   * The last charge to land, decaying.
   *
   * Held rather than read straight off the cable. The pulse has a hard front —
   * eleven centimetres of head on a run travelling five and a half metres a
   * second — so a raw read is one frame bright and gone, which at speed is a
   * dropped frame rather than a flash. It takes the peak instantly and lets go
   * of it slowly, which is what a tube does anyway.
   */
  let surge = 0;

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
    ({ arrival } = chargeWire(wire, curve.getLength()));

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

  /**
   * On the right-hand wall — right as you come in, which is the only way in.
   *
   * It has been three places now and each move was the same argument. On a
   * plinth in the middle of the floor it put six metres between the thing you
   * press and the thing that answers; on the end wall beside the set it was
   * close, but wedged into 0.57 of bare wall between the casing and an arm port
   * with nothing either side of it to spare. Here it has the whole wall, it is
   * on your right hand as you walk in, and it is still level with the set: you
   * turn to press it and the face comes on beside you rather than behind you.
   *
   * The wall runs the depth of the room and there is nothing else on it, so the
   * only number worth arguing about is how far down it goes. Two metres in from
   * the end wall keeps it in the half of the room the console is in, which is
   * where you are looking when you arrive.
   */
  const BUTTON_WALL_Z = axis - HALF_WIDTH;
  const BUTTON_X = far + 2.0;
  const BUTTON_Y = 1.3;
  /** How far off the wall the face of it stands. */
  const BUTTON_OUT = 0.11;

  const backplate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.07), deskMat);
  backplate.position.set(BUTTON_X, BUTTON_Y, BUTTON_WALL_Z + 0.035);
  backplate.castShadow = true;
  backplate.receiveShadow = true;
  group.add(backplate);

  // A quarter turn on the two cylinders: one is born standing up, and a button
  // on a wall lies on its side pointing into the room. The ring needs none —
  // a torus is born in the xy plane, which is this wall.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 16), trimMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(BUTTON_X, BUTTON_Y, BUTTON_WALL_Z + BUTTON_OUT - 0.06);
  group.add(collar);

  const capMat = new THREE.MeshStandardMaterial({ color: '#5e1410', roughness: 0.45 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 16), capMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(BUTTON_X, BUTTON_Y, BUTTON_WALL_Z + BUTTON_OUT);
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
  ring.position.set(BUTTON_X, BUTTON_Y, BUTTON_WALL_Z + BUTTON_OUT - 0.045);
  group.add(ring);

  interactions.push({
    position: new THREE.Vector3(BUTTON_X, BUTTON_Y, BUTTON_WALL_Z + BUTTON_OUT),
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
      // It goes in, rather than down.
      cap.position.z = BUTTON_WALL_Z + BUTTON_OUT - 0.025;
      // And the cable comes alive, the whole way back to the ward. It is the
      // one thing in the room that answers the button *before* the screen does
      // — the charge is already running past your feet and out of the door
      // while the tube is still coming up.
      setWireCurrent(true);
      // A beat before it says anything. Screens take a moment to come up, and
      // the face arriving in silence and *then* speaking is a great deal worse
      // to be in a room with than one that talks the instant it appears.
      wakeIn = 1.1;
      setObjective('Listen');
    },
  });

  // There used to be an 'Ask it again' target on the set itself. It goes out
  // the moment it stops talking now, so the only window that prompt could ever
  // have appeared in is the second and a half it takes the picture to fade —
  // and a prompt that flickers up on a screen going dark, offering to replay
  // what you were just told, is worse than no prompt at all.

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

    /**
     * The far end of the passage behind the orange door, for whatever gets
     * built on the other side of it. Handed over the same way the hall handed
     * this room its doorway: one opening, one set of numbers.
     */
    get wayOn() {
      return { x: midX, z: wayZ + WAY_ON.depth, width: WAY_ON.width, height: WAY_ON.height };
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
      shutting = false;
      lit = 0;
      surge = 0;
      wayDoor.position.x = midX;
      carryWayDoor();
      life.stop();
      group.visible = false;
      lamp.intensity = 0;
      tubeMat.emissive.set('#000000');
      ringMat.color.set('#8e1a12');
      ringMat.emissive.set('#000000');
      cap.position.z = BUTTON_WALL_Z + BUTTON_OUT;
      // The cable goes dead with it. It reaches into three rooms this one
      // cannot see, and a run winding back with a charge still travelling down
      // it would leave the whole building lit by a button that is out.
      setWireCurrent(false);
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
      // Up when it wakes, and back down when it is done — slower going out than
      // coming in, because a tube takes a moment to let go of the picture and
      // an instant cut would read as the power failing rather than as it
      // choosing to leave.
      if (awake && !shutting) lit += (1 - lit) * (1 - Math.exp(-3.2 * delta));
      if (shutting) lit -= lit * (1 - Math.exp(-1.5 * delta));

      // The orange door drawing back. Slower than the way out of the hall,
      // which is a thing that has just been unlocked in a hurry; this one is
      // being opened for you.
      if (shutting && wayDoor.position.x > midX - WAY_ON.slide + 0.005) {
        wayDoor.position.x += (midX - WAY_ON.slide - wayDoor.position.x) * Math.min(1, delta * 1.5);
        carryWayDoor();
      }
      if (wakeIn > 0) {
        wakeIn -= delta;
        if (wakeIn <= 0) {
          life.speak(CONSOLE_LINES, () => {
            shutting = true;
            // And the way on opens, on the same beat. It is the only thing in
            // the room that outlives the screen: the last thing it says is to
            // go through that door, and the door answers rather than the
            // player having to go and find a switch for it.
            playWardDoor(0.5);
            // And the cable goes quiet with it. The charge running down it is
            // this thing moving about the building; a screen that has gone out
            // with a current still arriving in it has not gone anywhere.
            setWireCurrent(false);
            setObjective('Go through the door');
          });
        }
      }
      /**
       * And the charge goes into him.
       *
       * Every pulse that reaches the end of the cable lands in the set: the
       * face brightens with it and throws more green on the wall behind, and
       * the tube it is drawn on lifts out of black for as long as the head is
       * arriving. One every two thirds of a second, which is the cable's own
       * rhythm rather than a second one invented here — it is the same number
       * running down the wire past your feet, so the two read as cause and
       * effect rather than as two things blinking.
       *
       * It is fed in through `lit`, the same fade the picture comes up on. The
       * face has one brightness and this is it; giving the surge its own would
       * mean two things claiming the same pixels.
       */
      const landed = arrival();
      surge = landed > surge ? landed : surge + (landed - surge) * (1 - Math.exp(-6 * delta));
      life.update(delta, lit * (1 + surge * 0.9));
      television.screen.material.color.copy(screenBase).lerp(SURGE, surge * lit * 0.3);
      // The arms come out of the wall with the picture and go back into it if
      // the room is ever wound down, which is the same movement the ward uses
      // when the thing has said its piece — run backwards to arrive.
      wallArms.update(delta, {
        speaking: life.isSpeaking,
        cross: life.line?.arms === 'crossed',
        retract: !awake || shutting,
      });
    },
  };
}
