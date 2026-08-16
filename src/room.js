import * as THREE from 'three';
import { ROOM, FIXTURE_HEIGHT, MACHINE, DOOR, BACK_DOOR, SIDE_DOOR, BACK_ROOM, LAYER } from './config.js';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeWoodSurface,
  makeRockSurface,
  makeSoftDotTexture,
  makePosterTexture,
  makeInstructionPosterTexture,
  cloneSurface,
  surfaceTextures,
  worldRepeat,
  UNITS_PER_TILE,
  PALETTE,
} from './textures.js';

/** Footprint the machine and its conveyor occupy — kept clear of clutter. */
function insideMachineZone(x, z) {
  const [cx, , cz] = MACHINE.center;
  const reach = MACHINE.conveyorStart + MACHINE.conveyorLength + 2;
  const pad = MACHINE.bodyWidth / 2 + 2;
  const inBody = Math.abs(x - cx) < pad && Math.abs(z - cz) < pad;
  const inBelt =
    x > cx && x < cx + reach && Math.abs(z - cz) < MACHINE.conveyorWidth / 2 + 1.5;
  return inBody || inBelt;
}

// Shared between the housings and the lights so the glow lines up with the mesh.
const FIXTURE_POSITIONS = [
  [-9, -12],
  [9, -12],
  [0, -2],
  [-9, 9],
  [9, 9],
];

/**
 * The way in, in the wall you spawn with your back to.
 *
 * A pair of glass doors, and they do not open — the whole first beat of the
 * game is turning round, seeing daylight you cannot reach, and going to look
 * at the machine instead. There is a shallow dead vestibule behind them so the
 * glass has somewhere to look into rather than showing the wall it is set in.
 */
const ENTRANCE = { width: 2.6, height: 3.2, recess: 1.1 };

/**
 * A double door standing open: two leaves, a rail across each, a kick stripe,
 * and push bars. No frame of its own — it hangs inside the wall's reveals, and
 * a second jamb a couple of centimetres off the first is where z-fighting comes
 * from. Built facing +z and turned into place by the caller.
 *
 * Each leaf hangs off a hinge group at its outer jamb rather than being placed
 * in the middle of the opening, because a door turns about its edge. They fold
 * back nearly flat against the outside face of this wall; the hall through
 * there is what they now stand in, and SIDE_DOOR.swing is picked so their free
 * edges stay inside the wall's own thickness rather than through its far face.
 */
function buildSideDoor() {
  const group = new THREE.Group();
  const { width, height } = SIDE_DOOR;
  const half = width / 2;

  // Authored dark, the same as the ward's green door and for the same reason:
  // this is lit and tone mapped, and ACES lifts hard through the mids, so a red
  // picked at the value you want it to read as comes out closer to pink.
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4a0f0c', roughness: 0.66, metalness: 0.08 });
  const trim = new THREE.MeshStandardMaterial({ color: '#3b4240', roughness: 0.5, metalness: 0.2 });
  const hazard = new THREE.MeshStandardMaterial({ color: '#8d7a2e', roughness: 0.7 });

  for (const side of [-1, 1]) {
    // Hinged at the outer jamb. Turning the group by -side * swing sends both
    // leaves back through the wall: a point at local x = d lands at z = -d*sin,
    // and the two leaves sit at opposite signs of d, so the sign of the angle
    // has to follow the side or one of them swings out into the room instead.
    const hinge = new THREE.Group();
    hinge.position.set(side * half, 0, 0);
    hinge.rotation.y = -side * SIDE_DOOR.swing;
    group.add(hinge);

    // Everything below is positioned relative to the hinge, so the leaf runs
    // from the jamb back toward the middle of the opening.
    const mid = -side * (half / 2);

    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(half - 0.02, height - 0.06, 0.07),
      leafMat
    );
    leaf.position.set(mid, (height - 0.06) / 2, 0.035);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    hinge.add(leaf);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(half - 0.1, 0.1, 0.03), trim);
    rail.position.set(mid, 1.35, 0.078);
    hinge.add(rail);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(half - 0.06, 0.26, 0.012), hazard);
    stripe.position.set(mid, 0.22, 0.078);
    hinge.add(stripe);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, half - 0.24, 10),
      metalMaterial(PALETTE.metal)
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(mid, 1.05, 0.13);
    bar.castShadow = true;
    hinge.add(bar);

    for (const bx of [-1, 1]) {
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), trim);
      mount.position.set(mid + bx * ((half - 0.26) / 2), 1.05, 0.09);
      hinge.add(mount);
    }
  }

  return group;
}

/**
 * Where the paint and the notice about the bucket stand: the right-hand wall,
 * directly across the room from the red door.
 *
 * `z` is taken from the door's own inset so the two stay opposite each other —
 * move the door along its wall and this follows. Shared at module scope because
 * buildWallColliders needs the same spot: the tin is knee height now and gets a
 * collider, and a collider that disagrees with where the thing was drawn is the
 * whole catalogue of bugs this project keeps hitting.
 */
const PAINT = { radius: 0.28, height: 0.42, offWall: 0.46 };

/**
 * An open tin of paint, stood against the wall under the notice about the
 * bucket. Green, the same green as the thing on the television, which is either
 * where the sign-writing came from or a coincidence.
 *
 * Straight-sided rather than tapered, so it is a paint tin and not a second
 * bucket — the joke needs the two to be different objects.
 */
function buildPaintTin() {
  const group = new THREE.Group();
  const { radius: R, height: H } = PAINT;
  const paint = '#4e7d33';

  const tinMat = new THREE.MeshStandardMaterial({ color: '#8d918b', roughness: 0.52, metalness: 0.3 });
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0 });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, H, 20, 1, true),
    new THREE.MeshStandardMaterial({ ...tinMat, side: THREE.DoubleSide })
  );
  body.position.y = H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.03, 20), tinMat);
  base.position.y = 0.015;
  group.add(base);

  // Filled most of the way, so you are looking at a disc of paint rather than
  // down into an empty tin. Everything below is a fraction of R or H rather
  // than a number of its own, so resizing the tin resizes the paint with it.
  const fill = H * 0.8;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(R - 0.014, 20), paintMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = fill;
  group.add(surface);

  // Runs down the outside, and what has already reached the floor.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const run = H * (0.22 + (i % 3) * 0.19);
    const drip = new THREE.Mesh(new THREE.BoxGeometry(R * 0.22, run, 0.016), paintMat);
    drip.position.set(Math.sin(a) * R, fill - run / 2, Math.cos(a) * R);
    drip.rotation.y = a;
    group.add(drip);
  }

  const spill = new THREE.Mesh(new THREE.CircleGeometry(R * 1.85, 18), paintMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(R * 0.8, 0.004, R * 0.62);
  spill.scale.set(1, 1, 0.72);
  group.add(spill);

  // The lid, dropped beside it, paint side up.
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.015, R + 0.015, 0.018, 20), tinMat);
  lid.position.set(-R * 1.9, 0.009, R * 0.86);
  lid.rotation.z = 0.06;
  lid.castShadow = true;
  group.add(lid);

  const lidPaint = new THREE.Mesh(new THREE.CircleGeometry(R - 0.035, 18), paintMat);
  lidPaint.rotation.x = -Math.PI / 2;
  lidPaint.position.set(-R * 1.9, 0.019, R * 0.86);
  group.add(lidPaint);

  // Wire handle, up and over.
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(R - 0.008, 0.009, 6, 18, Math.PI),
    new THREE.MeshStandardMaterial({ color: PALETTE.metalDark, roughness: 0.5, metalness: 0.6 })
  );
  handle.position.y = H - 0.03;
  handle.rotation.y = Math.PI / 2;
  group.add(handle);

  return group;
}

