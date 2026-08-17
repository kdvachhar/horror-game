import * as THREE from 'three';
import { buildHand } from './glove.js';

/**
 * The arms.
 *
 * They belong to the thing on the screen and not to the room it is in — the
 * drawing has them coming out of the wall either side of the television and not
 * attached to it, which is the unsettling part, and it is the same wherever the
 * television turns up. So they live here with it rather than in the ward, which
 * is where they were built when the ward was the only place it appeared.
 *
 * Everything below is in the wall's own frame: +z out of the wall into the room,
 * +x along it, y from the floor. `createWallArms` is given where that wall is
 * and which way it faces, which is what lets the same pair hang off a wall
 * facing down the ward and a wall facing back up the red hall.
 */

function armMaterial(color, roughness = 0.55) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

/**
 * One arm: a ribbed conduit out of a ring set into the wall, bent at the elbow,
 * ending in a gloved hand. The drawing shows the arms detached from the
 * television entirely, which is the unsettling part — so they are separate
 * objects here too, not children of it.
 *
 * The hose follows an explicit curve rather than a chain of relative bends. A
 * chain compounds: a small turn per segment became two radians over fourteen of
 * them, and the arms coiled up against the wall instead of reaching out.
 */
function buildWallArm(shape) {
  const group = new THREE.Group();

  const port = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.09, 10, 22),
    armMaterial('#5d5f5e', 0.6)
  );
  port.castShadow = true;
  group.add(port);

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20),
    armMaterial('#1a1c1e', 0.9)
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.z = -0.1;
  group.add(socket);

  // Everything past the wall fitting hangs off this, so the arm can sway
  // without dragging the port ring around in the plaster with it.
  const limb = new THREE.Group();
  group.add(limb);

  // Two shapes for the same arm: how it hangs, and how it folds. The conduit
  // is rebuilt between them rather than swung about the port, because folding
  // these arms is not a rotation — each one hooks down and back up, and no
  // amount of turning a straight-ish tube produces that.
  const restPoints = shape.path.map((p) => new THREE.Vector3(...p));
  const foldPoints = shape.cross.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(restPoints.map((p) => p.clone()));

  // Built as a chain of links rather than one baked TubeGeometry, so the shape
  // can change at all. A tube is welded at build time; these are just meshes
  // walked onto wherever the curve happens to be this frame.
  const ribMaterial = armMaterial('#a3a49e', 0.5);
  const coreMaterial = armMaterial('#6e6f6a', 0.75);
  const ribGeometry = new THREE.TorusGeometry(0.15, 0.042, 8, 16);
  // A shade longer than the spacing, so consecutive pieces overlap and read as
  // one continuous hose instead of a stack of separate cans.
  const coreGeometry = new THREE.CylinderGeometry(0.115, 0.115, 0.17, 12);

  const steps = Math.round(curve.getLength() / 0.13);
  const axis = new THREE.Vector3(0, 0, 1);
  const links = [];
  for (let i = 0; i <= steps; i++) {
    const rib = new THREE.Mesh(ribGeometry, ribMaterial);
    rib.castShadow = true;
    limb.add(rib);

    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.x = Math.PI / 2;
    core.castShadow = true;
    const carrier = new THREE.Group();
    carrier.add(core);
    limb.add(carrier);

    links.push({ rib, carrier, t: i / steps });
  }

  // Wrist: a collar where the conduit ends and the glove begins.
  const wrist = new THREE.Group();
  limb.add(wrist);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.185, 0.2, 18),
    armMaterial('#9a9a95', 0.6)
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.04;
  wrist.add(collar);

  // The glove is built with its fingers running up +Y, so a quarter turn about
  // X sends them on down the conduit instead of back into the wall.
  //
  // The order matters and is not the default. `roll` is a twist of the wrist
  // about the arm's own axis, which means it has to be applied *after* that
  // quarter turn. Euler XYZ composes the Z rotation innermost, so it was being
  // applied first — swinging the fingers off the arm sideways instead of
  // rotating the palm around it. ZYX puts the X turn first and the roll last.
  const { group: hand, fingers } = buildHand({ withArm: false });
  hand.scale.setScalar(0.44);
  hand.rotation.set(Math.PI / 2, 0, shape.roll, 'ZYX');

  // The glove's origin is the middle of its palm, not its wrist — the cuff rim
  // sits well behind it. Measure how far back, and push the hand forward by
  // that much, so the rim lands on the end of the conduit rather than the palm
  // doing. Measured rather than hardcoded: the glove is shared with the
  // cutscene and can be reshaped there.
  hand.updateMatrixWorld(true);
  const back = new THREE.Box3().setFromObject(hand).min.z;
  hand.position.z = -back - 0.08;

  // `bend` then has to pivot about that rim and not about the palm. Rotating
  // the hand itself swung the cuff off the end of the arm by more than the
  // collar is wide, which is what left the hands floating unattached.
  const joint = new THREE.Group();
  joint.rotation.x = shape.bend;
  joint.add(hand);
  wrist.add(joint);

  // The hands are still. Set once here rather than animated, so the movement
  // in these arms is all in the arm — the glove is carried by the conduit and
  // does nothing of its own. Barely curled, so the fingers stay spread the way
  // they are drawn.
  for (const finger of fingers) {
    for (const knuckle of finger.joints) knuckle.rotation.x = 0.1;
  }

  /**
   * Reshape the arm somewhere between hanging (0) and folded (1), and pull it
   * back into the wall by `retract`.
   *
   * Blends the curve's control points, then walks every link onto the result.
   * Called only when either amount has actually moved, since it costs a couple
   * of hundred curve evaluations and sits still almost all of the time.
   */
  function poseAt(amount, retract = 0) {
    for (let i = 0; i < curve.points.length; i++) {
      curve.points[i].lerpVectors(restPoints[i], foldPoints[i], amount);
      // Drawn back toward the port it came out of. Never all the way — a curve
      // with no length has no tangent, and every rib on it would face nowhere.
      if (retract > 0) curve.points[i].multiplyScalar(1 - Math.min(retract, 0.96));
    }
    // The arc-length table is what makes getPointAt evenly spaced, and it is
    // cached — without this the ribs bunch up wherever the curve just tightened.
    curve.updateArcLengths();

    for (const link of links) {
      const at = curve.getPointAt(link.t);
      const along = curve.getTangentAt(link.t);
      link.rib.position.copy(at);
      link.rib.quaternion.setFromUnitVectors(axis, along);
      link.carrier.position.copy(at);
      link.carrier.quaternion.copy(link.rib.quaternion);
    }

    wrist.position.copy(curve.getPointAt(1));
    wrist.quaternion.setFromUnitVectors(axis, curve.getTangentAt(1));
  }
  poseAt(0);

  return { group, limb, joint, fingers, curve, poseAt };
}

