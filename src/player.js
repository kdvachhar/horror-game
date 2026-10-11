import * as THREE from 'three';
import { PLAYER, SPAWN } from './config.js';
import * as collision from './collision.js';
import { playFootstep, playLanding } from './audio.js';

const MOVE_KEYS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export function createPlayer(camera, domElement, colliders) {
  const keys = { forward: false, back: false, left: false, right: false, run: false };
  const velocity = new THREE.Vector3();
  const position = new THREE.Vector3(...SPAWN.position);

  let yaw = SPAWN.yaw;
  let pitch = 0;
  let bobPhase = 0;
  let locked = false;
  // The map editor's fly camera wants the same keys, so the player can be told
  // to let go of them.
  let enabled = true;

  // Whether this body is the one being driven. Ported from ../3d-plat: the
  // player keeps updating either way — it stands there, it falls, it settles —
  // and only the input and the camera are routed away. Nothing is frozen, so
  // taking control back never needs a resync.
  let controlled = true;
  let jumpListener = null;
  /** Sitting on something that moves. See setCarried(). */
  let carried = false;

  // Vertical state. position.y is the player's feet.
  let verticalVelocity = 0;
  let grounded = true;

  // Footsteps are paced by distance covered rather than by a timer, so the
  // cadence follows your actual speed instead of drifting out of sync.
  let strideDistance = 0;

  function onKey(event, pressed) {
    if (!enabled) return;
    if (event.code === 'Space') {
      // Always swallow space — otherwise the browser scrolls the page.
      event.preventDefault();
      if (!pressed) return;
      if (controlled) {
        if (grounded) {
          verticalVelocity = PLAYER.jumpSpeed;
          grounded = false;
        }
      } else {
        // Someone else has the keys. Jump is an edge, not a held state, so it
        // has to be handed over rather than read out of `keys`.
        jumpListener?.();
      }
      return;
    }

    const action = MOVE_KEYS[event.code];
    if (action) {
      keys[action] = pressed;
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.run = pressed;
  }

  function onMouseMove(event) {
    if (!locked || !enabled) return;
    yaw -= event.movementX * PLAYER.lookSensitivity;
    pitch -= event.movementY * PLAYER.lookSensitivity;
    // Stop just short of straight up/down so the horizon never flips.
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  }

  function onPointerLockChange() {
    locked = document.pointerLockElement === domElement;
    document.body.classList.toggle('playing', locked);
    if (!locked) {
      keys.forward = keys.back = keys.left = keys.right = keys.run = false;
    }
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);

  /**
   * How tall the player is, for openings they have to fit through. Eye line
   * plus a little skull — the same figure the medical room's window is sized
   * against.
   */
  const HEIGHT = PLAYER.eyeHeight + 0.12;

  /**
   * How far up the player will step without being asked to jump.
   *
   * Set to clear a ward mattress at 0.86, which is high for a step — but the
   * beds are furniture you walk onto, not obstacles, and being stopped dead by
   * one is worse than the liberty. Anything taller still wants a jump: the
   * hall's workbench at 1.03 and a tipped bed's frame at 1.05 both stay put.
   */
  const STEP_HEIGHT = 0.9;
  /**
   * And how far the floor can leave from under you before you are falling.
   *
   * There is a step up in this game and there was no step down, and the
   * difference shows up on a lift. Going up, a platform's top arrives under
   * your feet and a step's worth of free climb swallows it — liftTower.js says
   * so at length and is right. Going down, the floor moves away from your feet
   * faster than one frame of gravity brings them after it, so you are airborne;
   * then you fall until you are coming down faster than the lift, land, and the
   * floor leaves again. Measured on the code lift's twelve metre descent:
   * **forty landings**, four or five a second, each with a thump on it,
   * standing perfectly still in a lift.
   *
   * It had never mattered, because nothing used to happen on a ride down. It
   * matters now that one of them is eight and a half seconds of listening for
   * something on the roof of the car.
   *
   * So a body that was on the ground stays on the ground while the ground is
   * within this. Thirty centimetres is thirty times what the fastest platform
   * in the building moves in a frame and well under anything you would call a
   * drop — walking off a kerb this high now steps down it instead of falling
   * off it, which is the same liberty the step up already takes and the same
   * answer: being thumped by furniture is worse than the liberty.
   */
  const STEP_DOWN = 0.3;
  /** Metres per second the view catches up after a step. */
  const STEP_SMOOTHING = 4.5;

  // How far the camera is still lagging behind a step already taken. Without
  // it, walking onto a bed snaps the view up 0.86 in a single frame.
  let stepLag = 0;

  /**
   * This body, as collision.js wants it.
   *
   * The three queries live there now rather than here. They used to live here
   * *and* in friend.js, as copies kept in step by hand — which held for two of
   * them and then quietly failed on the third. See collision.js.
   */
  const BODY = {
    kind: collision.PLAYER,
    radius: PLAYER.radius,
    height: HEIGHT,
    stepHeight: STEP_HEIGHT,
  };

  /** Scratch, so the per-frame queries do not allocate. */
  const probe = { x: 0, z: 0, feetY: 0, grounded: false, previousFeetY: 0, previousHeadY: 0 };

  function resolveCollisions(next, feetY) {
    probe.x = next.x;
    probe.z = next.z;
    probe.feetY = feetY;
    probe.grounded = grounded;
    collision.pushOut(colliders, BODY, probe);
    next.x = probe.x;
    next.z = probe.z;
    return next;
  }

  function supportHeight(x, z, previousFeetY) {
    probe.x = x;
    probe.z = z;
    probe.grounded = grounded;
    probe.previousFeetY = previousFeetY;
    return collision.supportHeight(colliders, BODY, probe);
  }

  function ceilingHeight(x, z, previousHeadY) {
    probe.x = x;
    probe.z = z;
    probe.previousHeadY = previousHeadY;
    return collision.ceilingHeight(colliders, BODY, probe);
  }

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const nextPosition = new THREE.Vector3();

  return {
    requestLock() {
      if (!enabled) return;
      // Safari both throws and returns a rejecting promise here depending on
      // version and circumstance. Neither must be allowed to escape.
      try {
        Promise.resolve(domElement.requestPointerLock()).catch(() => {});
      } catch {
        /* pointer lock unavailable — the game is still playable without it */
      }
    },

    /**
     * Put the player somewhere else outright. Used between scenes — you do not
     * walk to the medical room, you wake up in it. Velocity is cleared so the
     * momentum you had when you blacked out doesn't carry over.
     */
    teleport({ position: to, yaw: facing, pitch: looking = 0 }) {
      position.set(...to);
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      grounded = true;
      if (facing !== undefined) yaw = facing;
      pitch = looking;
      // Push it to the camera now rather than waiting for the next update, so a
      // frame drawn before then isn't still at the old place.
      camera.position.set(position.x, position.y + PLAYER.eyeHeight, position.z);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    },

    /**
     * Whether this body holds the camera and the keys. Off while you are
     * driving something else: it still simulates, it just stops listening and
     * stops writing the view.
     */
    setControlled(on) {
      controlled = on;
    },

    /**
     * Sat on something that moves, and carried by it — the swings in the orange
     * room. Distinct from setControlled: this body is still yours and still
     * answers F, it simply is not walking anywhere. Whatever is carrying it
     * writes both the position and the view every frame.
     *
     * Without it the movement below fights the carrier every frame. The keys
     * still push: sitting on a swing with W held, this body reported 5.6m/s of
     * travel while going nowhere, which is the number the shadow body's gait
     * and the footstep cadence are both driven by. And gravity still pulls, so
     * it spends the ride falling out of the seat and being put back into it.
     */
    setCarried(on) {
      carried = on;
      if (!on) return;
      velocity.set(0, 0, 0);
      verticalVelocity = 0;
      grounded = true;
    },
    /**
     * The feet, in world space. Live — not a copy.
     *
     * Not the same thing as the camera while you are driving the bucket: the
     * camera is over there and this body is still standing where you left it,
     * which is exactly what anything hunting the *body* has to read.
     */
    get position() {
      return position;
    },

    get isControlled() {
      return controlled;
    },

    /** The live key state, so whatever is being driven can read the same keys. */
    get input() {
      return keys;
    },

    /** Where the one shared look is pointed. */
    get lookYaw() {
      return yaw;
    },
    get lookPitch() {
      return pitch;
    },

    /** Space, while this body is not the one being driven. */
    set onJump(fn) {
      jumpListener = fn;
    },

    /** Hand control to something else, or take it back. */
    setEnabled(on) {
      enabled = on;
      if (!on) keys.forward = keys.back = keys.left = keys.right = keys.run = false;
    },
    get isEnabled() {
      return enabled;
    },

    /** Where the player is and what they're doing, for the shadow body. */
    get pose() {
      return {
        x: position.x,
        y: position.y,
        z: position.z,
        yaw,
        // Handed out so something aiming the camera can take over from where
        // the player actually left it rather than snapping to level first.
        pitch,
        speed: Math.hypot(velocity.x, velocity.z),
        grounded,
      };
    },
    get isLocked() {
      return locked;
    },
    update(delta) {
      if (!enabled) return;
      // Being carried — see setCarried(). Nothing below this belongs to a body
      // that is not walking anywhere.
      if (carried) return;
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));

      wish.set(0, 0, 0);
      if (controlled) {
        if (keys.forward) wish.add(forward);
        if (keys.back) wish.sub(forward);
        if (keys.right) wish.add(right);
        if (keys.left) wish.sub(right);
      }

      const moving = wish.lengthSq() > 0;
      if (moving) wish.normalize();

      const targetSpeed = controlled && keys.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      velocity.x += (wish.x * targetSpeed - velocity.x) * Math.min(1, PLAYER.accel * delta);
      velocity.z += (wish.z * targetSpeed - velocity.z) * Math.min(1, PLAYER.accel * delta);

      if (!moving) {
        const decay = Math.max(0, 1 - PLAYER.damping * delta);
        velocity.multiplyScalar(decay);
      }

      const previousFeetY = position.y;

      nextPosition.copy(position).addScaledVector(velocity, delta);
      resolveCollisions(nextPosition, previousFeetY);

      // Gravity, then land on whatever surface is underneath.
      verticalVelocity -= PLAYER.gravity * delta;
      nextPosition.y = previousFeetY + verticalVelocity * delta;

      const ground = supportHeight(nextPosition.x, nextPosition.z, previousFeetY);
      const wasGrounded = grounded;
      // Stood on something that has moved down, rather than stepped off
      // something. See STEP_DOWN.
      const sank = wasGrounded && verticalVelocity < 0 && previousFeetY - ground <= STEP_DOWN;
      if (nextPosition.y <= ground || sank) {
        // Only a real fall thumps — ignore the sub-centimetre settling that
        // happens every frame you walk across a flat floor.
        if (!wasGrounded && verticalVelocity < -2) playLanding();
        nextPosition.y = ground;
        verticalVelocity = 0;
        grounded = true;
      } else {
        grounded = false;
      }

      /**
       * And your head, which until now went through everything.
       *
       * After the floor rather than before it, and never below it: a room
       * lower than the player is tall would otherwise push them through its
       * own floor, and being stuck under a low ceiling is a room that needs
       * fixing while being under the world is a game that needs reloading.
       *
       * Rising is stopped dead — you do not bounce off a concrete slab — and
       * only rising. Falling through the plane of a ceiling is how you get
       * into a room in the first place on every lift in this game.
       */
      const ceiling = ceilingHeight(nextPosition.x, nextPosition.z, previousFeetY + HEIGHT);
      if (nextPosition.y + HEIGHT > ceiling) {
        nextPosition.y = Math.max(ground, ceiling - HEIGHT);
        if (verticalVelocity > 0) verticalVelocity = 0;
      }

      position.copy(nextPosition);

      // Head bob, scaled by how fast you're actually travelling. Suspended
      // mid-air, since your feet aren't touching anything.
      const speed = Math.hypot(velocity.x, velocity.z);

      const stride = controlled && keys.run ? PLAYER.runStride : PLAYER.walkStride;
      if (!grounded || speed < 0.6) {
        // Primed, so the first step lands the moment you set off again rather
        // than half a stride later.
        strideDistance = stride;
      } else {
        strideDistance += speed * delta;
        if (strideDistance >= stride) {
          strideDistance -= stride;
          playFootstep(keys.run);
        }
      }

      // A step taken this frame is added to the lag, then bled off, so the
      // view rises over a fraction of a second instead of teleporting.
      if (grounded && wasGrounded && nextPosition.y > previousFeetY + 0.02) {
        stepLag = Math.min(STEP_HEIGHT, stepLag + (nextPosition.y - previousFeetY));
      }
      stepLag = Math.max(0, stepLag - STEP_SMOOTHING * delta);

      const speedRatio = grounded ? Math.min(1, speed / PLAYER.runSpeed) : 0;
      bobPhase += delta * PLAYER.bobFrequency * speedRatio;
      const bobY = Math.sin(bobPhase * 2) * PLAYER.bobAmplitude * speedRatio;
      const bobX = Math.cos(bobPhase) * PLAYER.bobAmplitude * 0.6 * speedRatio;

      // Only the body holding the camera writes it.
      if (!controlled) return;
      camera.position.set(
        position.x + bobX * 0.3,
        position.y + PLAYER.eyeHeight + bobY - stepLag,
        position.z
      );
      camera.rotation.set(pitch, yaw, bobX * 0.04, 'YXZ');
    },
  };
}
