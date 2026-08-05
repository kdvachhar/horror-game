import * as THREE from 'three';
import { MACHINE } from './config.js';
import {
  makeHazardSurface,
  makeBeltSurface,
  makeMetalPanelSurface,
  makeRadialFalloffTexture,
  cloneSurface,
  surfaceTextures,
  metalRepeat,
  PALETTE,
} from './textures.js';

// The centrepiece: a tank of purple goo feeding a hooded conveyor that runs out
// to one side. Everything here is procedural geometry so it stays consistent
// with the rest of the room.

const GOO = new THREE.Color(MACHINE.gooColor);
const BODY_TOP = MACHINE.plinthHeight + MACHINE.bodyHeight;

// The loading hatch. Shared by the housing (which leaves a hole this size in
// its front wall) and by the hatch itself, so the two always line up.
const HATCH = {
  width: 1.7,
  height: 1.15,
  centerY: 1.35,
  depth: 0.85,
};

const steel = (shade = PALETTE.metal, roughness = 0.62) =>
  new THREE.MeshStandardMaterial({ color: shade, roughness, metalness: 0.72 });

// Riveted plate for the machine's large flat surfaces. Generated once and
// cloned per surface so each gets its own repeat without redrawing the canvas.
// Small parts (rails, legs, pipes) stay flat-coloured — panel seams at that
// scale just read as noise.
let plateSource = null;
function plate(width, height) {
  if (!plateSource) plateSource = makeMetalPanelSurface(1, 1);
  return cloneSurface(plateSource, ...metalRepeat(width, height));
}

const platedSteel = (width, height) =>
  new THREE.MeshStandardMaterial({
    ...plate(width, height),
    metalness: 0.72,
  });

function buildHousing(group) {
  const w = MACHINE.bodyWidth;

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.2, MACHINE.plinthHeight, w + 1.2),
    new THREE.MeshStandardMaterial({
      // Stripes at a fixed pitch in world units, matched to the room's scale.
      ...makeHazardSurface((w + 1.2) / 1.6, 1),
      metalness: 0.25,
    })
  );
  plinth.position.y = MACHINE.plinthHeight / 2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // The housing can't be one solid box: the hatch needs a genuine hole for the
  // recess to sit in, otherwise the front face hides the chamber and anything
  // loaded into it. So it's a core, set back from the front, plus a front wall
  // built from four panels around the opening.
  const bodyMidY = MACHINE.plinthHeight + MACHINE.bodyHeight / 2;
  const coreDepth = w - HATCH.depth - 0.02;

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(w, MACHINE.bodyHeight, coreDepth),
    platedSteel(w, MACHINE.bodyHeight)
  );
  core.position.set(0, bodyMidY, -w / 2 + coreDepth / 2);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  const wallDepth = w - coreDepth;
  const wallZ = w / 2 - wallDepth / 2;
  const halfOpen = HATCH.width / 2;
  const sideWidth = w / 2 - halfOpen;
  const openBottom = HATCH.centerY - HATCH.height / 2;
  const openTop = HATCH.centerY + HATCH.height / 2;

  const panels = [
    [sideWidth, MACHINE.bodyHeight, -(halfOpen + sideWidth / 2), bodyMidY],
    [sideWidth, MACHINE.bodyHeight, halfOpen + sideWidth / 2, bodyMidY],
    [HATCH.width, BODY_TOP - openTop, 0, (openTop + BODY_TOP) / 2],
    [HATCH.width, openBottom - MACHINE.plinthHeight, 0, (MACHINE.plinthHeight + openBottom) / 2],
  ];

  for (const [pw, ph, px, py] of panels) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, wallDepth), platedSteel(pw, ph));
    panel.position.set(px, py, wallZ);
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
  }

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.1, 0.34, w + 0.1),
    steel(PALETTE.metalDark, 0.5)
  );
  band.position.y = BODY_TOP - 0.35;
  group.add(band);

  // Gauges on the face pointing back toward the spawn.
  for (const x of [-1.4, 1.4]) {
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16),
      steel(PALETTE.trim, 0.4)
    );
    housing.rotation.x = Math.PI / 2;
    housing.position.set(x, 1.9, w / 2 + 0.06);
    group.add(housing);

    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.21, 16),
      new THREE.MeshBasicMaterial({ color: 0x7de08a })
    );
    dial.position.set(x, 1.9, w / 2 + 0.13);
    group.add(dial);
  }

  // Kept short so it doesn't cut a bar across the wall text from the spawn.
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 3, 12), steel(PALETTE.metalDark));
  stack.position.set(w / 2 - 0.7, BODY_TOP + 1.5, -w / 2 + 0.7);
  stack.castShadow = true;
  group.add(stack);
}