// Fixtures still drawing power. One is left dead so the ceiling doesn't read
// as a fully maintained room.
const LIVE_FIXTURES = [0, 1, 2, 4];

// Axis-aligned boxes the player can't walk through. Collected as props are
// placed so collision stays in sync with what you can actually see.
const colliders = [];

// The shell — both rooms' floors, ceilings, walls and skirting — is rebuilt
// whenever the editor resizes a room, so it is kept apart from everything else
// and torn down as a unit. Props, lights and debris are built once and stay.
let shellGroup = null;
const shellColliders = [];

// Everything the back room is made of, so `lightUp()` can find it again. It is
// replaced wholesale by buildBackRoom, which is what keeps it from holding
// meshes the editor has already disposed.
let backRoom = null;

/** Where the paint tin's interact prompt hangs. Filled in by buildBackRoom. */
const paintAnchor = new THREE.Vector3();

// `top` is the surface the player can land on. Omitting it marks the box as
// unclimbable — it blocks at any height, which is what walls and pillars want.
function addCollider(x, z, sizeX, sizeZ, top) {
  colliders.push({
    minX: x - sizeX / 2,
    maxX: x + sizeX / 2,
    minZ: z - sizeZ / 2,
    maxZ: z + sizeZ / 2,
    top,
  });
}

/** The glass doors, their frame, and the dead space behind them. */
function buildEntrance() {
  const group = new THREE.Group();
  const z = ROOM.depth / 2;
  const half = ENTRANCE.width / 2;

  // The recess: a box of nothing behind the glass, so it reads as somewhere
  // rather than as a hole cut in a wall.
  const dead = new THREE.MeshStandardMaterial({ color: '#0d1013', roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ENTRANCE.width, ENTRANCE.height), dead);
  back.position.set(0, ENTRANCE.height / 2, z + ENTRANCE.recess);
  back.rotation.y = Math.PI;
  group.add(back);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.PlaneGeometry(ENTRANCE.recess, ENTRANCE.height), dead);
    cheek.position.set(side * half, ENTRANCE.height / 2, z + ENTRANCE.recess / 2);
    cheek.rotation.y = side * -Math.PI / 2;
    group.add(cheek);
  }
  const soffit = new THREE.Mesh(new THREE.PlaneGeometry(ENTRANCE.width, ENTRANCE.recess), dead);
  soffit.rotation.x = Math.PI / 2;
  soffit.position.set(0, ENTRANCE.height, z + ENTRANCE.recess / 2);
  group.add(soffit);

  const frameMat = metalMaterial(PALETTE.metalDark);
  // Outer frame, and the mullion the two leaves meet at.
  for (const [w, h, x, y] of [
    [0.12, ENTRANCE.height + 0.12, -half, ENTRANCE.height / 2],
    [0.12, ENTRANCE.height + 0.12, half, ENTRANCE.height / 2],
    [ENTRANCE.width + 0.12, 0.12, 0, ENTRANCE.height],
  ]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), frameMat);
    piece.position.set(x, y, z - 0.08);
    piece.castShadow = true;
    group.add(piece);
  }

  // Two leaves. Glass: dark, barely transparent, and no depth write, or the
  // recess behind it is rejected before it is ever drawn.
  const glass = new THREE.MeshStandardMaterial({
    color: '#8fa9ae',
    roughness: 0.06,
    metalness: 0.2,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(
      new THREE.PlaneGeometry(half - 0.14, ENTRANCE.height - 0.16),
      glass
    );
    leaf.position.set(side * (half / 2), ENTRANCE.height / 2, z - 0.06);
    group.add(leaf);

    // Stile down the meeting edge, rail across the middle, and a push bar.
    const stile = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, ENTRANCE.height - 0.1, 0.12),
      frameMat
    );
    stile.position.set(side * 0.045, ENTRANCE.height / 2, z - 0.06);
    group.add(stile);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(half - 0.1, 0.09, 0.1), frameMat);
    rail.position.set(side * (half / 2), 0.9, z - 0.06);
    group.add(rail);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, half - 0.34, 10),
      metalMaterial(PALETTE.metal)
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(side * (half / 2), 1.05, z - 0.14);
    bar.castShadow = true;
    group.add(bar);
  }

  return group;
}

function woodMaterial(shade = PALETTE.wood) {
  return new THREE.MeshStandardMaterial({ color: shade, roughness: 0.94, metalness: 0.02 });
}

function metalMaterial(shade = PALETTE.metal) {
  return new THREE.MeshStandardMaterial({ color: shade, roughness: 0.55, metalness: 0.7 });
}

