/**
 * Possession, ported from the prototype in ../3d-plat.
 *
 * The rule that keeps it simple, and the one thing worth preserving from that
 * project: **every entity updates every tick regardless of who is driving.**
 * Only the input is routed. The player still stands, still falls, still
 * settles while you are inside the bucket, and the bucket still walks around
 * while you are not — so handing control over never has to resynchronise
 * anything, and no system below this one needs an `if (active)` branch.
 *
 * Where this deliberately parts company with that prototype is targeting.
 * There it was a raycast from the crosshair and line of sight was the whole
 * puzzle constraint — a cube behind a wall was not yours to take. Here **F
 * works from anywhere**: you are connected to the bucket, not reaching for it,
 * and that is what the thing on the wall says it did to you.
 *
 * So there is no targeting at all, and nothing on the HUD either way. Being in
 * the bucket is meant to be read off the fact that you are eight inches from
 * the floor with your own body stood across the room, not off a caption.
 */

/** How much of a seated body's lean the view takes. See applyCamera. */
const VIEW_LEAN = 0.35;

export function createPossession({ camera, player, friend, playerBody, onTaken }) {
  let unlocked = false;
  let possessing = false;

  function take() {
    possessing = true;
    friend.setDriven(true);
    player.setControlled(false);
    // Your body is left standing where you stepped out of it, and you can turn
    // round and look at it — which is the point of making it visible now.
    playerBody.setVisible(true, player.lookYaw);
    onTaken?.();
  }

  function give() {
    possessing = false;
    friend.setDriven(false);
    player.setControlled(true);
    playerBody.setVisible(false);
  }

  // Space, while the player's own body is not the one listening for it.
  player.onJump = () => {
    if (possessing) friend.jump();
  };

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyF' || event.repeat) return;
    if (/^(INPUT|TEXTAREA)$/.test(event.target?.tagName ?? '')) return;
    // Nothing doing while the player has been switched off — a cutscene, the
    // wake-up, or the paint GUI. Without this you could swap bodies from inside
    // a menu, and come out of it looking through the bucket.
    if (!player.isEnabled) return;
    if (!unlocked) return;
    if (possessing) give();
    // No aiming, no range: being connected to it is the point.
    else if (friend.isActive) take();
  });

  return {
    get isPossessing() {
      return possessing;
    },
    get isUnlocked() {
      return unlocked;
    },

    /** Nothing works until the thing on the wall says it has connected you. */
    unlock() {
      unlocked = true;
    },

    /** Puts you back in your own body. Used when a scene needs you in it. */
    reset() {
      if (possessing) give();
      unlocked = false;
    },

    /** Input routing. Runs before the friend's own update. */
    update() {
      if (!possessing) return;
      friend.setDriveInput(player.lookYaw, player.input);
    },

    /**
     * Writes the camera when you are inside the friend. Has to run after the
     * friend has moved, or the view trails a frame behind the body.
     */
    applyCamera() {
      if (!possessing) return;
      camera.position.set(
        friend.position.x,
        friend.position.y + friend.eyeHeight - friend.viewLag,
        friend.position.z
      );
      // Whatever it is sitting on leans it, and the view goes with the body —
      // ride a swing forward and you are lying back looking at the ceiling,
      // which is where that swing's button is. `lean` is the body's own tilt
      // and tips it head-backward as it goes negative, so the pitch it adds is
      // the other way round. Only a share of it: taking the whole angle would
      // wrench the view eighty degrees off where the mouse is pointing it.
      camera.rotation.set(
        player.lookPitch - friend.lean * VIEW_LEAN,
        player.lookYaw,
        0,
        'YXZ'
      );
    },
  };
}