/**
 * The loading hatch on the face you approach from: a recessed chamber behind a
 * roller shutter. The shutter retracts by scaling toward its top edge, which
 * avoids sliding a door into geometry it would clip through.
 */
function buildHatch(group) {
  const faceZ = MACHINE.bodyWidth / 2;
  const { width, height, centerY, depth } = HATCH;

  // Chamber filling the hole in the front wall. BackSide so its front face is
  // culled and we look straight through into the interior.
  const chamber = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: PALETTE.void,
      roughness: 0.85,
      metalness: 0.35,
      side: THREE.BackSide,
    })
  );
  chamber.position.set(0, centerY, faceZ - depth / 2);
  chamber.receiveShadow = true;
  group.add(chamber);

  // Residue glow from whatever the machine has been fed before.
  const glow = new THREE.PointLight(GOO, 0, 5, 1.8);
  glow.position.set(0, centerY, faceZ - depth * 0.55);
  group.add(glow);

  // Frame around the opening — four bars, so the middle stays open.
  const frameMaterial = steel(PALETTE.metalDark, 0.5);
  const bar = 0.16;
  const bars = [
    [width + bar * 2, bar, 0, centerY + height / 2 + bar / 2],
    [width + bar * 2, bar, 0, centerY - height / 2 - bar / 2],
    [bar, height, -width / 2 - bar / 2, centerY],
    [bar, height, width / 2 + bar / 2, centerY],
  ];
  for (const [bw, bh, bx, by] of bars) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.14), frameMaterial);
    mesh.position.set(bx, by, faceZ + 0.05);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Shutter, hung from the top edge so scaling Y rolls it up out of the way.
  const shutter = new THREE.Group();
  shutter.position.set(0, centerY + height / 2, faceZ + 0.06);
  group.add(shutter);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.09),
    platedSteel(width, height)
  );
  door.position.y = -height / 2;
  door.castShadow = true;
  shutter.add(door);

  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.13, 0.13),
    steel(PALETTE.trim, 0.45)
  );
  lip.position.y = -height + 0.05;
  shutter.add(lip);

  return {
    shutter,
    glow,
    // Where the interaction prompt anchors, and where the player stands.
    anchor: new THREE.Vector3(0, centerY, faceZ + 0.3),
    // Floor of the chamber, where a loaded item comes to rest.
    slot: new THREE.Vector3(0, centerY - height / 2 + 0.02, faceZ - depth / 2),
  };
}

function buildTank(group) {
  const bottom = BODY_TOP;
  const { tankRadius: radius, tankHeight: height } = MACHINE;

  // Glass shell. Kept as a cheap transparent standard material rather than
  // real transmission — refraction isn't worth the frame cost here.
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 32, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xbcd2e4,
      transparent: true,
      opacity: 0.13,
      roughness: 0.06,
      metalness: 0,
      side: THREE.DoubleSide,
      // Without this the glass writes depth and the goo behind it is rejected,
      // leaving the tank looking empty and black.
      depthWrite: false,
    })
  );
  glass.position.y = bottom + height / 2;
  group.add(glass);

  for (const y of [bottom, bottom + height]) {
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.14, radius + 0.14, 0.26, 32),
      steel(PALETTE.metalDark, 0.5)
    );
    collar.position.y = y;
    collar.castShadow = true;
    group.add(collar);
  }

  // The goo. Basic material rather than standard — it should read as its own
  // light source, not as a surface waiting to be lit.
  const fill = height * 0.74;
  const gooMaterial = new THREE.MeshBasicMaterial({
    color: GOO,
    transparent: true,
    opacity: 0.88,
  });

  const goo = new THREE.Mesh(
    new THREE.CylinderGeometry(radius - 0.07, radius - 0.07, fill, 32),
    gooMaterial
  );
  goo.position.y = bottom + fill / 2 + 0.1;
  group.add(goo);

  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(radius - 0.08, 32),
    new THREE.MeshBasicMaterial({ color: 0xd8b4fe, transparent: true, opacity: 0.85 })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = goo.position.y + fill / 2 + 0.01;
  group.add(surface);

  const bubbleGeometry = new THREE.SphereGeometry(0.08, 8, 8);
  const bubbles = [];
  for (let i = 0; i < 16; i++) {
    const bubble = new THREE.Mesh(
      bubbleGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xefd9ff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      })
    );
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (radius - 0.4);
    bubble.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    bubble.scale.setScalar(0.5 + Math.random());
    bubble.userData = { speed: 0.3 + Math.random() * 0.6, offset: Math.random() };
    group.add(bubble);
    bubbles.push(bubble);
  }

  const glow = new THREE.PointLight(GOO, 55, 24, 1.6);
  glow.position.y = bottom + fill / 2;
  // The only light in the hall low enough to throw a long shadow. Every ceiling
  // fixture is 8m up, so anything standing under one casts barely a foot of
  // shadow; from here, at chest height, a figure a few metres away stretches
  // right across the floor.
  glow.castShadow = true;
  glow.shadow.mapSize.set(1024, 1024);
  glow.shadow.camera.near = 0.4;
  glow.shadow.camera.far = 26;
  glow.shadow.normalBias = 0.05;
  group.add(glow);

  return { bubbles, surface, glow, gooMaterial, tankBottom: bottom, fill };
}