function buildShell(scene) {
  // `scene` here is the shell group; see rebuildShell().
  const { width, depth, height } = ROOM;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(width, depth)),
      metalness: 0.02,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(width, depth)),
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  scene.add(ceiling);

  // End and side walls are different widths, so each gets its own repeat to
  // hold the detail scale constant. Cloning shares the canvas image and only
  // varies the repeat, so this costs nothing extra.
  const wallSurface = makeWallSurface(...worldRepeat(width, height));
  const sideSurface = cloneSurface(wallSurface, ...worldRepeat(depth, height));

  const wallMaterial = new THREE.MeshStandardMaterial({ ...wallSurface, metalness: 0 });
  const sideMaterial = new THREE.MeshStandardMaterial({ ...sideSurface, metalness: 0 });

  const walls = [
    { size: [depth, height], pos: [-width / 2, height / 2, 0], rot: Math.PI / 2, mat: sideMaterial },
    { size: [depth, height], pos: [width / 2, height / 2, 0], rot: -Math.PI / 2, mat: sideMaterial },
  ];

  // The wall behind the spawn is built round the entrance instead of as one
  // sheet — there are glass doors in it, and you need to be able to see that
  // they are the way out before you find out they are locked.
  const eHalf = ENTRANCE.width / 2;
  for (const [w, h, px, py] of [
    [width / 2 - eHalf, height, -(width / 2 + eHalf) / 2, height / 2],
    [width / 2 - eHalf, height, (width / 2 + eHalf) / 2, height / 2],
    [ENTRANCE.width, height - ENTRANCE.height, 0, (height + ENTRANCE.height) / 2],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const panelSurface = cloneSurface(wallSurface, ...worldRepeat(w, h));
    panelSurface.map.offset.set((px - w / 2 + width / 2) / UNITS_PER_TILE, (py - h / 2) / UNITS_PER_TILE);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ ...panelSurface, metalness: 0 })
    );
    mesh.position.set(px, py, depth / 2);
    mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  scene.add(buildEntrance());

  for (const wall of walls) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...wall.size), wall.mat);
    mesh.position.set(...wall.pos);
    mesh.rotation.y = wall.rot;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // The far wall is built in three pieces around the doorway. It's also the
  // near wall of the room beyond, so it's double-sided — a plane is invisible
  // from behind, which would leave a hole looking back through it.
  const sideWidth = (width - DOOR.width) / 2;
  const doorPanels = [
    { size: [sideWidth, height], pos: [-(DOOR.width + sideWidth) / 2, height / 2] },
    { size: [sideWidth, height], pos: [(DOOR.width + sideWidth) / 2, height / 2] },
    {
      size: [DOOR.width, height - DOOR.height],
      pos: [0, DOOR.height + (height - DOOR.height) / 2],
    },
  ];

  for (const panel of doorPanels) {
    const [pw, ph] = panel.size;
    const surface = cloneSurface(wallSurface, ...worldRepeat(pw, ph));

    // Offset each piece by where it actually sits in the wall, so the boards
    // and tie holes run straight across the joins. Without this every panel
    // starts the pattern again at its own left edge and the wall reads as
    // separate slabs bolted together.
    const fromLeft = panel.pos[0] - pw / 2 + width / 2;
    const fromFloor = panel.pos[1] - ph / 2;
    for (const map of surfaceTextures(surface)) {
      map.offset.set(fromLeft / UNITS_PER_TILE, fromFloor / UNITS_PER_TILE);
    }

    // Two copies, one per side. A single double-sided mesh belongs to one
    // render pass, and this wall has a lit room on one face and a dark one on
    // the other — each face has to be lit by its own room.
    const geometry = new THREE.PlaneGeometry(pw, ph);

    const front = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ ...surface, metalness: 0, side: THREE.FrontSide })
    );
    front.position.set(panel.pos[0], panel.pos[1], DOOR.z);
    front.receiveShadow = true;
    front.layers.set(LAYER.MAIN);
    scene.add(front);

    const back = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ ...surface, metalness: 0, side: THREE.BackSide })
    );
    back.position.copy(front.position);
    back.receiveShadow = true;
    back.layers.set(LAYER.DARK);
    scene.add(back);
  }

  // Reveals for the doorway, so the wall reads as having thickness.
  const revealMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.85 });
  const jamb = 0.5;
  const reveals = [
    [jamb, DOOR.height, -DOOR.width / 2 - jamb / 2 + 0.01, DOOR.height / 2],
    [jamb, DOOR.height, DOOR.width / 2 + jamb / 2 - 0.01, DOOR.height / 2],
    [DOOR.width + jamb * 2, jamb, 0, DOOR.height + jamb / 2 - 0.01],
  ];
  for (const [rw, rh, rx, ry] of reveals) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 0.75), revealMaterial);
    mesh.position.set(rx, ry, DOOR.z - 0.1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Skirting board around the base of the walls. Four separate boards rather
  // than one room-sized box — a box's bottom face would sit coplanar with the
  // floor plane and z-fight across the whole room.
  const trimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.9 });
  const trimHeight = 0.5;
  const trimDepth = 0.12;

  // The far wall's board is split around the doorway — a continuous one runs
  // straight across the opening and buries the bottom of the door.
  const farBoard = (width - DOOR.width) / 2;
  const boards = [
    {
      size: [farBoard, trimHeight, trimDepth],
      pos: [-(DOOR.width + farBoard) / 2, trimHeight / 2, -depth / 2 + trimDepth / 2],
    },
    {
      size: [farBoard, trimHeight, trimDepth],
      pos: [(DOOR.width + farBoard) / 2, trimHeight / 2, -depth / 2 + trimDepth / 2],
    },
    { size: [width, trimHeight, trimDepth], pos: [0, trimHeight / 2, depth / 2 - trimDepth / 2] },
    { size: [trimDepth, trimHeight, depth], pos: [-width / 2 + trimDepth / 2, trimHeight / 2, 0] },
    { size: [trimDepth, trimHeight, depth], pos: [width / 2 - trimDepth / 2, trimHeight / 2, 0] },
  ];

  for (const board of boards) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...board.size), trimMaterial);
    mesh.position.set(...board.pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/**
 * The room through the door: bare, low-ceilinged, and lit by exactly one
 * spotlight standing just inside the threshold.
 *
 * It has a second doorway now, in the far wall, and the medical block is on
 * the other side of it. So this is both the room you are taken in at the end
 * of the first act and the room you walk back into at the end of the second —
 * and it is the same room, not two that look alike. Everything it is built
 * from goes on `backRoom` so that `lightUp()` can move the lot into the main
 * pass and switch a working ceiling on.
 */
function buildBackRoom(scene) {
  // `scene` here is the shell group; see rebuildShell().
  const { width, depth, height, lightOffset } = BACK_ROOM;
  const centreZ = DOOR.z - depth / 2;

  // Everything in here goes onto the dark layer, which is both what keeps it
  // out of the main pass and how lightUpBackRoom finds it again later.
  const place = (mesh) => {
    mesh.layers.set(LAYER.DARK);
    scene.add(mesh);
    return mesh;
  };

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(width, depth)),
      metalness: 0.02,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = centreZ;
  floor.receiveShadow = true;
  place(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ ...makeCeilingSurface(...worldRepeat(width, depth)) })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, centreZ);
  place(ceiling);

  const surface = makeWallSurface(...worldRepeat(width, height));
  const sides = cloneSurface(surface, ...worldRepeat(depth, height));

  // Right-hand side whole. The other two both have a way out in them, so they
  // are built in pieces: the far wall round the medical corridor, below, and
  // this one round the door the sign sends you to.
  const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(depth, height),
    new THREE.MeshStandardMaterial({ ...sides, metalness: 0 })
  );
  rightWall.position.set(width / 2, height / 2, centreZ);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  place(rightWall);

  // A plane turned a quarter about Y has its width running along -z, so these
  // are laid out in z and the piece positions are z's, not x's.
  const sideNear = DOOR.z - depth + SIDE_DOOR.inset;   // nearest the corridor
  const sideLow = sideNear - SIDE_DOOR.width / 2;
  const sideHigh = sideNear + SIDE_DOOR.width / 2;
  for (const [pw, ph, pz, py] of [
    [sideLow - (DOOR.z - depth), height, ((DOOR.z - depth) + sideLow) / 2, height / 2],
    [DOOR.z - sideHigh, height, (sideHigh + DOOR.z) / 2, height / 2],
    [SIDE_DOOR.width, height - SIDE_DOOR.height, sideNear, (height + SIDE_DOOR.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const panel = cloneSurface(sides, ...worldRepeat(pw, ph));
    for (const map of surfaceTextures(panel)) {
      map.offset.set((pz - pw / 2 - (DOOR.z - depth)) / UNITS_PER_TILE, (py - ph / 2) / UNITS_PER_TILE);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...panel, metalness: 0 })
    );
    mesh.position.set(-width / 2, py, pz);
    mesh.rotation.y = Math.PI / 2;
    mesh.receiveShadow = true;
    place(mesh);
  }

  // Its reveals, and the door hung in them. Same lining as the corridor
  // doorway, turned to this wall.
  const sideReveal = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.85 });
  const sideJamb = 0.4;
  for (const [rw, rh, rz, ry] of [
    [sideJamb, SIDE_DOOR.height, sideLow - sideJamb / 2 + 0.01, SIDE_DOOR.height / 2],
    [sideJamb, SIDE_DOOR.height, sideHigh + sideJamb / 2 - 0.01, SIDE_DOOR.height / 2],
    [SIDE_DOOR.width + sideJamb * 2, sideJamb, sideNear, SIDE_DOOR.height + sideJamb / 2 - 0.01],
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, rh, rw), sideReveal);
    mesh.position.set(-width / 2 - 0.1, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    place(mesh);
  }

  // Set into the lining rather than stuck on the face of the wall: its bars end
  // barely proud of the reveal's inner lip. Standing it further out looks the
  // same and lets you clip a shoulder through it, because the wall collider is
  // at the wall plane and does not know the door is in front of it.
  const sideDoor = buildSideDoor();
  sideDoor.position.set(-width / 2 + 0.12, 0, sideNear);
  sideDoor.rotation.y = Math.PI / 2;
  place(sideDoor);
  sideDoor.traverse((o) => o.layers.set(LAYER.DARK));

  // What used to be here: a 1.25m dead alcove for the leaves to swing into,
  // because there was nothing on the far side of this wall. There is a hall
  // through there now — gauntlet.js owns everything past this plane, including
  // the lining of the opening itself — so the alcove is gone and the doorway
  // goes all the way through.

  // The far wall, round the corridor doorway. Each piece's texture is offset by
  // where it sits in the wall, the same as the hall's door panels, or the
  // boards restart at every join and the wall reads as slabs bolted together.
  const farLeft = BACK_DOOR.x - BACK_DOOR.width / 2;
  const farRight = BACK_DOOR.x + BACK_DOOR.width / 2;
  for (const [pw, ph, px, py] of [
    [farLeft + width / 2, height, (-width / 2 + farLeft) / 2, height / 2],
    [width / 2 - farRight, height, (farRight + width / 2) / 2, height / 2],
    [BACK_DOOR.width, height - BACK_DOOR.height, BACK_DOOR.x, (height + BACK_DOOR.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const panel = cloneSurface(surface, ...worldRepeat(pw, ph));
    for (const map of surfaceTextures(panel)) {
      map.offset.set((px - pw / 2 + width / 2) / UNITS_PER_TILE, (py - ph / 2) / UNITS_PER_TILE);
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...panel, metalness: 0 })
    );
    // Two centimetres proud of the wall plane rather than in it, so the medical
    // surfaces that end on that plane are unambiguously behind this one.
    //
    // It does not get them all. A few dozen pixels of lit corridor still come
    // through along the shared edges, and they survive a bigger standoff and a
    // polygon offset alike — both were tried and both only moved which edge
    // won. That is the signature of edge antialiasing rather than a depth
    // fight: the samples are being blended at the silhouette, where no amount
    // of depth bias reaches. Left as it is at about a hundredth of a percent of
    // the frame; fixing it properly means not building the medical side of
    // these surfaces at all and letting this wall serve both rooms, which is a
    // bigger change than the fault justifies.
    mesh.position.set(px, py, BACK_DOOR.z + 0.02);
    mesh.receiveShadow = true;
    place(mesh);
  }

  // Its reveals. A 0.4 jamb rather than the hall's 0.5 — this doorway is 0.5
  // off the right-hand wall and at 0.5 the lining would run into the corner.
  const backReveal = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.85 });
  const backJamb = 0.4;
  for (const [rw, rh, rx, ry] of [
    [backJamb, BACK_DOOR.height, farLeft - backJamb / 2 + 0.01, BACK_DOOR.height / 2],
    [backJamb, BACK_DOOR.height, farRight + backJamb / 2 - 0.01, BACK_DOOR.height / 2],
    [BACK_DOOR.width + backJamb * 2, backJamb, BACK_DOOR.x, BACK_DOOR.height + backJamb / 2 - 0.01],
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 0.6), backReveal);
    // Mostly on the corridor side, a little proud on this one — the mirror of
    // how the hall's doorway sits, because you arrive through this one.
    mesh.position.set(rx, ry, BACK_DOOR.z - 0.1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    place(mesh);
  }

  // The sign, on the same wall as the corridor door and just along from it, so
  // it is the first thing in this room you are looking at when you come out of
  // the medical block.
  //
  // Which way it points is a fact about the room, not a choice. You read it
  // facing -z, and facing -z your right hand is +x — so the hall doorway at
  // x = 0 is on your left as you stand at a sign hung at x = 4.6, and the arm
  // has to go that way. Getting this backwards would be worse than not having
  // a sign: an arrow you believe is an arrow you follow.
  // The hall doorway is centred in its wall, so it is at x = 0; DOOR carries no
  // x of its own. Drawn pointing toward -x, which is the reader's left, and
  // mirrored only if the door it is sending you to ever moves to the other side
  // of the sign.
  const POSTER = { x: 4.6, width: 1.15, height: 1.44, bottom: 0.95 };
  const HALL_DOORWAY_X = 0;
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(POSTER.width, POSTER.height),
    new THREE.MeshStandardMaterial({
      map: makePosterTexture(HALL_DOORWAY_X > POSTER.x),
      roughness: 0.92,
      metalness: 0,
    })
  );
  poster.position.set(POSTER.x, POSTER.bottom + POSTER.height / 2, BACK_DOOR.z + 0.17);
  poster.receiveShadow = true;
  place(poster);

  // Paper does not hang in mid-air. A sliver of board behind it, a shade darker
  // than the wall, so it reads as stuck up rather than painted on. Its front
  // face has to sit clear of the sheet — the board is 2cm thick, so centring it
  // where the paper is put its face exactly in the paper's plane and the board
  // won, which is a poster that is a blank grey rectangle.
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(POSTER.width + 0.06, POSTER.height + 0.06, 0.02),
    new THREE.MeshStandardMaterial({ color: '#2b2e2b', roughness: 0.95 })
  );
  backing.position.set(POSTER.x, POSTER.bottom + POSTER.height / 2, BACK_DOOR.z + 0.15);
  place(backing);

  // The other notice, on the right-hand wall directly across from the red door,
  // with the paint underneath it. Turned a quarter to face -x into the room:
  // a plane faces +z as built, and left unturned it would be edge-on to
  // everybody and effectively invisible.
  const CARD = { width: 1.05, height: 1.32, bottom: 1.16 };
  const cardX = width / 2;
  const cardZ = DOOR.z - depth + SIDE_DOOR.inset;
  const cardY = CARD.bottom + CARD.height / 2;

  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD.width, CARD.height),
    new THREE.MeshStandardMaterial({
      map: makeInstructionPosterTexture(),
      roughness: 0.92,
      metalness: 0,
    })
  );
  card.position.set(cardX - 0.17, cardY, cardZ);
  card.rotation.y = -Math.PI / 2;
  card.receiveShadow = true;
  place(card);

  const cardBacking = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, CARD.height + 0.06, CARD.width + 0.06),
    new THREE.MeshStandardMaterial({ color: '#2b2e2b', roughness: 0.95 })
  );
  cardBacking.position.set(cardX - 0.15, cardY, cardZ);
  place(cardBacking);

  // And the tin on the floor under it, out from the wall far enough that its
  // own radius clears the skirt of the reveal-free wall face.
  const tin = buildPaintTin();
  tin.position.set(cardX - PAINT.offWall, 0, cardZ + 0.1);
  tin.rotation.y = -0.5;
  place(tin);
  tin.traverse((o) => o.layers.set(LAYER.DARK));
  // Where the interact prompt hangs. Above the rim rather than at the tin's
  // origin, which is on the floor and reads as prompting the ground.
  // Mutated, never replaced. The interaction system holds this vector by
  // reference from the moment the game starts, so handing out a fresh one on an
  // editor rebuild would leave the prompt anchored to where the tin used to be.
  paintAnchor.set(tin.position.x, PAINT.height + 0.25, tin.position.z);

  // What you see instead of the corridor, while the door at the end of it is
  // shut — which is the whole of act one.
  //
  // The corridor is lit, and a lit room on the far side of a 1.2m hole is
  // plainly visible from anywhere in a black one: it read as a pale blue slab
  // hanging in the dark, fifteen metres away, before you had taken a step into
  // the room. The door itself is no help, because it belongs to the medical
  // block and is drawn in the main pass, where the hall's ambient light finds
  // it however little light is actually falling on it.
  //
  // So the opening is blanked from this side. It is not a cheat: the door is
  // shut, and this is the back of it. It goes when the door opens, which is the
  // same moment the room gets its power back.
  // Sized past the opening and stood 0.3 clear of the wall, in front of the
  // door rather than behind it — the door's frame is built on the medical side
  // but hangs 0.16 through the hole, so a panel flush with the wall lost the
  // depth test to it and the door went on showing.
  // Well oversized, and only just clear of the door — 0.18, which puts it in
  // front of the frame's 0.16 of protrusion and no further. Both matter: it
  // stands a little in front of the wall it is patching, so from off to one side
  // you look between the two, and the amount you can see through that gap grows
  // with both the standoff and how far off-axis you are. At 0.3 and a 0.25
  // overlap the sums came out at 0.196 against 0.25 and a hairline of lit
  // corridor showed from the middle of the room. It is a black plane in a black
  // room; there is nothing to pay for making it much bigger than the hole.
  backRoom.doorBlank = new THREE.Mesh(
    new THREE.PlaneGeometry(BACK_DOOR.width + 1.6, BACK_DOOR.height + 1.0),
    new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false })
  );
  backRoom.doorBlank.position.set(BACK_DOOR.x, (BACK_DOOR.height + 1.0) / 2, BACK_DOOR.z + 0.18);
  place(backRoom.doorBlank);

  // The one light. Hung just inside the hall door, aimed straight down, so it
  // puts a hard pool on the floor and leaves the rest of the room to the dark.
  const lightZ = DOOR.z - lightOffset;

  const spot = new THREE.SpotLight(0xfff4e2, 300, 18, Math.PI / 7, 0.35, 1.6);
  spot.position.set(0, height - 0.35, lightZ);
  spot.target.position.set(0, 0, lightZ);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 14;
  spot.shadow.normalBias = 0.05;
  // The one light on the dark layer, so the second pass has nothing else.
  spot.layers.set(LAYER.DARK);
  scene.add(spot);
  scene.add(spot.target);
  backRoom.spot = spot;

  // The fitting it hangs from.
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.4, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: PALETTE.metalDark,
      roughness: 0.5,
      metalness: 0.6,
      side: THREE.DoubleSide,
    })
  );
  shade.position.set(0, height - 0.3, lightZ);
  place(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff4e2 })
  );
  bulb.position.set(0, height - 0.46, lightZ);
  place(bulb);

  const flex = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.3),
    new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.8 })
  );
  flex.position.set(0, height - 0.15, lightZ);
  place(flex);

  // The ceiling this room has always had and has never had power to. Six
  // fittings in two rows, hung on chains — at eight metres, flush to the
  // ceiling nothing would reach the floor. Built dead: the tubes are grey and
  // the lamps are at zero until lightUp() puts the power back on.
  for (const lx of [-4.5, 4.5]) {
    for (const lz of [centreZ - 6, centreZ, centreZ + 6]) {
      const drop = height - 4.2;
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, drop, 6),
        metalMaterial(PALETTE.trim)
      );
      chain.position.set(lx, height - drop / 2, lz);
      place(chain);

      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.16, 0.55),
        metalMaterial(PALETTE.metalDark)
      );
      housing.position.set(lx, 4.2, lz);
      housing.castShadow = true;
      place(housing);

      // Black, not dark grey. A lit tube has to be a basic material — it is
      // the light source, so it cannot depend on being lit — and a basic
      // material ignores lighting in both directions: at 0x33383a these hung in
      // the pitch-black room as six pale bars, the brightest thing in it and
      // visible from the doorway before you had taken a step. Unlit means
      // unlit, and lightUpBackRoom is what gives them a colour.
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.05, 0.32),
        new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })
      );
      tube.position.set(lx, 4.11, lz);
      place(tube);

      const light = new THREE.PointLight(0xdfe9e2, 0, 20, 1.25);
      light.position.set(lx, 4.0, lz);
      light.layers.set(LAYER.DARK);
      scene.add(light);
      backRoom.fittings.push({ light, tube });
    }
  }
}