// Straight from the drawing: one arm low with the hand open and spread, the
// other bent up at the elbow with the hand raised.
const ARMS = [
  {
    port: [-2.9, 1.25],
    path: [[0, 0, 0], [0, -0.05, 0.8], [0.36, -0.24, 1.7], [0.8, -0.3, 2.7]],
    // Folded: out of the wall, dropping into a deep hook and sweeping across
    // to the far side. The whole fold stays under the screen's bottom edge —
    // crossing them over the face buries the mouth exactly when it is talking.
    // This is the lower of the two, so the other can pass above it.
    cross: [[0, 0, 0], [0.2, -0.75, 0.75], [1.55, -0.85, 1.1], [2.9, -0.75, 0.85]],
    // Fingers carry on down the line of the conduit — `bend` is only a small
    // correction now, since each arm's tangent already points into the room.
    bend: -0.1,
    roll: 3.0,
  },
  {
    port: [2.9, 1.55],
    path: [[0, 0, 0], [0, 0.07, 0.85], [-0.38, 0.4, 1.7], [-0.8, 0.82, 2.5]],
    // Folded: down off its higher port, over the top of the other one and on
    // to the far side — the hump in the drawing, kept below the screen.
    cross: [[0, 0, 0], [-0.3, -0.6, 0.8], [-1.6, -0.75, 1.15], [-2.9, -0.7, 0.9]],
    bend: 0.34,
    roll: -2.8,
  },
];


