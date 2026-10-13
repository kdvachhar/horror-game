import * as THREE from 'three';
import { PLAYER } from './config.js';
import * as collision from './collision.js';
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
const EYE_RADIUS = 0.115;
const PUPIL_RADIUS = 0.054;
/** How far a pupil's centre can travel before it hits the rim. */
const PUPIL_TRAVEL = EYE_RADIUS - PUPIL_RADIUS;
const EYE_SPACING = 0.15;
/** Height of the eyes above the feet — the upper third of the bucket. */
const EYE_HEIGHT = LEG_HEIGHT + BODY_HEIGHT * 0.62;

// Sitting down, on a swing seat. The root stays on the seat and the barrel
// comes down onto it, so what was a leg's length of clearance underneath is
// gone and the legs go out in front instead of under. See sit().
const SEATED_BODY_Y = 0.02;
const SEATED_HIP_Y = 0.1;
/** Thighs forward and a little down, which is where its boots reach from. */
const SEATED_LEG = -1.15;
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

/**
 * When to give up steering it and simply put it back beside you.
 *
 * Following is a steering behaviour and nothing more: walk at the player, hop
 * when something small is in the way. That handles furniture and it cannot
 * handle a wall with a door in it two metres to the left — there is no path
 * finding here to notice the door, and there should not be for one follower.
 *
 * Left alone it presses into that wall until the game ends. It is not academic:
 * coming back out of the store room after the button, it crosses the room, hits
 * the ward's back wall a couple of metres off the open door, and stays there.
 * So "it follows you" quietly stops being true exactly when the room gets
 * interesting.
 *
 * Four seconds of getting nowhere is well past the stuck-hop having tried and
 * failed several times, and six metres is far enough that it is not in the
 * shot. Both have to hold: a bucket wedged against a bed at your feet is in
 * plain sight and should be shoved free by hand, not teleported.
 */
const STRANDED_SECONDS = 4;
const STRANDED_DISTANCE = 6;

/**
 * And the same two numbers again, for when you are being chased.
 *
 * Four seconds and six metres is the right patience for a building you are
 * walking round: the bucket is behind you somewhere, it works the furniture
 * out, and nothing is lost if it takes a moment about it.
 *
 * From the two-body door on there is no moment. You are running at 5.6 and
 * the route is a crate stair, a jumped climb and a lift — three things it
 * cannot do on its legs — so at the walking patience it spends the whole
 * chase arriving twenty-odd metres behind you, which is the same as it not
 * being there. One and a quarter seconds and four metres is near enough that
 * the rescue reads as it catching you up rather than as it reappearing.
 *
 * It is still a rescue and not a leash: it is only ever spent while the
 * thing is getting nowhere, so on open floor, where it keeps up on its own
 * legs at 6.5 against your 5.6, this never fires once.
 */
const URGENT_SECONDS = 1.25;
const URGENT_DISTANCE = 4;
/**
 * And the other way of losing it, which the stuck test cannot see.
 *
 * Everything above fires on the bucket *getting nowhere*. The climb out of
 * the fall is the opposite: eight pads with a jump between each, and it is
 * busy the whole time — hopping, landing, covering ground, resetting the
 * timer on every one of them — while you go up the same eight pads faster
 * than it does. Measured over the run, that put it thirteen metres behind at
 * the top with nothing in the file having noticed anything was wrong.
 *
 * So the second rule is simply being a long way back for long enough,
 * whether or not it is making progress. Six metres and a second and a fifth,
 * which is tuned rather than picked: it has 0.9m/s on you at a run, so from
 * six metres back it needs seven seconds of clear floor to close on its own
 * and the whole chase is seventy. Measured over the route, 8m/1.5s left it
 * eleven metres down at the top of the climb and this leaves it seven, for
 * two more rescues across seventy seconds.
 */
const URGENT_FAR = 6;
const URGENT_FAR_SECONDS = 1.2;
/**
 * And it tucks in closer while it is doing it.
 *
 * 2.6 is a polite distance to be followed at and it is most of a second
 * behind at a run, which is long enough for you to lose it round a corner.
 * 1.5 is at your elbow. It cannot collide with you — the two bodies do not
 * push each other — so the only cost of the shorter radius is that it is in
 * shot, which during a chase is the point.
 */
const URGENT_FOLLOW = 1.5;