/**
 * Fog on or off for everything in the back room.
 *
 * Fog is not lighting. It mixes a surface toward the fog colour by distance
 * alone, so it lands on geometry that has no light on it whatever — which in a
 * room lit by one spotlight means every wall in it comes up a faint blue-grey
 * and the room reads as dim rather than as dark. Fifteen metres of 0x0d1219 is
 * only about three percent, and three percent of anything against true black is
 * a wall you can see the panel joins on.
 *
 * So the dark room opts out of the hall's fog until it has lights of its own,
 * at which point there is something for fog to sit in front of and it goes back
 * on. Found by layer rather than kept in a list, the same as everything else
 * about this room, because two builders contribute to it.
 */
function setDarkRoomFog(scene, on) {
  const darkOnly = 1 << LAYER.DARK;
  scene.traverse((object) => {
    if (!object.isMesh || object.layers.mask !== darkOnly) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      // The blanking panel is never fogged; it is meant to be a hole.
      if (!material || material === backRoom?.doorBlank?.material) continue;
      material.fog = on;
      material.needsUpdate = true;
    }
  });
}

/**
 * Puts the power back on in the back room, for good.
 *
 * Two things at once, and they have to happen together. The ceiling comes on,
 * and the whole room moves out of the dark pass and into the main one — which
 * is the part that matters, because the passes are split by *camera* layer, so
 * a room on LAYER.DARK is lit by the dark pass's lights and nothing else however
 * many lamps you hang in it. Left on DARK it would keep the hall's ambient out
 * and stay a black box with six bright tubes floating in it.
 *
 * What moves is everything wearing that layer, found by walking the scene,
 * rather than a list kept as the room was built. The layer *means* "in the back
 * room" — that is the entire reason it exists — so a list would only ever be a
 * second, worse answer to a question the layer already answers, and it would
 * miss the pieces other files put in there. Two of them, both found by lighting
 * the room and seeing a black hole: the far wall's inward face, which room.js
 * builds with the hall, and the housing the hall's door retracts into, which
 * door.js builds and which was black on purpose because nothing could see it.
 *
 * Anything transient on the dark layer — the friend, the cutscene's hand — is
 * put back where it belongs on the next frame by the code that owns it.
 *
 * One way only. This is the second act starting, not a light switch.
 */
