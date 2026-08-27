import * as THREE from 'three';
import { makeMetalPanelSurface, makeHazardSurface, metalRepeat } from './textures.js';

/**
 * The tower in the giant hall, and the only way up out of it.
 *
 * It is a staircase. That is the whole idea and everything else follows from
 * it: a spiral stair round a service core, of exactly the kind this building
 * has three of — and every tread is a metre off the one below it. You do not
 * walk up it. You jump, thirteen times, up a stair somebody built for something
 * that is not your size.
 *
 * This is the first thing in the game that says out loud what the back half of
 * the building is for. Everything up to the staff door is human-scaled: ward
 * beds, a corridor you can touch both walls of, a desk with a chair at it. Past
 * that door the ceiling goes to twenty metres and the stairs go to waist
 * height, and no amount of writing on a wall says that as flatly as having to
 * jump to get up one step.
 *
 * ------------------------------------------------------------------------
 *
 * Everything here is boxes with flat tops, because that is what the player
 * collides with — see resolveCollisions in player.js. There are no ramps in
 * this game and there is no way to make one: a collider is an axis-aligned
 * rectangle in plan with a `top`, and the only thing a slope could be is a
 * staircase with very small steps. So the tower is authored as the boxes, and
 * the meshes are hung on them, rather than the other way round. A tower modelled
 * first and boxed afterwards is a tower where the thing you can see and the
 * thing you can stand on are two different shapes.
 *
 * The numbers it is tuned against, all measured off config.js and player.js:
 *
 *   STEP_HEIGHT   0.9   anything this high or less you walk up for free, so a
 *                       tread has to rise MORE than 0.9 or it is not a jump
 *   jump peak     1.31  jumpSpeed^2 / (2 * gravity) = 7.6^2 / 44
 *   player radius 0.42  you are supported while your centre is within this of
 *                       a tread's edge, at both ends of a hop
 *   player height 1.80  eyeHeight + 0.12, which is what decides whether the
 *                       tread above your head is in your way
 *
 * And the one that is not in either file, which was measured by jumping in the
 * running game and is the number that actually decides this:
 *
 *   real jump peak   1.12
 *
 * Not 1.31. The loop clamps its frame delta to 0.05 (see main.js) and integrates
 * the jump a frame at a time, so the discrete arc tops out short of the one the
 * algebra gives — v^2/2g minus about v*dt/2, which at the clamp is a fifth of a
 * metre gone. 1.12 is therefore a floor rather than an estimate: it is what the
 * jump does on the worst frame the loop will admit, and anything above twenty
 * frames a second does at least this well.
 *
 * Which leaves a band of 0.22 to build a staircase in — over 0.9 or it is not a
 * jump at all, under 1.12 or it is not a jump anyone can make. Every tread here
 * rises 1.0: a tenth of a metre clear of the free step, and a tenth and a bit
 * under the top of the arc.
 *
 * That band is why nothing on this tower is made harder by being taller. The
 * first draft had two treads at 1.15 on the reasoning that the climb wanted a
 * couple of hops you notice; they are eleven and thirteen metres up, and they
 * were not hard, they were impossible — the harness peaked two centimetres
 * under the tread, twice, and would have gone on doing it for ever. The three
 * that are harder than the others are harder sideways instead: they are the
 * ones that are broken, and you land on a ledge rather than a slab.
 */

/** The rise of every tread. There is only one, and see above for why. */
const RISE = 1.0;

/**
 * The core, and how far the treads reach off it.
 *
 * `half` is the core's half-width, `reach` how far a tread stands out from its
 * face, and `run` half the tread's width along that face. `run` is deliberately
 * a shade more than `half`: at exactly `half` two consecutive treads would meet
 * at a single corner point and the hop between them would be a jump onto the
 * one place a rectangle cannot be stood on. Over-running by 0.2 gives them a
 * square of overlap to land in, which is what a winder stair actually does.
 */
const CORE = { half: 1.6, reach: 2.6, run: 1.8, thick: 0.34 };

/**
 * Which face of the core a tread stands on. 0 is +x and they go round
 * counter-clockwise seen from above, which is the direction the stair turns.
 */
const FACES = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
];

/**
 * The treads, bottom to top.
 *
 * `face` indexes FACES, `top` is the surface you stand on. Written out rather
 * than generated from a rise and a count, because three of them are not the
 * ordinary tread — see `narrow` — and a table you can read down is worth more
 * here than a loop with two exceptions bolted onto it.
 *
 * It starts at 3.95 and not at floor level. The bottom three treads are gone:
 * they are the heap you climb to reach this one. See RUBBLE.
 */
