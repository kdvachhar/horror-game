import * as THREE from 'three';

/**
 * Proximity interaction. Each frame it picks the closest registered target that
 * is both within range and roughly in front of the camera, and reports it so
 * the HUD can prompt for it. Pressing E fires that target.
 *
 * Requiring the player to be looking at a thing — not just standing near it —
 * is what stops the prompt flickering on as you walk past.
 */
export function createInteractions(camera, onActiveChange) {
  const targets = [];
  const forward = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const flatForward = new THREE.Vector3();
  const flatToTarget = new THREE.Vector3();
  let active = null;

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyE' || event.repeat) return;
    event.preventDefault();
    if (!active) return;

    const target = active;
    if (target.once) target.spent = true;
    target.onInteract();

    // Re-evaluate immediately so a spent target's prompt clears this frame.
    active = null;
    onActiveChange(null);
  });

  return {
    add(target) {
      // Defaults filled in on the object itself rather than into a copy of it.
      // A copy flattens accessors, and a target is allowed to have one: the
      // swings offer a label that changes with what pressing E would currently
      // do, and spread would freeze that to whatever it said when it was added.
      target.range ??= 4.5;
      target.facing ??= 0.45;
      target.once ??= true;
      target.spent = false;
      targets.push(target);
    },

    update() {
      camera.getWorldDirection(forward);

      let best = null;
      let bestDistance = Infinity;

      for (const target of targets) {
        if (target.spent || target.enabled?.() === false) continue;

        toTarget.copy(target.position).sub(camera.position);
        const distance = toTarget.length();
        if (distance > target.range || distance < 1e-4) continue;

        // Facing is judged on the horizontal only. Using the full 3D direction
        // fails whenever the player is above or below the target — standing on
        // the machine's plinth, say — even though they're clearly at it.
        flatForward.set(forward.x, 0, forward.z);
        flatToTarget.set(toTarget.x, 0, toTarget.z);

        const horizontal = flatToTarget.length();
        if (horizontal > 0.8) {
          flatToTarget.divideScalar(horizontal);
          flatForward.normalize();
          if (flatToTarget.dot(flatForward) < target.facing) continue;
        }
        // Closer than that and the player is practically on top of it, where
        // any facing test is meaningless.

        if (distance < bestDistance) {
          best = target;
          bestDistance = distance;
        }
      }

      // Reported every frame, not only when it changes. Firing on the edge
      // assumed this was the only thing ever writing the prompt, and it is
      // not — the loop clears it whenever the pointer is released, and this
      // system, seeing no change of its own, would never put it back. The HUD
      // already ignores a repeat of what it is showing.
      active = best;
      onActiveChange(best ? best.label : null);
    },
  };
}
