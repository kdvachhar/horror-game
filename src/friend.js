import * as THREE from 'three';
import { PLAYER } from './config.js';
import { buildBucketMesh } from './bucket.js';
import { PALETTE } from './textures.js';
import { playBucketStep, playBucketJump, playBucketLand } from './audio.js';

/**
 * The thing the machine makes: the bucket you fed it, up on a pair of legs.
 *
 * Behaviour is a port of the possessable cube from the ../3d-plat prototype —
 * the simulated googly eyes, the turn-to-face, the follow steering and its
 * tuning values all come across unchanged. Only the body is different, and it
 * keeps the cube's overall height so the follow distances still read right.
 *
 * The one thing that could not come across is Rapier. That project drives the
 * cube as a dynamic rigid body and lets the solver own the result; this project
 * has no physics engine, so gravity, ground contact and the collider pushout
 * are hand-rolled below. The steering above that — impulses toward a target
 * speed, with authority cut in mid-air — is ported as-is, so it still feels
 * heavy and slightly unruly rather than glued to the player.
 */

/**
 * How tall it is for the purpose of squeezing through things. Measured to the
 * top of the pail rather than the handle, since the handle is a wire loop and
 * would not be what stopped it.
 */
export const FRIEND_HEIGHT = 0.82;

/**
 * How far up it will step without being asked to jump.
 *
 * Much lower than the player's 0.9, and deliberately so. This thing is 0.82
 * tall on legs a third of a metre long; a step it can take is a small one.
 *
 * The number is what every gate in the medical room is measured against, and
 * it sits under all of them: the mattress a tipped bed sheds is 0.16 and gets
 * walked over, but the fallen chair at 0.34, the beds at 0.86, the boards at
 * 0.66 and 0.7 apart, and the window's sill 0.49 above the bed you reach it
 * from are every one of them a jump. Raise this past 0.34 and the climb starts
 * losing its bottom step; past 0.49 and the window stops being jumped at all.
 */
const STEP_HEIGHT = 0.25;
/** Metres per second the view catches up after a step, while possessed. */
const STEP_SMOOTHING = 4.5;

// Origin is at the feet. Legs plus body come to roughly the cube's 0.9m.
const LEG_HEIGHT = 0.34;
const BODY_SCALE = 1.33;
const BODY_RADIUS = 0.3 * BODY_SCALE;
const BODY_HEIGHT = 0.41 * BODY_SCALE;

// Googly eyes. Sizes in metres, on a 0.9m cube. The pupils are simulated
// rather than drawn in a fixed spot: each is a loose disc inside a circular
// chamber, pushed by the cube's own acceleration.
// Scaled down from the cube's 0.16, since a bucket's face is narrower than a
// 0.9m flat panel and the eyes have to sit within its curve.
const EYE_RADIUS = 0.155;
const PUPIL_RADIUS = 0.078;
/**
 * How far a pupil's centre travels before it stops.
 *
 * Deliberately short of the rim. Its eyes are 0.68m up and yours are 1.68, so
 * it is always looking up at you — and a big pupil pinned into the top corner
 * with white showing underneath is a glare, not a look. Kept nearer the middle,
 * with white all the way round, it reads as wide-eyed instead.
 */
const PUPIL_TRAVEL = (EYE_RADIUS - PUPIL_RADIUS) * 0.6;
const EYE_SPACING = 0.165;
/** Blush, low and to the outside of each eye. */
const BLUSH_RADIUS = 0.075;
/** Height of the eyes above the feet — the upper third of the bucket. */
const EYE_HEIGHT = LEG_HEIGHT + BODY_HEIGHT * 0.62;
/** Lift off the surface so they never z-fight with the face beneath. */
const EYE_LIFT = 0.006;
/** Velocity kept when a pupil hits the rim. Low: they thud, they don't ping. */
const PUPIL_BOUNCE = 0.32;
const PUPIL_DAMPING = 5.5;
/** Underdamped against PUPIL_DAMPING, so a lock-on overshoots and settles. */
const PUPIL_STIFFNESS = 90;
const PUPIL_INERTIA = 0.04;
/** Aim tolerance, radians. Inside this the cube stops rather than hunting. */
const FACE_DEADBAND = 0.015;
const EYE_TRACK_ANGLE = 42;
const EYE_TURN_RATE = 3.5;

