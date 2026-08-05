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

    update(delta, pose) {
      group.position.set(pose.x, pose.y, pose.z);
      // Yaw only. The body stands upright however far up or down you look.
      group.rotation.y = heldYaw ?? pose.yaw;

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