/** Hops it may take without getting anywhere before it stops trying. */
const HOPS_BEFORE_GIVING_UP = 3;
/**
 * And how long it stands there before trying again, which the cap above
 * turned out to need.
 *
 * The cap is cleared by covering ground, on the reasoning that a bucket that
 * has got somewhere has earned another three tries. A bucket hopping at a
 * wall covers ground: it comes off the face sideways, half a metre at a
 * time, and that clears the counter and buys it three more — for ever. It
 * was academic until there was somewhere it is *meant* to fail, and then it
 * was fifty-nine clangs during an eleven second lift ride, from a thing that
 * is supposed to be standing behind a rock watching you go.
 *
 * Six seconds, and it is a rest rather than an end. It never gives up on you
 * permanently, which would be a different and worse animal; it just stops
 * being a drum kit about it.
 */
const HOP_REST = 6;

const RECALL_DIR = new THREE.Vector3();
const EYE_FORCE = new THREE.Vector3();
const PUPIL_NORMAL = new THREE.Vector3();
/** Which way a CircleGeometry faces before it is turned. */
const FACE_AXIS = new THREE.Vector3(0, 0, 1);
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
  // creature brings them round to you by turning its whole body.
  //
  // Balls, half sunk into the barrel, rather than discs painted on it. The
  // sclera is lit — a sphere under a flat colour has no shading and reads as
  // the disc it replaced — with just enough emissive that it never goes fully
  // dark in a room that does. The pupil stays unlit and flat black.
  const eyeGroup = new THREE.Group();
  const scleraGeometry = new THREE.SphereGeometry(EYE_RADIUS, 24, 18);
  const pupilGeometry = new THREE.CircleGeometry(PUPIL_RADIUS, 20);
  const scleraMaterial = new THREE.MeshStandardMaterial({
    color: 0xfbfbf7,
    roughness: 0.26,
    metalness: 0,
    emissive: 0x46453f,
  });
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x14110d });
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

    // Sunk a third of its radius into the barrel, so it sits in the bucket
    // rather than balancing on it. No rotation to get right — a sphere has no
    // front, which is also what stops the edges dipping under the surface the
    // way a tilted disc's did.
    const sclera = new THREE.Mesh(scleraGeometry, scleraMaterial);
    sclera.position.set(x, EYE_HEIGHT, surfaceZ - EYE_RADIUS * 0.26);
    sclera.castShadow = true;
    eyeGroup.add(sclera);

    // The pupil lies on the ball and is walked round it every frame, so it
    // slides over the curve instead of sitting on a flat plate in front.
    const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    pupil.position.set(0, 0, EYE_RADIUS + 0.002);
    sclera.add(pupil);

    pupils.push({
      mesh: pupil,
      // Each eye sights from its own centre, so they converge slightly on
      // anything close — the cross-eyed look you get up against a wall.
      origin: new THREE.Vector2(x, EYE_HEIGHT),
      pos: new THREE.Vector2(),
      vel: new THREE.Vector2(),
    });
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
  /** Where the feet were last frame, for telling walking from leaning. */
  let footX = 0;
  let footZ = 0;
  /** Riding something that says where it is. See sit(). */
  let seated = false;

  let driven = false;
  let driveYaw = 0;
  const driveInput = { forward: false, back: false, left: false, right: false, run: false };
  const velocity = new THREE.Vector3();
  const prevVelocity = new THREE.Vector3();

  let active = false;
  let following = false;
  let grounded = false;
  let stuckTimer = 0;
  // Cleared only by actually covering ground, unlike stuckTimer, which a hop
  // resets whether or not the hop achieved anything.
  let strandedTimer = 0;
  let wantsRecall = false;
  // Whether giving up and teleporting to you is on the table at all.
  //
  // It normally is: a bucket wedged behind the machine forever is worse than a
  // bucket that appears behind you. But there are rooms built entirely out of
  // it not being able to reach you — the red hall is two lanes with a wall down
  // the middle — and in those, "give up and go to the player" is not a rescue,
  // it is the puzzle solving itself.
  let recallAllowed = true;
  /** Chase rules: closer, and quicker to give up and catch up. See URGENT_*. */
  let urgent = false;
  /** How long it has been a long way back, which is the other way to lose it. */
  let farTimer = 0;
  /**
   * How close it tries to get to whatever it is following.
   *
   * Normally the constant: two and a half metres behind you is out of your way
   * and still obviously with you. The red hall sets it much shorter, because
   * there it is not following *you* — it is following a point in its own lane
   * beside you, and the two lanes are only 2.8m apart. At the usual radius it
   * would count itself as having arrived while still standing in your lane,
   * which is the one place the whole room needs it not to be.
   */
  // Hops taken since it last covered any ground. Cleared by moving, not by
  // hopping, or it would never reach the cap.
  let hopsSinceProgress = 0;
  /** Seconds left of standing there before it tries again. See HOP_REST. */
  let hopRest = 0;
  // Where it was last frame, for measuring ground covered rather than intent.
  let lastX = 0;
  let lastZ = 0;
  let yaw = 0;
  let walkPhase = 0;

  // position is the feet, so the ground is simply y = 0 plus whatever it is
  // standing on. R is its footprint for pushing out of props.
  const R = BODY_RADIUS;

  /**
   * This body, as collision.js wants it.
   *
   * The three queries live there now. They used to live here and in player.js
   * both, as copies this file's comments promised to keep in step with that
   * one by hand — which worked for two of them. See collision.js.
   */
  const BODY = {
    kind: collision.FRIEND,
    radius: R,
    height: FRIEND_HEIGHT,
    stepHeight: STEP_HEIGHT,
  };

  /** Scratch, so the per-frame queries do not allocate. */
  const probe = { x: 0, z: 0, feetY: 0, grounded: false, previousFeetY: 0, previousHeadY: 0 };

  const at = (previousFeetY, previousHeadY) => {
    probe.x = position.x;
    probe.z = position.z;
    probe.feetY = position.y;
    probe.grounded = grounded;
    probe.previousFeetY = previousFeetY ?? position.y;
    probe.previousHeadY = previousHeadY ?? position.y + FRIEND_HEIGHT;
    return probe;
  };

  function resolveCollisions(colliders) {
    // No room clamp — the shell is wall colliders now, so it can follow you
    // through the doorway.
    const spot = at();
    collision.pushOut(colliders, BODY, spot);
    position.x = spot.x;
    position.z = spot.z;
  }

  function supportHeight(colliders, previousFeetY) {
    return collision.supportHeight(colliders, BODY, at(previousFeetY));
  }

  function ceilingHeight(colliders, previousHeadY) {
    return collision.ceilingHeight(colliders, BODY, at(undefined, previousHeadY));
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
   * Undo sit(): upright, legs back under it, eyes back up the barrel.
   *
   * Called both when whatever was carrying it puts it down and by spawn(), so
   * a bucket teleported off a swing by anything else in the game cannot end up
   * walking around the building in a sitting position.
   */
  function standUp() {
    if (!seated) return;
    seated = false;
    mesh.rotation.set(0, yaw, 0);
    body.position.y = LEG_HEIGHT;
    eyeGroup.position.y = 0;
    for (const hip of legs) {
      hip.position.y = LEG_HEIGHT;
      hip.rotation.x = 0;
    }
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

    // Ground actually covered since the last frame, which is not the same thing
    // as `speed` and is the only one of the two that can tell you it is stuck.
    // resolveCollisions corrects position and never touches velocity, so a
    // bucket jammed against a wall goes on accelerating into it and reports a
    // brisk 6.5 m/s for ever while not moving at all. The stuck-hop has been
    // testing the wrong number since it was written; it fired against things it
    // was only leaning on, and never against a wall it was square-on to.
    const covered = delta > 0 ? Math.hypot(position.x - lastX, position.z - lastZ) / delta : 0;
    lastX = position.x;
    lastZ = position.z;

    const stopAt = urgent ? URGENT_FOLLOW : FOLLOW_DISTANCE;
    if (distance <= stopAt) {
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
    const approach = Math.min(1, (distance - stopAt) / 1.5);
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
    //
    // The second timer runs on the same test but is never cleared by hopping —
    // only by actually getting somewhere. That is the difference between "there
    // is a lip here" and "this is not working", and it is the second one that
    // decides whether to give up and recall it.
    if (covered < 0.4) {
      stuckTimer += delta;
      strandedTimer += delta;
    } else {
      stuckTimer = 0;
      strandedTimer = 0;
      hopsSinceProgress = 0;
    }
    const patience = urgent ? URGENT_SECONDS : STRANDED_SECONDS;
    const leash = urgent ? URGENT_DISTANCE : STRANDED_DISTANCE;
    if (recallAllowed && strandedTimer > patience && distance > leash) {
      wantsRecall = true;
    }
    // See URGENT_FAR. Only while being chased: walking round the building,
    // a bucket six metres back and working on it is a bucket following you,
    // and teleporting that one would be answering a question nobody asked.
    if (urgent && distance > URGENT_FAR) farTimer += delta;
    else farTimer = 0;
    if (recallAllowed && farTimer > URGENT_FAR_SECONDS) wantsRecall = true;

    // The hop is for a lip it can clear. Capped, because when it cannot clear
    // the thing in front of it the hop changes nothing and the next one is due
    // 0.7s later, for ever — a bucket standing still and jumping on the spot
    // until you come back for it. Three tries is enough for anything a hop was
    // going to fix; after that it waits, and only covering ground earns it the
    // right to try again.
    hopRest = Math.max(0, hopRest - delta);
    if (stuckTimer > 0.7 && grounded && hopRest <= 0) {
      velocity.y = HOP_IMPULSE;
      stuckTimer = 0;
      hopsSinceProgress++;
      if (hopsSinceProgress >= HOPS_BEFORE_GIVING_UP) {
        hopsSinceProgress = 0;
        hopRest = HOP_REST;
      }
      // Same sound as a jump you asked for. Without this a following bucket
      // hops in silence and then thumps on the way down, which reads as the
      // landing having come from nowhere.
      grounded = false;
      playBucketJump(listenerLevel);
    }
  }

  /** Would a bucket standing here be inside something? Same rules as resolveCollisions. */
  function blockedAt(x, z, feetY, colliders) {
    for (const box of colliders) {
      if (box.enabled?.() === false) continue;
      if (feetY >= (box.top ?? Infinity) - 0.02) continue;
      if (FRIEND_HEIGHT <= (box.passHeight ?? -Infinity)) continue;
      if (feetY + FRIEND_HEIGHT <= (box.bottom ?? -Infinity)) continue;
      if (x > box.minX - R && x < box.maxX + R && z > box.minZ - R && z < box.maxZ + R) return true;
    }
    return false;
  }

  /**
   * The spot to put it in, given where you are standing and which way you
   * are looking.
   *
   * Behind you by preference, so it does not pop into view in front of you —
   * you turn round and it is there, which is how a thing that has been trailing
   * you ought to appear. Then either side, and last your own feet, which need
   * no check at all because you are standing in them.
   */
  function placeNear(atX, feetY, atZ, dirX, dirZ, colliders) {
    const reach = FOLLOW_DISTANCE * 0.5;

    let x = atX;
    let z = atZ;
    for (const [ox, oz] of [
      [-dirX, -dirZ],
      [-dirZ, dirX],
      [dirZ, -dirX],
    ]) {
      const cx = atX + ox * reach;
      const cz = atZ + oz * reach;
      if (!blockedAt(cx, cz, feetY, colliders)) {
        x = cx;
        z = cz;
        break;
      }
    }

    position.set(x, feetY, z);
    velocity.set(0, 0, 0);
    stuckTimer = 0;
    strandedTimer = 0;
    farTimer = 0;
    hopsSinceProgress = 0;
  }

  /** Put it back beside you, having failed to walk there. */
  function recall(targetPosition, camera, colliders) {
    RECALL_DIR.set(0, 0, -1).applyQuaternion(camera.quaternion);
    RECALL_DIR.y = 0;
    if (RECALL_DIR.lengthSq() < 1e-6) RECALL_DIR.set(0, 0, -1);
    RECALL_DIR.normalize();

    // Feet, not eyes — targetPosition is the camera. A shade above the floor so
    // it settles through the normal ground test rather than starting inside it.
    const feetY = Math.max(0, targetPosition.y - PLAYER.eyeHeight) + 0.05;
    placeNear(targetPosition.x, feetY, targetPosition.z, RECALL_DIR.x, RECALL_DIR.z, colliders);
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
        ty = (ey / off) * PUPIL_TRAVEL * amount;
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

      // Onto the surface of the ball: the depth follows from how far across
      // it has travelled, and the disc is turned to lie flat against it.
      const lateral = Math.hypot(pupil.pos.x, pupil.pos.y);
      const depth = Math.sqrt(Math.max(EYE_RADIUS * EYE_RADIUS - lateral * lateral, 1e-4));
      pupil.mesh.position.set(pupil.pos.x, pupil.pos.y, depth + 0.002);
      PUPIL_NORMAL.set(pupil.pos.x, pupil.pos.y, depth).normalize();
      pupil.mesh.quaternion.setFromUnitVectors(FACE_AXIS, PUPIL_NORMAL);
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
      standUp();
      // A bucket that has just been put somewhere new has not been getting
      // nowhere there. Carrying the old counters over meant one that had given
      // up hopping stayed given up after being respawned across the level.
      stuckTimer = 0;
      strandedTimer = 0;
      farTimer = 0;
      hopsSinceProgress = 0;
      wantsRecall = false;
      lastX = at.x;
      lastZ = at.z;
      position.copy(at);
      velocity.copy(initialVelocity ?? new THREE.Vector3());
      prevVelocity.copy(velocity);
      mesh.position.copy(position);
      mesh.visible = true;
    },

    /**
     * Alive, at your shoulder, and already following — wherever you have
     * just been put.
     *
     * For the two ways of arriving somewhere without having walked there: a
     * scene jump and every death in the chase. `spawn` is the wrong verb for
     * those. It drops the bucket at exactly the coordinates it is handed and
     * leaves it waiting there, and the coordinates those callers have are
     * your own feet, so what it makes is a bucket standing inside you not
     * following you.
     *
     * Feet and a yaw rather than a camera, because both callers have just
     * teleported the player and the camera does not catch up with that until
     * the next frame — handed the camera, this would put the bucket neatly
     * behind wherever you were standing before.
     */
    arriveWith(feet, lookYaw, colliders) {
      active = true;
      standUp();
      hopsSinceProgress = 0;
      wantsRecall = false;
      lastX = feet.x;
      lastZ = feet.z;
      // yaw 0 faces -z, so forward is (-sin, -cos) and placeNear puts it at
      // the other end of that.
      placeNear(feet.x, feet.y + 0.05, feet.z, -Math.sin(lookYaw), -Math.cos(lookYaw), colliders);
      prevVelocity.copy(velocity);
      mesh.position.copy(position);
      mesh.visible = true;
      following = true;
    },

    /** Start trailing the player. Same clean slate as being told to follow. */
    /**
     * Never made, for a game being started over.
     *
     * The inverse of `spawn`, and the only thing in here that takes the
     * bucket out of the world rather than moving it: before the machine has
     * run there is no friend, and a restart that leaves one standing in the
     * first room is a restart you cannot play — the machine has nothing to
     * deliver and you already have what it would have delivered.
     */
    retire() {
      active = false;
      following = false;
      seated = false;
      mesh.visible = false;
    },

    collect() {
      following = true;
      stuckTimer = 0;
      strandedTimer = 0;
      farTimer = 0;
      hopsSinceProgress = 0;
      wantsRecall = false;
    },

    /**
     * Told to wait, or told to come along. The same switch either way, so the
     * two can never disagree about which it is.
     *
     * Clearing the timers on the way back in matters: they are how long it has
     * been getting nowhere, and a bucket that has stood still for a minute
     * because you asked it to has been getting nowhere the whole time. Without
     * this it would be recalled to your feet on the first frame after you told
     * it to follow again, from wherever it had been waiting.
     */
    setFollowing(on) {
      following = on;
      stuckTimer = 0;
      strandedTimer = 0;
      farTimer = 0;
      hopsSinceProgress = 0;
      wantsRecall = false;
    },

    /**
     * Keep up, or take your time.
     *
     * On from the two-body door to the window, which is the one stretch of
     * this game where being left behind is not recoverable: it closes to
     * your elbow instead of two and a half metres back, and it gives up on
     * walking after a second and a quarter rather than four. See URGENT_*.
     */
    keepUp(on) {
      urgent = on;
    },

    /** See recallAllowed. Set every frame from wherever it is standing. */
    setRecallAllowed(on) {
      recallAllowed = on;
      if (!on) wantsRecall = false;
    },

    get isDriven() {
      return driven;
    },

    /** Whether its feet are on something. Jumping only works when they are. */
    get isGrounded() {
      return grounded;
    },

    /**
     * Where the camera sits when you are inside it — its own eye line, measured
     * from wherever the body has been put. Sitting down drops it by the legs
     * it is no longer standing on, so the view is at the eyes rather than a
     * foot above the barrel they are stuck to.
     */
    get eyeHeight() {
      return seated ? EYE_HEIGHT - LEG_HEIGHT + SEATED_BODY_Y : EYE_HEIGHT;
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
      // `following` is deliberately left alone. Taking control used to clear
      // it, so letting go parked the bucket wherever you had driven it and you
      // walked off without it. It trails you again the moment you step out —
      // update() checks `driven` first, so the flag simply sits there unused
      // while you are inside it.
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

    /**
     * Sit it on something that carries it — the swings in the orange room.
     *
     * `at` is the seat, `lean` is how far that seat is tilted, and `facing` is
     * the way the thing is travelling. Called every frame by whatever is doing
     * the carrying, and it is the last word on where this body is: while it is
     * seated update() stops simulating, because a bucket that keeps falling and
     * colliding while something else decides where it is spends the whole ride
     * being caught and put back.
     *
     * The barrel is dropped so it rests on the seat rather than standing a
     * leg's length above it, and the legs come out in front — which is both how
     * anything sits down and, at the top of the arc, what puts its boots on the
     * button it is aimed at. The eyes go down with the barrel: they hang off the
     * root rather than off the body, so nothing else would move them.
     */
    sit(at, lean, facing = 0) {
      seated = true;
      following = false;
      position.copy(at);
      velocity.set(0, 0, 0);
      prevVelocity.set(0, 0, 0);
      yaw = facing;
      mesh.position.copy(at);
      // rotation.x is the outermost turn in the default XYZ order, so this is a
      // tilt about the world axis applied to an already-yawed body — and it is
      // about the root, which is sitting on the seat, so the body pivots where
      // it is resting rather than swinging off the plank.
      mesh.rotation.set(lean, facing, 0);
      body.position.y = SEATED_BODY_Y;
      eyeGroup.position.y = SEATED_BODY_Y - LEG_HEIGHT;
      for (const hip of legs) {
        hip.position.y = SEATED_HIP_Y;
        hip.rotation.x = SEATED_LEG;
      }
    },

    /** Back on its feet, wherever it has been left. */
    stand() {
      standUp();
    },

    get isSeated() {
      return seated;
    },

    /** How far it is leaning, for whoever is looking out of it. */
    get lean() {
      return seated ? mesh.rotation.x : 0;
    },

    jump() {
      if (!grounded) return;
      velocity.y = DRIVE_JUMP;
      grounded = false;
      playBucketJump(listenerLevel);
    },

    update(delta, camera, targetPosition, colliders) {
      if (!active) return;

      // Sitting on something. Everything below this decides where the body goes
      // on its own, and none of it is welcome on a swing — see sit(). The eyes
      // still work, so it watches you go past.
      if (seated) {
        const seatedRange = camera.position.distanceTo(position) / 4;
        listenerLevel = 1 / (1 + seatedRange * seatedRange);
        if (!driven) updateEyes(delta, camera);
        return;
      }

      if (driven) drive(delta);
      else if (following) follow(delta, targetPosition);

      // Steering has given up. Done here rather than inside follow() so the
      // move happens before this frame's gravity and collision run on it,
      // which is what settles it onto the floor wherever it has been put.
      if (wantsRecall) {
        wantsRecall = false;
        farTimer = 0;
        recall(targetPosition, camera, colliders);
      }

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

      /**
       * What the feet are actually doing, which is not what `speed` says.
       *
       * resolveCollisions corrects the position and never touches the
       * velocity, so a bucket leaning on a wall goes on accelerating into it
       * and reports a brisk 6.5m/s while standing still. The legs can keep
       * swinging on that — it is trying, and a bucket pressed against rock
       * with its legs still should read as broken — but the sound cannot:
       * `speed` alone had it walking on the spot, two steps a second,
       * audibly, for as long as whatever it was leaning on was there.
       */
      const went = delta > 0 ? Math.hypot(position.x - footX, position.z - footZ) / delta : 0;
      footX = position.x;
      footZ = position.z;

      // A foot plants at each half cycle of the gait, so the step lands with
      // the leg you can watch going down rather than on a clock of its own.
      //
      // With a floor on the interval — see STEP_MIN_GAP.
      stepCooldown -= delta;
      const step = Math.floor(walkPhase / Math.PI);
      if (step !== lastStep) {
        lastStep = step;
        if (grounded && speed > 0.5 && went > 0.5 && stepCooldown <= 0) {
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