function buildConveyor(parent) {
  const { conveyorStart, conveyorLength, conveyorWidth, beltHeight } = MACHINE;

  // Built running along -Z, then rotated so it heads out along +X. Working in
  // a local axis keeps the geometry maths readable.
  const group = new THREE.Group();
  const midZ = -conveyorLength / 2;

  const beltSurface = makeBeltSurface(1, conveyorLength / 1.6);
  // Every map has to scroll together or the cleats' relief detaches from the
  // colour underneath it.
  const beltTextures = surfaceTextures(beltSurface);
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(conveyorWidth - 0.5, 0.12, conveyorLength),
    new THREE.MeshStandardMaterial({ ...beltSurface, metalness: 0.1 })
  );
  belt.position.set(0, beltHeight, midZ);
  belt.receiveShadow = true;
  group.add(belt);

  for (const x of [-conveyorWidth / 2, conveyorWidth / 2]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.38, conveyorLength),
      steel(PALETTE.metal, 0.55)
    );
    rail.position.set(x, beltHeight, midZ);
    rail.castShadow = true;
    group.add(rail);
  }

  const legCount = Math.max(2, Math.floor(conveyorLength / 3));
  for (let i = 0; i <= legCount; i++) {
    const z = -0.5 - (i / legCount) * (conveyorLength - 1);
    for (const x of [-conveyorWidth / 2 + 0.12, conveyorWidth / 2 - 0.12]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, beltHeight - 0.2, 8),
        steel(PALETTE.metalDark)
      );
      leg.position.set(x, (beltHeight - 0.2) / 2, z);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // The cover: a half-tube hood over the belt, open underneath. Rotating the
  // geometry rather than the mesh keeps the orientation unambiguous — lay the
  // cylinder along Z first, then roll its solid half to face up.
  const hoodRadius = conveyorWidth / 2 + 0.18;
  const hoodGeometry = new THREE.CylinderGeometry(
    hoodRadius,
    hoodRadius,
    conveyorLength,
    20,
    1,
    true,
    0,
    Math.PI
  );
  hoodGeometry.rotateX(Math.PI / 2);
  hoodGeometry.rotateZ(Math.PI / 2);

  // The cylinder's UVs run around the half-circumference and along its length,
  // so the plate scale is derived from those two arc/axis measurements.
  const hoodMaterial = platedSteel(Math.PI * hoodRadius, conveyorLength);
  hoodMaterial.metalness = 0.65;
  hoodMaterial.side = THREE.DoubleSide;

  const hood = new THREE.Mesh(hoodGeometry, hoodMaterial);
  hood.position.set(0, beltHeight + 0.16, midZ);
  hood.castShadow = true;
  hood.receiveShadow = true;
  group.add(hood);

  const ribCount = Math.max(2, Math.floor(conveyorLength / 2.2));
  for (let i = 0; i <= ribCount; i++) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(hoodRadius + 0.05, 0.07, 6, 16, Math.PI),
      steel(PALETTE.metalDark, 0.6)
    );
    rib.position.set(0, beltHeight + 0.16, -(i / ribCount) * conveyorLength);
    group.add(rib);
  }

  // Heavier flange where the hood passes through the housing wall, so the join
  // reads as bolted on rather than intersecting.
  const flange = new THREE.Mesh(
    new THREE.TorusGeometry(hoodRadius + 0.12, 0.16, 8, 20, Math.PI),
    steel(PALETTE.trim, 0.55)
  );
  flange.position.set(0, beltHeight + 0.16, -(MACHINE.bodyWidth / 2 - conveyorStart));
  group.add(flange);

  // Goo on the belt, glowing out from under the hood.
  const leak = new THREE.Mesh(
    new THREE.BoxGeometry(conveyorWidth - 0.7, 0.06, conveyorLength - 0.5),
    new THREE.MeshBasicMaterial({ color: GOO, transparent: true, opacity: 0.55 })
  );
  leak.position.set(0, beltHeight + 0.11, midZ);
  group.add(leak);

  const underLights = [];
  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight(GOO, 14, 10, 1.7);
    light.position.set(0, beltHeight - 0.15, -(conveyorLength * (i + 0.5)) / 3);
    group.add(light);
    underLights.push(light);
  }

  // Drips falling off the open far end.
  const dripGeometry = new THREE.SphereGeometry(0.09, 8, 8);
  const dripMaterial = new THREE.MeshBasicMaterial({ color: GOO });
  const drips = [];
  for (let i = 0; i < 5; i++) {
    const drip = new THREE.Mesh(dripGeometry, dripMaterial);
    drip.position.set((Math.random() - 0.5) * 1.1, 0, -conveyorLength - 0.15);
    drip.userData = { offset: Math.random(), speed: 0.7 + Math.random() * 0.5 };
    group.add(drip);
    drips.push(drip);
  }

  // Position is applied before rotation, so this offset is along world X — the
  // axis the belt ends up running down once it's turned.
  group.position.set(conveyorStart, 0, 0);
  group.rotation.y = -Math.PI / 2;
  parent.add(group);

  return { beltTextures, leak, underLights, drips };
}