// Driving tuning. Deliberately slower and heavier than the player: it is a
// bucket on stub legs, and the difference between the two bodies is most of
// what makes swapping between them interesting.
const DRIVE_SPEED = 2.4;
const DRIVE_RUN_SPEED = 3.6;
const DRIVE_ACCEL = 22;
// Peak is v^2 / 2g, so against PLAYER.gravity of 22 this is a 1.15m hop, up
// from 0.90. Measured on a fixed 1/60 step it samples a little under that —
// the apex falls between two frames — and it now clears a tipped bed's 1.05m
// frame as well as an upright one's mattress, so all of the ward's wreckage is
// climbable.
//
// This number is load bearing beyond how it feels. Two gates in the medical
// room are set just above it on purpose: the window's sill, so the bed and the
// desk either side are what get you through, and the lowest board in the store
// room, so the fallen chair is what gets you started up it. Raise this again
// and both have to go up with it or they stop being gates at all.
const DRIVE_JUMP = 7.1;
/**
 * Shortest gap between footstep sounds, in seconds.
 *
 * The gait advances 5.5 radians per metre per second and plants a foot every
 * half cycle, so cadence is 1.75 x speed: about 6 a second driving, and eleven
 * when it is following you at 6.5m/s — past the point where separate taps are
 * audible as taps rather than as a rattle. This is the ceiling. Raise it if the
 * patter is still too busy; the legs stay as they are either way, since their
 * timing is the prototype's and looks right.
 */
const STEP_MIN_GAP = 0.14;

// Follow tuning, straight from the prototype's tuning.ts.
const FOLLOW_DISTANCE = 2.6;
const FOLLOW_SPEED = 6.5;
const FOLLOW_ACCEL = 30;
const HOP_IMPULSE = 5.4;
/** Stands in for air resistance and rolling losses. */
const LINEAR_DAMPING = 0.45;

const EYE_FORCE = new THREE.Vector3();
const EYE_TO_CAM = new THREE.Vector3();
const WORLD_QUAT = new THREE.Quaternion();