function lightUpBackRoom(scene) {
  if (!backRoom || backRoom.lit) return;
  backRoom.lit = true;

  // Fog back on before the layers move, while they can still be found by it,
  // and the blank out of the doorway — the door on the other side is opening.
  setDarkRoomFog(scene, true);
  backRoom.doorBlank.visible = false;

  // Remembered on the way out, not on the way in: still found by layer, which
  // is the point, but written down so darkenBackRoom can put back exactly what
  // was moved. Once these are on MAIN there is nothing to tell them apart from
  // the hall's own meshes, so the layer cannot answer the question twice.
  const darkOnly = 1 << LAYER.DARK;
  backRoom.moved = [];
  scene.traverse((object) => {
    if (object.layers.mask !== darkOnly) return;
    object.layers.set(LAYER.MAIN);
    backRoom.moved.push(object);
  });

  for (const fitting of backRoom.fittings) {
    fitting.light.layers.set(LAYER.MAIN);
    fitting.light.intensity = 48;
    fitting.tube.material.color.set(0xe8f2ea);
  }

  // The lamp stays, and stays on — it is the thing you saw last before the
  // lights went out, and leaving it lit is what says this is that room. Well
  // down from 300 though: that was it against a black room, and at full
  // strength against a lit one it blows the floor under it out to white.
  backRoom.spot.layers.set(LAYER.MAIN);
  backRoom.spot.target.layers.set(LAYER.MAIN);
  backRoom.spot.intensity = 130;
}