const FIRST = 3.8;
const TREADS = [
  { face: 1 },
  { face: 2 },
  { face: 3 },
  { face: 0 },
  { face: 1 },
  // Sheared off halfway along. You land on a ledge a bit over a metre deep with
  // nothing under the rest of it, and it is the first tread on the tower you
  // have to look at before you jump rather than after.
  { face: 2, narrow: true },
  { face: 3 },
  { face: 0, narrow: true },
  { face: 1 },
  { face: 2 },
  // The last one, and the worst: a ledge, at nearly fourteen metres, with the
  // gantry on the far side of it. The three broken treads get closer together
  // as the fall gets longer, which is the only difficulty curve a stair can
  // have when every step on it is the same height.
  //
  // It is on face 3 because that is the face pointing down the hall, and the
  // way out is in the wall at the end of it. Eleven treads and not ten for the
  // same reason: the stair has to finish facing the door.
  { face: 3, narrow: true },
].map((tread, i) => ({ ...tread, top: FIRST + RISE * i }));

/**
 * Where the stair arrives, for whoever has to build the way off it.
 *
 * Exported rather than measured by the caller, because the hall cuts a doorway
 * in a wall at this height and hangs a gantry at it — and it does both of those
 * before this file has built anything. Two files agreeing about a number by
 * both being handed it is the same arrangement every doorway in this game uses.
 */
export const SUMMIT = {
  top: TREADS[TREADS.length - 1].top,
  face: TREADS[TREADS.length - 1].face,
};

/**
 * The heap at the bottom, which is the bottom three treads.
 *
 * They came off the core — the stubs are still on it — and they are lying where
 * they fell, stacked well enough to climb. That is doing two jobs. It is the
 * only way onto a stair whose first step is nearly four metres up, and it is
 * the tutorial: the same hop three times, at head height rather than at twelve
 * metres, before the tower asks for it where a miss costs something.
 *
 * The `z` numbers are not free and this is the trap they are avoiding. The
 * lowest tread is a slab in the air with its underside at 3.5, and you are 1.8
 * tall: standing anywhere in its plan at 2.8 puts it through your chest and the
 * collision resolver shoves you sideways out from under it. Written the obvious
 * way — a heap piled against the core, under the first step — the top of the
 * heap became the one place on the tower you could not stand, and the harness
 * fell off it every time. So the whole heap sits outside that footprint, from
 * z 4.35 outwards, and the last slab stops a hand's width short of the tread's
 * outer edge rather than tucking under it.
 *
 * [half-x, half-z, centre x off the core, centre z off the core, top]
 */
const RUBBLE = [
  { hx: 1.2, hz: 1.1, x: -0.3, z: 8.2, top: 0.8, tilt: [0.05, 0.4, -0.03] },
  { hx: 1.1, hz: 1.0, x: 0.2, z: 6.5, top: 1.8, tilt: [-0.06, -0.25, 0.04] },
  { hx: 1.0, hz: 1.0, x: -0.1, z: 5.35, top: 2.8, tilt: [0.04, 0.7, 0.05] },
];

/** A tread's plan rectangle, in the core's own frame. */
function treadBox(face, narrow) {
  const dir = FACES[face];
  const reach = narrow ? 1.15 : CORE.reach;
  // Along the face, and out from it. One of these is x and the other is z; which
  // is which is the whole of what `face` decides.
  const out = [CORE.half, CORE.half + reach];
  const along = [-CORE.run, CORE.run];
  const spanX = dir.x !== 0 ? out.map((v) => v * dir.x) : along;
  const spanZ = dir.z !== 0 ? out.map((v) => v * dir.z) : along;
  return {
    minX: Math.min(...spanX),
    maxX: Math.max(...spanX),
    minZ: Math.min(...spanZ),
    maxZ: Math.max(...spanZ),
  };
}

/**
 * The tower, its colliders, and where it puts you when you get to the top.
 *
 * `origin` is the core's centre on the floor. Everything is built around that
 * and nothing here knows what room it is in, which is the same arrangement the
 * arms have: it is a thing that stands somewhere, not a feature of one hall.
 */