export function createFriend(scene) {
  // Root sits at the feet; everything else hangs off it and yaws with it.
  const mesh = new THREE.Group();
  mesh.visible = false;
  scene.add(mesh);

  // Plain galvanised, same as the one you carried in — the eyes and legs are
  // what say it's alive, not a coat of paint.
  const body = buildBucketMesh();
  body.scale.setScalar(BODY_SCALE);
  body.position.y = LEG_HEIGHT;
  body.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  mesh.add(body);

  // A pair of stubby legs. Each is a group pivoting at the hip so the whole
  // limb swings from there when it walks.
  const legMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.metalDark,
    roughness: 0.5,
    metalness: 0.7,
  });
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.17, LEG_HEIGHT, 0);
    mesh.add(hip);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.038, LEG_HEIGHT, 10),
      legMaterial
    );
    shin.position.y = -LEG_HEIGHT / 2;
    shin.castShadow = true;
    hip.add(shin);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.055, 0.21), legMaterial);
    foot.position.set(0, -LEG_HEIGHT + 0.027, 0.03);
    foot.castShadow = true;
    hip.add(foot);

    legs.push(hip);
  }

  // Two eyes stuck on the front of the bucket. Parented to the root so the
  // creature brings them round to you by turning its whole body. Unlit on
  // purpose: they should read as cartoon paint at any light level.
  const eyeGroup = new THREE.Group();
  const scleraGeometry = new THREE.CircleGeometry(EYE_RADIUS, 28);
  const pupilGeometry = new THREE.CircleGeometry(PUPIL_RADIUS, 20);
  const scleraMaterial = new THREE.MeshBasicMaterial({ color: 0xfbfbf7 });
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x14110d });
  const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const blushMaterial = new THREE.MeshBasicMaterial({
    color: 0xe98d88,
    transparent: true,
    opacity: 0.6,
  });
  const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x14110d });
  const pupils = [];

  // Radius of the bucket at eye height — it tapers, so this isn't the rim.
  const faceRadius =
    (0.22 + (0.3 - 0.22) * ((EYE_HEIGHT - LEG_HEIGHT) / BODY_HEIGHT)) * BODY_SCALE;

  for (const side of [-1, 1]) {
    const x = side * EYE_SPACING;
    // Sit each eye on the barrel and tilt it to match the surface, rather than
    // hanging both off one flat plane — on a round body that leaves the outer
    // edges floating well clear of the bucket.
    const surfaceZ = Math.sqrt(Math.max(faceRadius * faceRadius - x * x, 0.0001));

    const sclera = new THREE.Mesh(scleraGeometry, scleraMaterial);
    sclera.position.set(x, EYE_HEIGHT, surfaceZ + EYE_LIFT);
    // Only part of the way round. Matching the barrel exactly turns both
    // circles into slanted ellipses that read as eyebrows drawn down.
    sclera.rotation.y = Math.atan2(x, surfaceZ) * 0.5;
    eyeGroup.add(sclera);

    const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    pupil.position.set(0, 0, 0.002);
    sclera.add(pupil);

    // A catchlight, parented to the pupil so it swims with it. Two dots, one
    // big one small, which is the whole trick — a flat black disc reads as a
    // hole and the same disc with a highlight reads as looking at you.
    for (const [hx, hy, hr] of [
      [-0.026, 0.028, 0.026],
      [0.022, -0.022, 0.012],
    ]) {
      const glint = new THREE.Mesh(new THREE.CircleGeometry(hr, 12), highlightMaterial);
      glint.position.set(hx, hy, 0.002);
      pupil.add(glint);
    }

    // Blush, sat on the barrel below and outside the eye.
    // Kept round the front. Further out and the barrel carries it past 45
    // degrees, where it is edge-on to anyone looking at the face.
    const bx = side * (EYE_SPACING + 0.045);
    const by = EYE_HEIGHT - 0.12;
    const bz = Math.sqrt(Math.max(faceRadius * faceRadius - bx * bx, 0.0001));
    const blush = new THREE.Mesh(new THREE.CircleGeometry(BLUSH_RADIUS, 18), blushMaterial);
    blush.position.set(bx, by, bz + EYE_LIFT * 0.5);
    blush.rotation.y = Math.atan2(bx, bz);
    blush.scale.set(1, 0.62, 1);
    eyeGroup.add(blush);

    pupils.push({
      mesh: pupil,
      // Each eye sights from its own centre, so they converge slightly on
      // anything close — the cross-eyed look you get up against a wall.
      origin: new THREE.Vector2(x, EYE_HEIGHT),
      pos: new THREE.Vector2(),
      vel: new THREE.Vector2(),
    });
  }

  // And a mouth: the bottom of a ring, which is a smile. Built from beads
  // first and they read as gritted teeth — a smile has to be one unbroken
  // curve or it is a row of something else.
  {
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.013, 6, 20, Math.PI * 0.78),
      mouthMaterial
    );
    // Turned so the open side is up and the arc hangs below it.
    smile.rotation.z = -Math.PI * 0.89;
    smile.position.set(0, EYE_HEIGHT - 0.145, faceRadius + EYE_LIFT);
    eyeGroup.add(smile);
  }

  eyeGroup.renderOrder = 1;
  mesh.add(eyeGroup);

  const position = new THREE.Vector3();

  // Possession state. The rule ported from ../3d-plat is that the friend
  // updates every tick either way — only where its steering comes from
  // changes. Nothing is ever frozen, so handing control back never needs a
  // resync.
  // How loud it is from where you are standing. Updated every frame, so the
  // jump — which is triggered from outside the loop — has something current to
  // use without needing the camera passed to it.
  // How far the view is still lagging behind a step already taken. Only seen
  // while you are inside it, but tracked either way so it is right on entry.
  let stepLag = 0;

  let listenerLevel = 1;
  let lastStep = 0;
  let stepCooldown = 0;

  let driven = false;
  let driveYaw = 0;
  const driveInput = { forward: false, back: false, left: false, right: false, run: false };
  const velocity = new THREE.Vector3();
  const prevVelocity = new THREE.Vector3();

  let active = false;
  let following = false;
  let grounded = false;
  let stuckTimer = 0;
  let yaw = 0;
  let walkPhase = 0;

  // position is the feet, so the ground is simply y = 0 plus whatever it is
  // standing on. R is its footprint for pushing out of props.
  const R = BODY_RADIUS;

  function resolveCollisions(colliders) {
    // No room clamp — the shell is wall colliders now, so it can follow you
    // through the doorway.
    for (const box of colliders) {
      if (box.enabled?.() === false) continue;
      // Same rule as the player: anything it has climbed above no longer blocks.
      if (position.y >= (box.top ?? Infinity) - 0.02) continue;
      // And low enough to step onto rather than be stopped by, from the ground.
      if (grounded && box.top !== undefined && box.top - position.y <= STEP_HEIGHT) continue;
      // And the other way about: a gap sized for something this short is not
      // a wall to it at all.
      if (FRIEND_HEIGHT <= (box.passHeight ?? -Infinity)) continue;
      // Ducked clean under it. A box with a `bottom` is a thing up in the air
      // with open space beneath, so passing below it is not passing through it.
      if (position.y + FRIEND_HEIGHT <= (box.bottom ?? -Infinity)) continue;
      if (
        position.x < box.minX - R ||
        position.x > box.maxX + R ||
        position.z < box.minZ - R ||
        position.z > box.maxZ + R
      ) {
        continue;
      }

      const pushLeft = position.x - (box.minX - R);
      const pushRight = box.maxX + R - position.x;
      const pushBack = position.z - (box.minZ - R);
      const pushFront = box.maxZ + R - position.z;
      const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);

      if (smallest === pushLeft) position.x = box.minX - R;
      else if (smallest === pushRight) position.x = box.maxX + R;
      else if (smallest === pushBack) position.z = box.minZ - R;
      else position.z = box.maxZ + R;
    }
  }

  /**
   * Highest surface under it that it could land on this frame.
   *
   * `previousFeetY` is the guard, and it is the whole point of the function.
   * Without it any box whose footprint you merely touch counts as ground, so
   * walking into the side of a bed snapped the bucket a clear 0.86m into the
   * air and left it standing on top — it teleported onto anything it bumped.
   * A surface only supports you if you were already above it; otherwise it is
   * a wall, and resolveCollisions below is what deals with it.
   */
  function supportHeight(colliders, previousFeetY) {
    let ground = 0;
    for (const box of colliders) {
      if (box.top === undefined || box.enabled?.() === false) continue;
      // A step's worth of reach while grounded, which is what carries it up
      // onto whatever resolveCollisions just let it walk into. Airborne it
      // stays at a hair, or a jump would snap it onto ledges it flew past.
      if (box.top > previousFeetY + (grounded ? STEP_HEIGHT : 0.02)) continue;
      if (box.top <= ground) continue;
      if (
        position.x > box.minX - R &&
        position.x < box.maxX + R &&
        position.z > box.minZ - R &&
        position.z < box.maxZ + R
      ) {
        ground = box.top;
      }
    }
    return ground;
  }

  /**
   * The lowest underside overhead, so a jump taken beneath something stops
   * against it instead of passing up through it.
   *
   * Only boxes that declare a `bottom` count — everything else is solid to the
   * floor and was never something you could be underneath. `previousHeadY` is
   * where the head was at the start of the frame: an underside already below
   * that has been cleared, and clamping to it would drag the bucket back down
   * through a board it is standing on.
   */
  function ceilingHeight(colliders, previousHeadY) {
    let ceiling = Infinity;
    for (const box of colliders) {
      if (box.bottom === undefined || box.enabled?.() === false) continue;
      if (box.bottom < previousHeadY - 0.02) continue;
      if (box.bottom >= ceiling) continue;
      if (
        position.x > box.minX - R &&
        position.x < box.maxX + R &&
        position.z > box.minZ - R &&
        position.z < box.maxZ + R
      ) {
        ceiling = box.bottom;
      }
    }
    return ceiling;
  }

  /**
   * Swing the legs in proportion to how fast it is actually travelling, so the
   * gait matches the movement rather than running on its own clock.
   */
  function walk(delta, speed) {
    walkPhase += speed * delta * 5.5;
    const swing = Math.min(1, speed / 3.5) * 0.7;

    legs[0].rotation.x = Math.sin(walkPhase) * swing;
    legs[1].rotation.x = -Math.sin(walkPhase) * swing;

    // Small counter-bob on the body, dipping as each leg passes under it.
    body.position.y = LEG_HEIGHT + Math.abs(Math.cos(walkPhase)) * 0.035 * (swing / 0.7);
  }

  /**
   * Steer from the player's own keys, in the direction they are looking.
   * Deliberately the same velocity path as follow() below, so a driven friend
   * is exactly as heavy and as prone to catching on things as a trailing one.
   */
  function drive(delta) {
    const forwardX = -Math.sin(driveYaw);
    const forwardZ = -Math.cos(driveYaw);
    const rightX = Math.cos(driveYaw);
    const rightZ = -Math.sin(driveYaw);

    let wx = 0;
    let wz = 0;
    if (driveInput.forward) { wx += forwardX; wz += forwardZ; }
    if (driveInput.back) { wx -= forwardX; wz -= forwardZ; }
    if (driveInput.right) { wx += rightX; wz += rightZ; }
    if (driveInput.left) { wx -= rightX; wz -= rightZ; }

    const wish = Math.hypot(wx, wz);
    const want = wish > 0 ? (driveInput.run ? DRIVE_RUN_SPEED : DRIVE_SPEED) : 0;
    if (wish > 0) {
      wx /= wish;
      wz /= wish;
    }

    let dvx = wx * want - velocity.x;
    let dvz = wz * want - velocity.z;
    // Authority is cut in mid-air, the same as when following, so a jump
    // commits you to the arc you left the ground with.
    const maxDv = DRIVE_ACCEL * (grounded ? 1 : 0.18) * delta;
    const length = Math.hypot(dvx, dvz);
    if (length > maxDv) {
      dvx = (dvx / length) * maxDv;
      dvz = (dvz / length) * maxDv;
    }
    velocity.x += dvx;
    velocity.z += dvz;
  }

  /**
   * Trail the player. Steering goes through the same velocity changes driving
   * would, rather than a scripted lerp, so it still bumps into things and gets
   * caught on the machine instead of gliding through the room.
   */
  function follow(delta, targetPosition) {
    const dx = targetPosition.x - position.x;
    const dz = targetPosition.z - position.z;
    const distance = Math.hypot(dx, dz);
    const speed = Math.hypot(velocity.x, velocity.z);

    if (distance <= FOLLOW_DISTANCE) {
      stuckTimer = 0;
      // Brake rather than coast, or it drifts past you and oscillates.
      if (grounded && speed > 0.05) {
        const dv = Math.min(speed, FOLLOW_ACCEL * delta);
        velocity.x += (-velocity.x / speed) * dv;
        velocity.z += (-velocity.z / speed) * dv;
      }
      return;
    }

    // Ease the target speed down as it closes, so it settles instead of
    // hunting back and forth around the stop radius.
    const approach = Math.min(1, (distance - FOLLOW_DISTANCE) / 1.5);
    const want = FOLLOW_SPEED * approach;

    let dvx = (dx / distance) * want - velocity.x;
    let dvz = (dz / distance) * want - velocity.z;
    const accel = FOLLOW_ACCEL * (grounded ? 1 : 0.18);
    const maxDv = accel * delta;
    const length = Math.hypot(dvx, dvz);
    if (length > maxDv) {
      dvx = (dvx / length) * maxDv;
      dvz = (dvz / length) * maxDv;
    }
    velocity.x += dvx;
    velocity.z += dvz;

    // Wanting to move but barely moving means something is in the way. A hop
    // clears small lips; anything bigger is meant to stop it, and will.
    if (speed < 0.4) stuckTimer += delta;
    else stuckTimer = 0;
    if (stuckTimer > 0.7 && grounded) {
      velocity.y = HOP_IMPULSE;
      stuckTimer = 0;
      // Same sound as a jump you asked for. Without this a following bucket
      // hops in silence and then thumps on the way down, which reads as the
      // landing having come from nowhere.
      grounded = false;
      playBucketJump(listenerLevel);
    }
  }

  /** Turn the whole cube so its eye face points at whoever is watching. */
  function faceCamera(delta, camera) {
    const dx = camera.position.x - position.x;
    const dz = camera.position.z - position.z;
    if (Math.hypot(dx, dz) < 0.4) return; // directly overhead — no yaw to aim

    const desired = Math.atan2(dx, dz);
    let error = desired - yaw;
    error = Math.atan2(Math.sin(error), Math.cos(error)); // shortest way round
    if (Math.abs(error) < FACE_DEADBAND) return;

    yaw += error * (1 - Math.exp(-EYE_TURN_RATE * delta));
    mesh.rotation.y = yaw;
  }

  /**
   * Aim the pupils at the camera. They are springs that lead the face: because
   * the body's turn lags, they swing across first, then ease back toward centre
   * as it catches up. The cube's own acceleration is fed in as a small shove to
   * keep the googly wobble; gravity is not, since a constant downward pull
   * would just drag the aim off target.
   */
  function updateEyes(delta, camera) {
    if (delta <= 0) return;

    EYE_FORCE.set(
      -(velocity.x - prevVelocity.x) / delta,
      -(velocity.y - prevVelocity.y) / delta,
      -(velocity.z - prevVelocity.z) / delta
    );
    prevVelocity.copy(velocity);

    eyeGroup.getWorldQuaternion(WORLD_QUAT).invert();
    EYE_FORCE.applyQuaternion(WORLD_QUAT);

    eyeGroup.getWorldPosition(EYE_TO_CAM);
    EYE_TO_CAM.subVectors(camera.position, EYE_TO_CAM).applyQuaternion(WORLD_QUAT);

    const trackLimit = EYE_TRACK_ANGLE * (Math.PI / 180);
    const damp = Math.exp(-PUPIL_DAMPING * delta);

    for (const pupil of pupils) {
      const ex = EYE_TO_CAM.x - pupil.origin.x;
      const ey = EYE_TO_CAM.y - pupil.origin.y;
      const ez = Math.max(EYE_TO_CAM.z, 1e-4);
      const off = Math.hypot(ex, ey);

      let tx = 0;
      let ty = 0;
      if (off > 1e-5) {
        // Deflect proportionally to how far off-axis the camera has drifted,
        // saturating at the rim so the pupil never tries to leave the eye.
        const amount = Math.min(1, Math.atan2(off, ez) / trackLimit);
        tx = (ex / off) * PUPIL_TRAVEL * amount;
        // Vertical tracking is held right back. You are a metre above it, so
        // aiming honestly parks both pupils against the top of the eye for the
        // whole game, and that is the single thing that made it look angry.
        ty = (ey / off) * PUPIL_TRAVEL * amount * 0.4;
      }

      pupil.vel.x =
        (pupil.vel.x +
          ((tx - pupil.pos.x) * PUPIL_STIFFNESS + EYE_FORCE.x * PUPIL_INERTIA) * delta) *
        damp;
      pupil.vel.y =
        (pupil.vel.y +
          ((ty - pupil.pos.y) * PUPIL_STIFFNESS + EYE_FORCE.y * PUPIL_INERTIA) * delta) *
        damp;
      pupil.pos.x += pupil.vel.x * delta;
      pupil.pos.y += pupil.vel.y * delta;

      const d = Math.hypot(pupil.pos.x, pupil.pos.y);
      if (d > PUPIL_TRAVEL) {
        const nx = pupil.pos.x / d;
        const ny = pupil.pos.y / d;
        pupil.pos.x = nx * PUPIL_TRAVEL;
        pupil.pos.y = ny * PUPIL_TRAVEL;
        // Kill the outward component and bounce back a little.
        const outward = pupil.vel.x * nx + pupil.vel.y * ny;
        if (outward > 0) {
          pupil.vel.x -= (1 + PUPIL_BOUNCE) * outward * nx;
          pupil.vel.y -= (1 + PUPIL_BOUNCE) * outward * ny;
        }
      }

      pupil.mesh.position.x = pupil.pos.x;
      pupil.mesh.position.y = pupil.pos.y;
    }
  }

  return {
    mesh,
    position,

    get isActive() {
      return active;
    },
    get isFollowing() {
      return following;
    },

    /** Drops it into the world, alive but not yet trailing anyone. */
    spawn(at, initialVelocity) {
      active = true;
      following = false;
      position.copy(at);
      velocity.copy(initialVelocity ?? new THREE.Vector3());
      prevVelocity.copy(velocity);
      mesh.position.copy(position);
      mesh.visible = true;
    },

    /** Start trailing the player. */
    collect() {
      following = true;
    },

    get isDriven() {
      return driven;
    },

    /** Whether its feet are on something. Jumping only works when they are. */
    get isGrounded() {
      return grounded;
    },

    /** Where the camera sits when you are inside it — its own eye line. */
    get eyeHeight() {
      return EYE_HEIGHT;
    },

    /** How far the view should still be held back after a step up. */
    get viewLag() {
      return stepLag;
    },

    /** Dev handle: how loud its own sounds are from where the listener is. */
    get listenerLevel() {
      return listenerLevel;
    },

    /**
     * Take it over, or give it back.
     *
     * While driven the mesh stops writing colour *and* depth, but keeps
     * casting: you should not be looking at the inside of your own head, and
     * the shadow on the floor is the only thing left telling you where your
     * body is. Same trick the player's shadow body uses — `visible = false`
     * would take the shadow with it.
     *
     * Both flags are needed. Suppressing colour alone leaves the geometry
     * writing depth, and since the camera sits inside the bucket with the eyes
     * and rim right around it, that painted the entire view black.
     */
    setDriven(on) {
      driven = on;
      // Letting go parks it. An unconditional follower would drag it straight
      // back off wherever you just carefully put it.
      if (on) following = false;
      for (const key of Object.keys(driveInput)) driveInput[key] = false;
      mesh.traverse((object) => {
        const material = object.material;
        if (!material) return;
        // Remember what each one was, rather than assuming they all default to
        // writing depth — restoring the wrong value is invisible until some
        // later material needs it off.
        material.userData.depthWrite ??= material.depthWrite;
        material.colorWrite = !on;
        material.depthWrite = on ? false : material.userData.depthWrite;
      });
    },

    /** Feed it the player's keys and look direction for this tick. */
    setDriveInput(lookYaw, input) {
      driveYaw = lookYaw;
      Object.assign(driveInput, input);
    },

    jump() {
      if (!grounded) return;
      velocity.y = DRIVE_JUMP;
      grounded = false;
      playBucketJump(listenerLevel);
    },

    update(delta, camera, targetPosition, colliders) {
      if (!active) return;

      if (driven) drive(delta);
      else if (following) follow(delta, targetPosition);

      // Captured before gravity moves it, so a surface counts as ground only
      // if the bucket was standing above it at the start of the frame.
      const previousFeetY = position.y;

      velocity.y -= PLAYER.gravity * delta;
      position.addScaledVector(velocity, delta);

      // Captured before the landing zeroes them, so the impact can be judged.
      const wasGrounded = grounded;
      const impact = velocity.y;

      const ground = supportHeight(colliders, previousFeetY);
      if (position.y <= ground) {
        position.y = ground;
        velocity.y = 0;
        grounded = true;
        // Only a real drop lands. Ignore the sub-centimetre settling that
        // happens on every frame of walking across a flat floor.
        if (!wasGrounded && impact < -2) {
          playBucketLand(listenerLevel * Math.min(1, -impact / 6));
        }
      } else {
        grounded = false;
      }

      // Head first. Anything with an underside stops a jump taken beneath it.
      const ceiling = ceilingHeight(colliders, previousFeetY + FRIEND_HEIGHT);
      if (position.y + FRIEND_HEIGHT > ceiling) {
        position.y = ceiling - FRIEND_HEIGHT;
        if (velocity.y > 0) velocity.y = 0;
      }

      resolveCollisions(colliders);

      const damp = Math.exp(-LINEAR_DAMPING * delta);
      velocity.x *= damp;
      velocity.z *= damp;

      mesh.position.copy(position);

      // Inverse-square off a four-metre reference: full volume when you are
      // inside it, and well down when it is clanking about across the ward.
      // A step taken this frame, bled off over a fraction of a second — the
      // view is bolted to this body when you are driving it, so an 0.86 rise
      // in one frame reads as a teleport.
      if (grounded && wasGrounded && position.y > previousFeetY + 0.02) {
        stepLag = Math.min(STEP_HEIGHT, stepLag + (position.y - previousFeetY));
      }
      stepLag = Math.max(0, stepLag - STEP_SMOOTHING * delta);

      const range = camera.position.distanceTo(position) / 4;
      listenerLevel = 1 / (1 + range * range);

      const speed = Math.hypot(velocity.x, velocity.z);
      walk(delta, speed);

      // A foot plants at each half cycle of the gait, so the step lands with
      // the leg you can watch going down rather than on a clock of its own.
      //
      // With a floor on the interval — see STEP_MIN_GAP.
      stepCooldown -= delta;
      const step = Math.floor(walkPhase / Math.PI);
      if (step !== lastStep) {
        lastStep = step;
        if (grounded && speed > 0.5 && stepCooldown <= 0) {
          stepCooldown = STEP_MIN_GAP;
          playBucketStep(listenerLevel * Math.min(1, 0.45 + speed / 5));
        }
      }

      if (driven) {
        // Driving, the body faces where you are looking. There is no one to
        // turn to and no eyes to aim — you are behind them.
        yaw = driveYaw;
        mesh.rotation.y = yaw;
      } else {
        faceCamera(delta, camera);
        updateEyes(delta, camera);
      }
    },
  };
}