/**
 * A pair of them on a wall, their colliders, and everything they do.
 *
 * `parent` must be a group whose world transform is exactly `origin` and `yaw`
 * — the arms are placed in the wall's frame and the same two numbers are what
 * the colliders are worked out from, so if the two disagree you get boxes in
 * one place and conduits in another.
 *
 * The state is in here rather than in the caller because it is the character's
 * state, not the room's: whether it is talking, whether this line is one it
 * folds its arms on, and whether it has gone dark and taken them back.
 */
export function createWallArms({
  parent,
  colliders,
  origin,
  yaw = 0,
  wallOffset = 0.12,
  // Whether they start inside the wall. The ward's are already out when you
  // wake up under them; the pair at the end of the red hall come out when the
  // thing wakes, and starting them out and easing them in would show a second
  // of arms sliding backwards into the plaster on the first frame you see them.
  startRetracted = false,
} = {}) {
  const arms = [];
  for (const shape of ARMS) {
    const arm = buildWallArm(shape);
    arm.group.position.set(shape.port[0], shape.port[1], wallOffset);
    parent.add(arm.group);
    arms.push(arm);
  }

  /**
   * The arms, as a chain of boxes stepped along each conduit's curve.
   *
   * A single box per arm would be a bad fit — they run diagonally out of the
   * wall and one of them climbs. Stepping along the curve follows the shape,
   * and lets each step be dropped when it is overhead: a collider has no
   * underside, so a box under the raised arm's far end would be an invisible
   * wall in open floor where you can plainly see daylight beneath it.
   */
  // Measured off the player's own height: eye line 1.68 plus a little skull.
  // A step is kept when its underside is at or below this, because that is what
  // you would actually walk into.
  const HEAD_CLEARANCE = 1.85;
  const armBoxes = [];
  for (const arm of arms) {
    const steps = Math.max(2, Math.round(arm.curve.getLength() / 0.34));
    for (let i = 0; i <= steps; i++) {
      // The glove on the end is wider than the hose behind it.
      const half = i / steps > 0.86 ? 0.28 : 0.19;
      const box = {
        minX: 0,
        maxX: 0,
        minZ: 0,
        maxZ: 0,
        y: 0,
        // These boxes have no underside, so a step that has swung up over your
        // head has to switch itself off rather than stand as a wall in open
        // floor. It is a gate now rather than a one-time cull, because the arm
        // moves and a step's height is no longer fixed.
        enabled: () => box.y - half <= HEAD_CLEARANCE,
      };
      armBoxes.push({ box, arm, half, t: i / steps });
      colliders.push(box);
    }
  }

  const UP = new THREE.Vector3(0, 1, 0);
  const POINT = new THREE.Vector3();

  /**
   * Walk the colliders onto where the arms actually are this frame.
   *
   * Without this the boxes stay on the resting curve while the arm gestures
   * away from it, and you bump into empty air or reach through the glove. The
   * limb only ever rotates and everything above it is a translation, so a world
   * position is the rotated local point turned into the room's frame — no need
   * to force a matrix update through a whole room every frame to get it.
   */
  function updateColliders() {
    for (const { box, arm, half, t } of armBoxes) {
      // Read off the live curve, not a cached point — the conduit changes
      // shape when it folds, so where a step *is* is not fixed either.
      POINT.copy(arm.curve.getPointAt(t)).applyQuaternion(arm.limb.quaternion);
      POINT.add(arm.group.position).applyAxisAngle(UP, yaw);
      box.minX = origin.x + POINT.x - half;
      box.maxX = origin.x + POINT.x + half;
      box.minZ = origin.z + POINT.z - half;
      box.maxZ = origin.z + POINT.z + half;
      box.y = POINT.y;
    }
  }
  updateColliders();

  let time = 0;
  // How much it is gesturing.
  let talking = 0;
  // 0 is arms out, 1 is folded across in front of it, and `posed` is the amount
  // the conduits were last actually rebuilt at.
  let crossed = 0;
  let posed = 0;
  let retracted = startRetracted ? 1 : 0;
  let retractedPosed = retracted;
  if (retracted > 0) {
    for (const arm of arms) {
      arm.poseAt(0, retracted);
      arm.limb.visible = retracted < 0.94;
    }
    updateColliders();
  }

  return {
    arms,
    updateColliders,

    /** Dev handle: every collider step, in world space. */
    samples() {
      return armBoxes.map(({ box, half }) => ({
        x: (box.minX + box.maxX) / 2,
        z: (box.minZ + box.maxZ) / 2,
        y: box.y,
        half,
      }));
    },
    /** Dev handle: what the pair are doing right now. */
    get gesture() {
      return {
        talking: +talking.toFixed(2),
        crossed: +crossed.toFixed(2),
        retracted: +retracted.toFixed(2),
        tips: arms.map((arm) => {
          POINT.copy(arm.curve.getPointAt(1)).applyQuaternion(arm.limb.quaternion);
          POINT.add(arm.group.position).applyAxisAngle(UP, yaw);
          return +(origin.x + POINT.x).toFixed(2);
        }),
        wristX: +arms[0].joint.rotation.x.toFixed(2),
        wristZ: +arms[0].joint.rotation.z.toFixed(2),
        limbY: +arms[0].limb.rotation.y.toFixed(3),
        curl: +arms[0].fingers[0].joints[0].rotation.x.toFixed(2),
      };
    },

    /**
     * @param speaking whether it is talking right now — the arms move with it.
     * @param cross whether this line is one it folds its arms on.
     * @param retract whether it has gone dark and is taking them back.
     */
    update(delta, { speaking = false, cross = false, retract = false } = {}) {
      time += delta;

      // The arms move; the hands on the end of them do not. Everything below
      // is a movement of the conduit, and the glove is only carried by it.
      talking += ((speaking ? 1 : 0) - talking) * (1 - Math.exp(-4.5 * delta));

      // Folded across itself on the lines that call for it. Slow — it is a
      // deliberate, self-satisfied movement, not a flinch.
      crossed += ((cross ? 1 : 0) - crossed) * (1 - Math.exp(-3 * delta));
      retracted += ((retract ? 1 : 0) - retracted) * (1 - Math.exp(-1.3 * delta));

      // Reshaping is not free, and these sit still nearly all the time.
      if (Math.abs(crossed - posed) > 0.002 || Math.abs(retracted - retractedPosed) > 0.002) {
        for (const arm of arms) {
          arm.poseAt(crossed, retracted);
          // Once it is essentially inside the wall, take it out of the scene —
          // the port ring stays, which is all that should be left.
          arm.limb.visible = retracted < 0.94;
        }
        posed = crossed;
        retractedPosed = retracted;
      }

      arms.forEach((arm, i) => {
        // Half a cycle apart, or the pair move as one object and it reads as a
        // machine rather than as someone talking with their hands.
        const phase = i * Math.PI;

        // The whole arm swings from the wall port. The colliders are walked
        // onto it below, so this can be a real movement rather than the token
        // wobble it had to be while they were pinned to the resting curve.
        // Folding is not in here — that reshapes the conduit itself, above.
        const sway = (0.03 + talking * 0.17) * (1 - crossed * 0.7);
        arm.limb.rotation.y = Math.sin(time * 1.6 + phase) * sway;
        arm.limb.rotation.x = Math.sin(time * 1.15 + phase * 1.7) * sway * 0.7;
      });

      // Last, once the arms have finished moving for this frame.
      updateColliders();
    },
  };
}