export function createClimbTower({ parent, colliders, origin }) {
  const group = new THREE.Group();
  group.position.copy(origin);
  parent.add(group);

  const solid = (minX, maxX, minZ, maxZ, extra = {}) =>
    colliders.push({
      minX: origin.x + minX,
      maxX: origin.x + maxX,
      minZ: origin.z + minZ,
      maxZ: origin.z + maxZ,
      ...extra,
    });

  const concrete = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(3.2, 4), '#4c4f48'),
    color: '#4c4f48',
    roughness: 0.88,
    metalness: 0.06,
  });
  const treadMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(3.6, 2.6), '#565a51'),
    color: '#565a51',
    roughness: 0.8,
    metalness: 0.12,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#3a3f3c',
    roughness: 0.5,
    metalness: 0.55,
  });
  /**
   * The nosing: a hazard stripe along the front edge of every tread.
   *
   * Not decoration — it is the readability of the whole tower. Grey slabs on a
   * grey core in a hall lit from ten metres up are a shape you have to work out
   * before each jump, and the one thing a player must never have to work out is
   * where the edge is. A yellow line on the lip is what a real stair of this
   * kind has and it is also exactly the affordance: it tells you where to stand
   * and where to aim, from across the hall and in the dark.
   */
  const nosingMat = new THREE.MeshStandardMaterial({
    ...makeHazardSurface(3, 1),
    roughness: 0.72,
    metalness: 0.05,
  });

  // ------------------------------------------------------------------ core ---

  const topTread = TREADS[TREADS.length - 1];
  const coreTop = topTread.top + 1.4;
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(CORE.half * 2, coreTop, CORE.half * 2),
    concrete
  );
  core.position.y = coreTop / 2;
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);
  // Solid at any height: no `top`. It is not something to end up standing on —
  // there is nothing up there and a player who got onto it would be looking
  // down at the stair they were meant to be on from the one place the tower
  // does not go.
  solid(-CORE.half, CORE.half, -CORE.half, CORE.half);

  // A band round the core at every tread's level, so the shaft reads as built
  // in lifts rather than extruded, and the eye has something to count.
  for (const tread of TREADS) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(CORE.half * 2 + 0.12, 0.1, CORE.half * 2 + 0.12),
      steelMat
    );
    band.position.y = tread.top - 0.9;
    group.add(band);
  }

  /**
   * The stubs of the three that came off, low down on the core.
   *
   * The heap at the bottom is only a heap until you can see where it came from.
   * Three broken roots at the heights the missing treads were, with the hazard
   * line still on what is left of them, and the stair reads as having been three
   * steps longer — which is the difference between rubble somebody piled up and
   * a stair that lost its bottom.
   */
  for (let i = 0; i < 3; i++) {
    // Three below the first one, on the three faces before its own — the stair
    // run backwards, which is where the heap on the floor came from.
    const top = FIRST - RISE * (3 - i);
    const dir = FACES[(TREADS[0].face + i + 1) % 4];
    const stub = new THREE.Mesh(
      new THREE.BoxGeometry(
        dir.x !== 0 ? 0.5 : CORE.run * 2,
        CORE.thick,
        dir.z !== 0 ? 0.5 : CORE.run * 2
      ),
      treadMat
    );
    stub.position.set(
      dir.x * (CORE.half + 0.25),
      top - CORE.thick / 2,
      dir.z * (CORE.half + 0.25)
    );
    stub.rotation.set(dir.z * 0.04, 0, dir.x * -0.05);
    stub.castShadow = true;
    group.add(stub);
  }

  /** Dev handle, and what the harness walks: every surface, in world space. */
  const steps = [];

  const addSurface = (label, box, top, floating = true) => {
    solid(box.minX, box.maxX, box.minZ, box.maxZ, {
      top,
      // A tread is a slab in mid air, not a pillar. Without a `bottom` the box
      // is solid from the floor up and the tower becomes one lump you cannot
      // get round the base of, let alone climb: everything under the lowest
      // step would be inside a wall.
      //
      // The heap is the other way round and gets no `bottom`, because it is a
      // heap: it is on the floor, and there is nothing to walk under.
      ...(floating ? { bottom: top - CORE.thick } : {}),
    });
    steps.push({
      label,
      top,
      x: origin.x + (box.minX + box.maxX) / 2,
      z: origin.z + (box.minZ + box.maxZ) / 2,
      minX: origin.x + box.minX,
      maxX: origin.x + box.maxX,
      minZ: origin.z + box.minZ,
      maxZ: origin.z + box.maxZ,
    });
  };

  // ---------------------------------------------------------------- rubble ---

  RUBBLE.forEach((slab, i) => {
    const box = {
      minX: slab.x - slab.hx,
      maxX: slab.x + slab.hx,
      minZ: slab.z - slab.hz,
      maxZ: slab.z + slab.hz,
    };
    // The mesh is canted and the box is not, which is the one place in here the
    // two are allowed to disagree — a slab lying at four degrees reads as
    // fallen, and a collider that followed it would be a surface that slides
    // you off something you can plainly see is flat enough to stand on. The
    // cant is small enough that the box is inside the slab everywhere it
    // matters, and the top of the box is the top of the slab's high corner.
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(slab.hx * 2 + 0.3, 0.46, slab.hz * 2 + 0.3),
      treadMat
    );
    mesh.position.set(slab.x, slab.top - 0.3, slab.z);
    mesh.rotation.set(...slab.tilt);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const line = new THREE.Mesh(
      new THREE.BoxGeometry(slab.hx * 2 + 0.3, 0.49, 0.14),
      nosingMat
    );
    line.position.copy(mesh.position);
    line.rotation.copy(mesh.rotation);
    line.translateZ(-slab.hz - 0.08);
    group.add(line);

    addSurface(`rubble ${i}`, box, slab.top, false);
  });

  // Dust and chunks round the foot of the heap. No colliders: they are ankle
  // height, and a shin-high box in the one place the player is definitely going
  // to be walking is a thing to trip on for no reason.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.4;
    const r = 3.4 + (i % 4) * 1.1;
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 + (i % 3) * 0.22, 0.16 + (i % 2) * 0.1, 0.36),
      treadMat
    );
    chunk.position.set(Math.cos(a) * r * 0.6, 0.08, 4.6 + Math.sin(a) * r * 0.5);
    chunk.rotation.set(0.1, a, 0.06);
    chunk.receiveShadow = true;
    group.add(chunk);
  }

  // ---------------------------------------------------------------- treads ---

  TREADS.forEach((tread, i) => {
    const box = treadBox(tread.face, tread.narrow);
    const dir = FACES[tread.face];

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(box.maxX - box.minX, CORE.thick, box.maxZ - box.minZ),
      treadMat
    );
    slab.position.set(
      (box.minX + box.maxX) / 2,
      tread.top - CORE.thick / 2,
      (box.minZ + box.maxZ) / 2
    );
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);

    // The nosing, along the outer edge — the edge you jump off and the edge you
    // aim at, which on a stair that turns is the far one from the core.
    const nosing = new THREE.Mesh(
      new THREE.BoxGeometry(
        dir.x !== 0 ? 0.14 : box.maxX - box.minX,
        CORE.thick + 0.03,
        dir.z !== 0 ? 0.14 : box.maxZ - box.minZ
      ),
      nosingMat
    );
    nosing.position.set(
      dir.x !== 0 ? (dir.x > 0 ? box.maxX - 0.07 : box.minX + 0.07) : slab.position.x,
      tread.top - CORE.thick / 2,
      dir.z !== 0 ? (dir.z > 0 ? box.maxZ - 0.07 : box.minZ + 0.07) : slab.position.z,
    );
    group.add(nosing);

    // And a bracket under each one, back to the core. A slab this size standing
    // out of a wall on nothing is the one thing in here that would read as
    // built by a level editor rather than by an engineer. Leaned back under the
    // slab, away from the face it comes off — which is why the tilt is about z
    // for a tread on an x face and about x for one on a z face.
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), steelMat);
      const along = side * (CORE.run - 0.3);
      strut.position.set(
        dir.x !== 0 ? dir.x * (CORE.half + 0.55) : along,
        tread.top - 0.62,
        dir.z !== 0 ? dir.z * (CORE.half + 0.55) : along
      );
      strut.rotation.x = -dir.z * 0.5;
      strut.rotation.z = dir.x * 0.5;
      group.add(strut);
    }

    // Broken treads have a torn end rather than a sawn one.
    if (tread.narrow) {
      const torn = new THREE.Mesh(
        new THREE.BoxGeometry(
          dir.x !== 0 ? 0.3 : 0.5,
          CORE.thick + 0.16,
          dir.z !== 0 ? 0.3 : 0.5
        ),
        treadMat
      );
      torn.position.set(
        dir.x !== 0 ? dir.x * (CORE.half + 1.25) : -0.9,
        tread.top - CORE.thick,
        dir.z !== 0 ? dir.z * (CORE.half + 1.25) : -0.9
      );
      torn.rotation.set(0.3, 0.4, 0.25);
      group.add(torn);
    }

    addSurface(`tread ${i}`, box, tread.top);
  });

  return {
    group,
    /** Every surface on the tower, bottom to top, in world space. */
    steps,
    /** The top tread: what the way out has to be built off. */
    get summit() {
      const last = steps[steps.length - 1];
      return { top: last.top, face: TREADS[TREADS.length - 1].face, box: last };
    },
    /** How high the shaft itself goes, for whatever is above it. */
    coreTop,
  };
}