/**
 * The power off again, for the debug menu only.
 *
 * lightUpBackRoom is deliberately one way — in the game the second act does not
 * un-happen. But the debug menu's whole job is to arrive at a scene *and leave
 * it*, and without this, jumping to the corridor once relit the room for the
 * rest of the session: every earlier scene then played out in a back room with
 * the lights on, including the one whose entire point is that it is dark.
 *
 * Walks the list lightUpBackRoom wrote rather than the scene, because by now
 * these are on MAIN and indistinguishable from the hall's own meshes.
 */
function darkenBackRoom(scene) {
  if (!backRoom?.lit) return;
  backRoom.lit = false;

  for (const object of backRoom.moved ?? []) object.layers.set(LAYER.DARK);
  backRoom.moved = null;

  for (const fitting of backRoom.fittings) {
    fitting.light.layers.set(LAYER.DARK);
    fitting.light.intensity = 0;
    fitting.tube.material.color.set(0x000000);
  }

  backRoom.spot.layers.set(LAYER.DARK);
  backRoom.spot.target.layers.set(LAYER.DARK);
  backRoom.spot.intensity = 300;

  backRoom.doorBlank.visible = true;
  setDarkRoomFog(scene, false);
}

/**
 * Solid boxes standing in for the shell. The player used to be clamped to the
 * room's rectangle, which cannot express a doorway — with two rooms joined by
 * a gap, the walls have to be real colliders.
 */
