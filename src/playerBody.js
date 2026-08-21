import * as THREE from 'three';
import { DOOR, LAYER, PLAYER } from './config.js';

/**
 * The player's body — built solely to cast a shadow.
 *
 * In first person there is nothing in the world where the player is standing,
 * so they throw no shadow and read as a floating camera the moment they walk
 * past a light. This is an ordinary jointed figure that follows the player and
 * is drawn only into the shadow map.
 *
 * It is invisible rather than absent: `colorWrite: false` keeps it out of the
 * colour buffer while leaving it a normal shadow caster. Hiding it with
 * `visible = false` would not work — three skips invisible objects when
 * rendering shadows too, and the shadow would go with it.
 */

const SHOULDER = 1.42;
const HIP = 0.92;

// Sitting down. The thighs come forward and a little under the horizontal, the
// shins hang back down off the knee, and the arms drop to the ropes. SEAT_SINK
// is how far the hips settle into the plank rather than balancing on top of it.
const SEAT_THIGH = -1.35;
const SEAT_SHIN = 1.0;
const SEAT_ARM = -0.32;
const SEAT_SINK = 0.06;

function limb(radius, length, material) {
  const joint = new THREE.Group();
  const bone = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
  bone.position.y = -length / 2 - radius;
  bone.castShadow = true;
  joint.add(bone);
  return joint;
}

export function createPlayerBody(scene) {
  const group = new THREE.Group();

  // Writes depth and colour nowhere, but still casts. The colour and roughness
  // only matter when possession turns it on — you stepped out of this body and
  // can walk round and look at it.
  const material = new THREE.MeshStandardMaterial({
    color: '#3a3d44',
    roughness: 0.88,
    colorWrite: false,
    depthWrite: false,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), material);
  head.position.y = 1.58;
  head.castShadow = true;
  group.add(head);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 4, 12), material);
  torso.position.y = 1.2;
  torso.scale.set(1.25, 1, 0.72);
  torso.castShadow = true;
  group.add(torso);

  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.1, 4, 10), material);
  hips.position.y = 0.98;
  hips.scale.set(1.15, 1, 0.75);
  hips.castShadow = true;
  group.add(hips);

  const arms = [];
  const legs = [];

  for (const side of [-1, 1]) {
    const arm = limb(0.055, 0.34, material);
    arm.position.set(side * 0.24, SHOULDER, 0);
    group.add(arm);
    // Forearm hangs off the upper arm, so the whole limb swings from the
    // shoulder and bends at the elbow.
    const forearm = limb(0.05, 0.3, material);
    forearm.position.y = -0.45;
    arm.add(forearm);
    arms.push({ upper: arm, lower: forearm, side });

    const leg = limb(0.075, 0.38, material);
    leg.position.set(side * 0.11, HIP, 0);
    group.add(leg);
    const shin = limb(0.065, 0.36, material);
    shin.position.y = -0.5;
    leg.add(shin);
    legs.push({ upper: leg, lower: shin, side });
  }

  scene.add(group);

  let phase = 0;
  let layer = null;
  /** Null, or { lean, yaw } while it is sitting on something. See setSeated. */
  let seated = null;
  // Held while you are driving something else. The look is shared between both
  // bodies, so without this your own body pirouettes on the spot as you look
  // around from inside the bucket.
  let heldYaw = null;

  return {
    group,

    /** Show the body you left behind, facing the way you were when you left. */
    setVisible(on, yaw = null) {
      material.colorWrite = on;
      material.depthWrite = on;
      heldYaw = on ? yaw : null;
    },

    /**
     * Sit it down on something that moves, or stand it back up with null.
     *
     * `lean` is how far that thing is tilted and `yaw` is the way it travels —
     * a body on a swing faces along the arc, not wherever you happened to be
     * looking when you stepped out of it.
     *
     * This matters more here than it looks: the one place in the game you sit
     * down is the swing puzzle, and the whole point of that puzzle is that you
     * leave your body swinging and watch it from across the room through the
     * bucket's eyes. A body standing to attention on a plank at forty degrees
     * is the thing you would be looking at.
     */
    setSeated(at) {
      seated = at;
    },

    update(delta, pose) {
      // Sitting: the hips go on the seat, not the feet, so the figure rests on
      // the plank instead of hovering a leg's length above it.
      //
      // The root is still at the feet and the lean turns about the root, so the
      // root has to be placed a hip's height back *along the body's own axis*
      // rather than straight down — put it straight down and the hips swing
      // clear of the plank as the swing tilts, three quarters of a metre off it
      // at the top of the arc. What is left over is SEAT_SINK, which settles
      // the figure into the seat rather than balancing it on top.
      if (seated) {
        const drop = HIP + SEAT_SINK;
        group.position.set(
          pose.x,
          pose.y - Math.cos(seated.lean) * drop,
          pose.z - Math.sin(seated.lean) * drop
        );
      } else {
        group.position.set(pose.x, pose.y, pose.z);
      }
      // Yaw only, standing — the body stays upright however far up or down you
      // look. Seated, rotation.x is the outer turn of the default XYZ order, so
      // it leans the already-yawed body about the world axis.
      group.rotation.set(seated ? seated.lean : 0, seated ? seated.yaw : heldYaw ?? pose.yaw, 0);

      if (seated) {
        for (const { upper, lower } of legs) {
          upper.rotation.x = SEAT_THIGH;
          lower.rotation.x = SEAT_SHIN;
        }
        for (const { upper, lower } of arms) {
          // Hands down on the ropes, which are either side of the hips.
          upper.rotation.x = SEAT_ARM;
          lower.rotation.x = 0.55;
        }
      } else {
        // Gait is driven by distance covered, the same as the footstep cadence,
        // so the shadow's stride matches the sound.
        const moving = pose.grounded && pose.speed > 0.4;
        phase += moving ? pose.speed * delta * 3.4 : 0;

        const swing = moving ? Math.min(1, pose.speed / PLAYER.runSpeed) * 0.85 : 0;
        const rest = moving ? 0 : 0.08;

        for (const { upper, lower, side } of arms) {
          upper.rotation.x = Math.sin(phase) * swing * side;
          lower.rotation.x = Math.max(0, -Math.sin(phase) * side) * swing * 0.7 + rest;
        }
        for (const { upper, lower, side } of legs) {
          upper.rotation.x = -Math.sin(phase) * swing * side;
          // Knees only bend one way.
          lower.rotation.x = Math.max(0, Math.sin(phase) * side) * swing * 0.9;
        }

        // Airborne: tuck up rather than keep marching.
        if (!pose.grounded) {
          for (const { upper, lower } of legs) {
            upper.rotation.x = -0.5;
            lower.rotation.x = 0.9;
          }
        }
      }

      // Same pass as the room it is standing in, or the shadow-casting light
      // there will not see it.
      const next = pose.z < DOOR.z ? LAYER.DARK : LAYER.MAIN;
      if (next !== layer) {
        layer = next;
        group.traverse((object) => object.layers.set(next));
      }
    },
  };
}