/**
 * The feed line: a spout off the tank that elbows down through the top of the
 * hood, so there's a visible path for the goo from tank to belt.
 */
function buildFeedLine(group) {
  const { tankRadius, beltHeight, conveyorWidth } = MACHINE;
  const hoodTop = beltHeight + 0.16 + conveyorWidth / 2 + 0.18;
  const runY = BODY_TOP + 0.62;
  const dropX = MACHINE.bodyWidth / 2 + 0.55;

  const pipe = steel(PALETTE.metal, 0.55);

  // Horizontal spout leaving the base of the tank.
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, dropX - tankRadius + 0.6, 12),
    pipe
  );
  spout.rotation.z = Math.PI / 2;
  spout.position.set((tankRadius - 0.3 + dropX) / 2, runY, 0);
  spout.castShadow = true;
  group.add(spout);

  // Elbow, then the drop into the hood.
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), pipe);
  elbow.position.set(dropX, runY, 0);
  group.add(elbow);

  const dropLength = runY - hoodTop + 0.5;
  const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, dropLength, 12), pipe);
  drop.position.set(dropX, runY - dropLength / 2, 0);
  drop.castShadow = true;
  group.add(drop);

  // Collar where it enters the hood.
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12), steel(PALETTE.trim));
  collar.position.set(dropX, hoodTop - 0.05, 0);
  group.add(collar);

  // Goo visible in the glass section of the drop pipe.
  const sight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, dropLength * 0.55, 12),
    new THREE.MeshBasicMaterial({ color: GOO, transparent: true, opacity: 0.85 })
  );
  sight.position.set(dropX, runY - dropLength * 0.42, 0);
  group.add(sight);

  return sight;
}

function buildPools(group) {
  const falloff = makeRadialFalloffTexture();

  const pool = (radius, x, z, opacity, squash) => {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 40),
      new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        alphaMap: falloff,
        transparent: true,
        opacity,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    // Squashed off-round so the spill doesn't read as a decal.
    mesh.scale.set(1, squash, 1);
    group.add(mesh);
    return mesh;
  };

  return [
    pool(5.4, 0, 0, 0.34, 0.82),
    pool(2.8, MACHINE.conveyorStart + MACHINE.conveyorLength + 0.2, 0.3, 0.3, 1.2),
  ];
}