function buildWallColliders() {
  const { width, depth } = ROOM;
  const t = 1; // thickness; comfortably more than a frame's travel, so no tunnelling
  const halfDoor = DOOR.width / 2;

  const add = (minX, maxX, minZ, maxZ) => {
    const box = { minX, maxX, minZ, maxZ };
    colliders.push(box);
    shellColliders.push(box);
  };

  // A wall with a room on both sides gets its thickness straddling the wall
  // plane, not stacked on one side of it. The full `t` is fine for an outside
  // wall, where the far side is nowhere; put it on a shared wall and the room
  // that does not own it is stopped a metre and a half short of a wall it can
  // see. That went unnoticed for as long as the far side of this one was a dark
  // room nobody could see across.
  const share = 0.3;

  // Main room.
  add(-width / 2 - t, -width / 2, -depth / 2 - t, depth / 2 + t);
  add(width / 2, width / 2 + t, -depth / 2 - t, depth / 2 + t);
  add(-width / 2 - t, width / 2 + t, depth / 2, depth / 2 + t);
  // Far wall, split around the doorway. Shared with the back room.
  add(-width / 2 - t, -halfDoor, DOOR.z - share, DOOR.z + share);
  add(halfDoor, width / 2 + t, DOOR.z - share, DOOR.z + share);

  // Back room. Its right-hand wall is thin and its overhangs are trimmed to it,
  // because the medical block's store room is now hard against that side and a
  // metre of thickness pushed a slab of invisible wall two and a half metres
  // into it. The left wall keeps the full thickness — there is nothing over
  // there to intrude on.
  const bw = BACK_ROOM.width / 2;
  const far = DOOR.z - BACK_ROOM.depth;
  const thin = 0.3;
  const halfBack = BACK_DOOR.width / 2;

  // Left wall, in two runs with the side doorway open between them. That door
  // stands open and now has a hall behind it, so the collision stands open with
  // it — a hole you can see through and not walk into is the one thing worse
  // than the door having stayed shut.
  //
  // The full `t` is right here even though there is a room on the far side now,
  // because gauntlet.js does not build its own near wall: it puts the visible
  // face on this box's outer plane, at -bw - t, and lines the metre between the
  // two faces as the threshold. One wall, one thickness, agreed on by both.
  const sideAt = SIDE_DOOR.z;
  const sideA = sideAt - SIDE_DOOR.width / 2;
  const sideB = sideAt + SIDE_DOOR.width / 2;
  add(-bw - t, -bw, far - t, sideA);
  add(-bw - t, -bw, sideB, DOOR.z);

  // The paint tin, across the room from that door. It was 24cm and had no
  // collider on the reasoning that a box you cannot see the edges of is worse
  // than walking through it; at 42cm that stops being true — it is knee height
  // and walking through it reads as a bug rather than as a small object.
  //
  // Registered here rather than beside the mesh because this is the function
  // whose boxes get torn down and rebuilt with the shell. Added in
  // buildBackRoom it would go on the permanent list and the editor would leave
  // a fresh copy behind every time the room was resized.
  const tinX = bw - PAINT.offWall;
  const tinZ = sideAt + 0.1;
  const tinBox = { minX: tinX - PAINT.radius, maxX: tinX + PAINT.radius,
                   minZ: tinZ - PAINT.radius, maxZ: tinZ + PAINT.radius, top: PAINT.height };
  colliders.push(tinBox);
  shellColliders.push(tinBox);
  add(bw, bw + thin, far, DOOR.z);
  // Far wall, split around the corridor doorway the way the hall's is split
  // around its own, and straddling the plane for the same reason — the medical
  // corridor is on the other side of it. Cutting the hole in the mesh and not
  // in the collider is a mistake this project has now made twice.
  add(-bw - t, BACK_DOOR.x - halfBack, far - share, far + share);
  add(BACK_DOOR.x + halfBack, bw + thin, far - share, far + share);
}

/**
 * Displaces each unique corner of a polyhedron in and out along its own
 * direction, plus a little lateral wobble, to break up the regular silhouette.
 *
 * Polyhedron geometries are non-indexed — every face carries its own copy of
 * each corner — so the offset has to be looked up by position and reused, or
 * the faces tear apart from each other and the solid comes open.
 */
function jitterRock(geometry, random, amount) {
  const position = geometry.attributes.position;
  const offsets = new Map();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

    let offset = offsets.get(key);
    if (!offset) {
      const push = 1 + (random() - 0.5) * amount * 2;
      const wobble = amount * 0.12;
      offset = [
        x * push - x + (random() - 0.5) * wobble,
        y * push - y + (random() - 0.5) * wobble,
        z * push - z + (random() - 0.5) * wobble,
      ];
      offsets.set(key, offset);
    }

    position.setXYZ(i, x + offset[0], y + offset[1], z + offset[2]);
  }

  position.needsUpdate = true;
  // Recomputing on non-indexed geometry gives per-face normals, which keeps
  // the chunks reading as sharp-edged breaks rather than smooth blobs.
  geometry.computeVertexNormals();
  return geometry;
}

function buildDebris(scene) {
  const random = mulberry32(20250728);

  // Rubble: low scattered chunks, no collision, just texture underfoot.
  //
  // A pool of distinct shapes rather than one geometry per chunk — 130 unique
  // buffers would be wasteful, and with random rotation and non-uniform scale
  // on top, a dozen silhouettes is already past the point you'd notice.
  const rockShapes = [];
  for (let i = 0; i < 14; i++) {
    // All fairly many-faced on purpose. A low-vertex solid like an octahedron
    // jitters into a sharp crystal, which reads as a gemstone, not as rubble.
    const pick = Math.floor(random() * 3);
    const base =
      pick === 0
        ? new THREE.DodecahedronGeometry(0.28, 0)
        : pick === 1
          ? new THREE.IcosahedronGeometry(0.28, 0)
          : new THREE.IcosahedronGeometry(0.29, 1);
    rockShapes.push(jitterRock(base, random, pick === 2 ? 0.3 : 0.42));
  }
  // Rubble is small and viewed close, so it gets a tighter repeat than the
  // room shell — stone detail is naturally finer than a poured wall's.
  const rubbleMaterial = new THREE.MeshStandardMaterial({
    ...makeRockSurface(2, 2),
    metalness: 0.02,
  });
  for (let i = 0; i < 130; i++) {
    const scale = 0.2 + random() * 0.9;
    const x = (random() - 0.5) * (ROOM.width - 2);
    const z = (random() - 0.5) * (ROOM.depth - 2);
    if (insideMachineZone(x, z)) continue;

    const chunk = new THREE.Mesh(
      rockShapes[Math.floor(random() * rockShapes.length)],
      rubbleMaterial
    );
    chunk.position.set(x, 0.05 + scale * 0.1, z);
    chunk.rotation.set(random() * 3, random() * 3, random() * 3);
    // Squashed unevenly, so even a repeated shape reads differently.
    chunk.scale.set(
      scale * (0.78 + random() * 0.44),
      scale * (0.62 + random() * 0.5),
      scale * (0.78 + random() * 0.44)
    );
    chunk.castShadow = true;
    scene.add(chunk);
  }

  // A long workbench pushed against the left wall.
  const bench = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.16, 1.4),
    new THREE.MeshStandardMaterial({
      ...makeWoodSurface(3, 1, PALETTE.woodLight),
      metalness: 0.02,
    })
  );
  top.position.y = 0.95;
  top.castShadow = true;
  bench.add(top);
  for (const [lx, lz] of [[-2.8, -0.6], [-2.8, 0.6], [2.8, -0.6], [2.8, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), metalMaterial(PALETTE.metalDark));
    leg.position.set(lx, 0.475, lz);
    bench.add(leg);
  }
  bench.position.set(-ROOM.width / 2 + 1.6, 0, -6);
  bench.rotation.y = Math.PI / 2;
  scene.add(bench);
  // Sized to the bench top, which is 6 by 1.4 and turned a quarter — it used
  // to be 2.2 by 6.4, which stopped you 40cm short of it in open floor.
  addCollider(bench.position.x, bench.position.z, 1.5, 6.1, 1.03);

  // Fluorescent housings slung from the ceiling on long chains.
  for (const [lx, lz] of FIXTURE_POSITIONS) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.6), metalMaterial(PALETTE.metalDark));
    housing.position.set(lx, FIXTURE_HEIGHT, lz);
    housing.rotation.z = (Math.random() - 0.5) * 0.25;
    housing.castShadow = true;
    scene.add(housing);

    const drop = ROOM.height - FIXTURE_HEIGHT;
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, drop),
      metalMaterial(PALETTE.trim)
    );
    chain.position.set(lx, FIXTURE_HEIGHT + drop / 2, lz);
    scene.add(chain);
  }
}

function buildDust(scene) {
  const count = 900;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * ROOM.width;
    positions[i * 3 + 1] = Math.random() * ROOM.height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * ROOM.depth;
    speeds[i] = 0.04 + Math.random() * 0.12;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.045,
      map: makeSoftDotTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      color: 0xb9c2bb,
    })
  );
  scene.add(points);

  let time = 0;
  return (delta) => {
    time += delta;
    const array = geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      array[i * 3 + 1] -= speeds[i] * delta;
      array[i * 3] += Math.sin(time * 0.4 + i) * 0.0015;
      if (array[i * 3 + 1] < 0) array[i * 3 + 1] = ROOM.height;
    }
    geometry.attributes.position.needsUpdate = true;
  };
}

function buildLights(scene) {
  // With no flashlight, the room's own fixtures are the only thing keeping it
  // navigable, so the ambient floor is higher than a pitch-dark horror room.
  scene.add(new THREE.AmbientLight(0x4e5d75, 2.5));
  scene.add(new THREE.HemisphereLight(0x64758d, 0x232119, 1.5));

  const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0xd8e2ff });
  const tubeGeometry = new THREE.BoxGeometry(2.1, 0.06, 0.34);

  const fixtures = LIVE_FIXTURES.map((index, order) => {
    const [x, z] = FIXTURE_POSITIONS[index];

    const light = new THREE.PointLight(0xd8e2ff, 88, 40, 1.45);
    light.position.set(x, FIXTURE_HEIGHT - 0.12, z);

    // None of these cast any more.
    //
    // All four used to, on the reasoning that with only one the other three
    // fill its shadows back in and nothing appears to have a shadow at all.
    // That reasoning is sound and the price was not: a point light's shadow is
    // a cube map, so it is *six* renders of the whole scene per light per
    // frame, and four of them came to twenty-four. Measured, switching all four
    // off took 121ms off a 504ms frame — a quarter of it, for four lights out
    // of thirty-four.
    //
    // Nothing is lost by it, because these were never the lights doing the
    // work. They are eight metres up, and the machine's own glow already says
    // why that matters: from up here a figure casts barely a foot of shadow,
    // and from the tank at chest height the same figure stretches right across
    // the floor. That one still casts. These are fill, and now they only fill.
    light.castShadow = false;
    scene.add(light);

    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial.clone());
    tube.position.set(x, FIXTURE_HEIGHT - 0.13, z);
    scene.add(tube);

    return { light, tube, phase: order * 2.7, nextGlitch: 1.5 + order, glitchUntil: 0 };
  });

  let time = 0;

  return (delta) => {
    time += delta;
    for (const fixture of fixtures) {
      if (time > fixture.nextGlitch) {
        fixture.glitchUntil = time + 0.05 + Math.random() * 0.22;
        fixture.nextGlitch = time + 1.2 + Math.random() * 5;
      }
      const dying = time < fixture.glitchUntil;
      fixture.light.intensity = dying
        ? Math.random() * 30
        : 84 + Math.sin(time * 11 + fixture.phase) * 9;
      fixture.tube.material.color.setScalar(dying ? 0.25 : 1);
    }
  };
}

/** Small deterministic PRNG so the room's clutter is identical every run. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tears down the shell and rebuilds it from the current ROOM / BACK_ROOM / DOOR
 * values. The doorway sits in the main hall's far wall, so its z is re-derived
 * here — the two cannot drift apart.
 */
function rebuildShell(scene) {
  if (shellGroup) {
    scene.remove(shellGroup);
    shellGroup.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
      else object.material?.dispose?.();
    });
  }
  for (const box of shellColliders) {
    const index = colliders.indexOf(box);
    if (index !== -1) colliders.splice(index, 1);
  }
  shellColliders.length = 0;

  DOOR.z = -ROOM.depth / 2;

  backRoom = { spot: null, fittings: [], lit: false };

  shellGroup = new THREE.Group();
  scene.add(shellGroup);
  buildShell(shellGroup);
  buildBackRoom(shellGroup);
  // After both, because both put meshes in that room — the far wall's inward
  // face comes from buildShell and everything else from buildBackRoom.
  setDarkRoomFog(shellGroup, false);
  buildWallColliders();
}

export function createRoom(scene) {
  colliders.length = 0;

  rebuildShell(scene);
  buildDebris(scene);
  const updateDust = buildDust(scene);
  const updateLights = buildLights(scene);

  return {
    colliders,
    /** Rebuild both rooms after the editor changes their dimensions. */
    rebuildShell: () => rebuildShell(scene),
    /**
     * Power to the back room. Called when the console in the store room opens
     * the doors — by then you are on your way back to it.
     *
     * Not preserved across an editor rebuild, which throws the room away and
     * builds a dark one. That only affects the editor, and re-running it there
     * is a keypress.
     */
    lightUpBackRoom: () => lightUpBackRoom(scene),
    /** Debug menu only — see darkenBackRoom. The game never calls this. */
    darkenBackRoom: () => darkenBackRoom(scene),
    get backRoomIsLit() {
      return backRoom?.lit === true;
    },
    /** Where to hang the paint tin's interact prompt. Moves with the tin. */
    paintAnchor,
    update(delta) {
      updateDust(delta);
      updateLights(delta);
    },
  };
}