export function createMachine(scene) {
  const group = new THREE.Group();
  group.position.set(...MACHINE.center);

  buildHousing(group);
  const hatch = buildHatch(group);
  const tank = buildTank(group);
  const conveyor = buildConveyor(group);
  const feed = buildFeedLine(group);
  const pools = buildPools(group);

  scene.add(group);

  // Colliders are cut to the visible geometry rather than one box around the
  // whole assembly, so nothing blocks you where there's nothing to see.
  const [cx, , cz] = MACHINE.center;
  const hoodTop = MACHINE.beltHeight + 0.16 + MACHINE.conveyorWidth / 2 + 0.18;
  const plinthHalf = (MACHINE.bodyWidth + 1.2) / 2;
  const bodyHalf = MACHINE.bodyWidth / 2;

  const colliders = [
    // The plinth is a low step you can hop onto, so `top` is its surface.
    {
      minX: cx - plinthHalf,
      maxX: cx + plinthHalf,
      minZ: cz - plinthHalf,
      maxZ: cz + plinthHalf,
      top: MACHINE.plinthHeight,
    },
    // The housing is solid at any height — no `top`. Its roof is 3.1m up and a
    // jump only clears 1.3m, so making it landable would just let you walk
    // into the tank standing on it.
    {
      minX: cx - bodyHalf,
      maxX: cx + bodyHalf,
      minZ: cz - bodyHalf,
      maxZ: cz + bodyHalf,
    },
    // Conveyor, from the housing face out to the end of the run.
    {
      minX: cx + bodyHalf,
      maxX: cx + MACHINE.conveyorStart + MACHINE.conveyorLength + 0.2,
      minZ: cz - MACHINE.conveyorWidth / 2 - 0.25,
      maxZ: cz + MACHINE.conveyorWidth / 2 + 0.25,
      top: hoodTop,
    },
  ];

  let time = 0;
  const dripTop = MACHINE.beltHeight - 0.05;

  // 0 = shut, 1 = fully rolled up.
  let hatchTarget = 0;
  let hatchOpenness = 0;

  return {
    group,
    colliders,

    /** World-space point the hatch interaction anchors to. */
    hatchAnchor: hatch.anchor.clone().add(group.position),

    /** Machine-local spot inside the chamber for a loaded item. */
    chamberSlot: hatch.slot.clone(),

    openHatch() {
      hatchTarget = 1;
    },
    closeHatch() {
      hatchTarget = 0;
    },
    get hatchOpen() {
      return hatchTarget === 1;
    },

    update(delta) {
      time += delta;

      // Shutter rolls up. Never scales fully to zero — a zero scale collapses
      // the matrix and three warns about the degenerate normal matrix.
      hatchOpenness += (hatchTarget - hatchOpenness) * Math.min(1, delta * 3.2);
      hatch.shutter.scale.y = Math.max(0.02, 1 - hatchOpenness);
      hatch.glow.intensity = hatchOpenness * 7 * (0.85 + 0.15 * Math.sin(time * 3.4));

      // Belt runs away from the machine.
      const scroll = (time * 0.28) % 1;
      for (const texture of conveyor.beltTextures) texture.offset.y = scroll;

      // Everything pulses together, like the thing is drawing breath.
      const pulse = 0.82 + Math.sin(time * 1.6) * 0.12 + Math.sin(time * 4.1) * 0.06;
      tank.gooMaterial.opacity = 0.88 * pulse;
      tank.glow.intensity = 55 * pulse;
      tank.surface.material.opacity = 0.85 * pulse;
      conveyor.leak.material.opacity = 0.55 * pulse;
      feed.material.opacity = 0.85 * pulse;
      conveyor.underLights.forEach((light, i) => {
        light.intensity = 14 * pulse * (0.75 + 0.25 * Math.sin(time * 3 + i * 2));
      });
      pools.forEach((p, i) => {
        p.material.opacity = (i === 0 ? 0.34 : 0.3) * (0.85 + 0.15 * Math.sin(time * 1.9 + i));
      });

      // Bubbles rise and reset at the surface.
      for (const bubble of tank.bubbles) {
        const t = (time * bubble.userData.speed + bubble.userData.offset) % 1;
        bubble.position.y = tank.tankBottom + 0.2 + t * (tank.fill - 0.3);
        bubble.material.opacity = 0.7 * (1 - t * 0.5);
      }

      for (const drip of conveyor.drips) {
        const t = (time * drip.userData.speed + drip.userData.offset) % 1;
        drip.position.y = dripTop - t * dripTop;
        drip.scale.setScalar(1 - t * 0.4);
      }
    },
  };
}
