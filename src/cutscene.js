import * as THREE from 'three';
import { BACK_ROOM, DOOR, LAYER } from './config.js';
import { playKnockout } from './audio.js';
import { buildHand } from './glove.js';
import { speak, hideSubtitle, stopSpeaking } from './voice.js';

/**
 * The scene that plays when the door seals you in: someone speaks, then a hand
 * comes out of the dark and puts you out.
 *
 * The voice and its subtitles live in ./voice.js — the same character speaks
 * in the medical room, and there is one definition of how it sounds.
 *
 * The hand is parented to the camera rather than placed in the world. Where you
 * happen to be facing when the door shuts is arbitrary, and a world-space hand
 * would sooner or later reach for you from off-screen. In view space the shot
 * is composed the same way every time.
 */

const LINES = [
  { text: 'Hmmm? You’re a new face.', hold: 2.2 },
  { text: 'Well… maybe I could use you for something.', hold: 3.2 },
  { text: 'Say — nice friend you have there.', hold: 2.6 },
  { text: 'Let’s connect you two.', hold: 2.4, reach: true },
];

const STYLE = `
#cutscene-black {
  position: fixed; inset: 0; background: #000; z-index: 70;
  opacity: 0; pointer-events: none;
}

/* Nothing interactive should be on screen while this plays. */
body.cutscene #crosshair,
body.cutscene #prompt,
body.cutscene #objective { opacity: 0 !important; }
`;

export function createCutscene({ camera, player, onFinished }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const black = document.createElement('div');
  black.id = 'cutscene-black';
  document.body.appendChild(black);

  const { group: hand, fingers } = buildHand();
  hand.visible = false;
  camera.add(hand);

  /**
   * Put the hand in the pass belonging to whichever room the player is standing
   * in. Pinning it to one layer leaves it unlit — and effectively invisible —
   * whenever the scene fires in the other room.
   */
  function matchLayerToRoom() {
    const layer = camera.position.z < DOOR.z ? LAYER.DARK : LAYER.MAIN;
    hand.traverse((object) => object.layers.set(layer));
  }

  // Held high enough in frame that the arm has somewhere to be. Down at eye
  // level the wrist sits near the bottom edge and the forearm is off screen
  // within a few centimetres, which is what made it look severed.
  const START = new THREE.Vector3(3.3, -0.35, -4.4);
  const END = new THREE.Vector3(0.12, 0.2, -0.86);

  /** How long the camera takes to be turned around. Slow — it isn't your doing. */
  const TURN_SECONDS = 2.4;

  let state = 'idle';
  let timer = 0;
  let reachTime = 0;
  let lineIndex = 0;
  let lineTimer = 0;

  let turnTime = 0;
  let fromYaw = 0;
  let fromPitch = 0;
  let yawDelta = 0;

  /**
   * Aims the camera away from the only light in the room, which in the dark
   * room means turning you to face its unlit depths — where the hand comes
   * from. Defined as "away from the lamp" rather than as a fixed compass
   * direction so it still reads correctly wherever you happen to be standing.
   */
  function aimAtTheDark() {
    const lightZ = DOOR.z - BACK_ROOM.lightOffset;
    let dx = camera.position.x;
    let dz = camera.position.z - lightZ;

    // Standing directly under the lamp leaves no direction to turn away from;
    // head further in instead.
    if (Math.hypot(dx, dz) < 0.5) {
      dx = 0;
      dz = -1;
    }

    fromYaw = camera.rotation.y;
    fromPitch = camera.rotation.x;
    const target = Math.atan2(-dx, -dz);
    // Shortest way round, so it never spins the long way.
    yawDelta = Math.atan2(Math.sin(target - fromYaw), Math.cos(target - fromYaw));
    turnTime = 0;
  }

  /**
   * Speaks one line. A recorded `clip` wins if the line has one; otherwise it
   * falls back to synthesis. Either way `lineTimer` is the backstop, so the
   * scene keeps moving if playback never reports finishing — which browsers do
   * drop when the tab loses focus mid-sentence.
   */
  function say(index) {
    const line = LINES[index];
    if (line.reach) startReach();

    // The timer is the backstop, not the clock: browsers drop the end event
    // when the tab loses focus mid-sentence, and the scene has to keep moving.
    lineTimer = line.hold + 2.5;
    speak(line, () => {
      if (state !== 'done' && lineIndex === index) lineTimer = 0;
    });
  }

  function startReach() {
    if (state === 'reaching') return;
    state = 'reaching';
    reachTime = 0;
    hand.visible = true;
    hand.position.copy(START);
    hand.rotation.set(0.2, -0.5, 0.35);
  }

  function knockout() {
    state = 'blackout';
    timer = 0;
    playKnockout();
    stopSpeaking();
    hideSubtitle();
  }

  return {
    get isPlaying() {
      return state !== 'idle' && state !== 'done';
    },

    /** The full-screen black. Whatever comes next has to fade it back out. */
    get blackout() {
      return black;
    },

    /**
     * Wind it all the way back so `start()` will play it again. Only the debug
     * menu uses this — in a real run it happens exactly once.
     */
    reset() {
      state = 'idle';
      timer = 0;
      reachTime = 0;
      lineIndex = 0;
      lineTimer = 0;
      turnTime = 0;
      hand.visible = false;
      black.style.opacity = '0';
      hideSubtitle();
      document.body.classList.remove('cutscene');
      stopSpeaking();
    },

    start() {
      if (state !== 'idle') return;

      state = 'speaking';
      lineIndex = 0;
      document.body.classList.add('cutscene');
      player.setEnabled(false);
      matchLayerToRoom();
      aimAtTheDark();
      stopSpeaking();
      say(0);
    },

    update(delta) {
      if (state === 'idle' || state === 'done') return;

      // Turned to face the dark. Left out of the blackout phase, which drives
      // the camera itself as you go down.
      if (state !== 'blackout' && turnTime < TURN_SECONDS) {
        turnTime = Math.min(TURN_SECONDS, turnTime + delta);
        const t = turnTime / TURN_SECONDS;
        // Ease in and out: it starts and stops as if something turned you.
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        camera.rotation.order = 'YXZ';
        camera.rotation.y = fromYaw + yawDelta * eased;
        camera.rotation.x = fromPitch * (1 - eased);
        camera.rotation.z = 0;
      }

      if (state === 'speaking') {
        lineTimer -= delta;
        if (lineTimer <= 0) {
          lineIndex++;
          if (lineIndex < LINES.length) say(lineIndex);
          else hideSubtitle();
        }
      }

      if (state === 'reaching') {
        // The last line keeps playing underneath; only the hand's clock matters.
        if (lineIndex < LINES.length) {
          lineTimer -= delta;
          if (lineTimer <= 0) hideSubtitle();
        }

        reachTime += delta;
        const t = Math.min(1, reachTime / 2.6);
        // Creeps in, then lunges.
        const eased = t * t * t;

        hand.position.lerpVectors(START, END, eased);
        hand.rotation.y = -0.5 + eased * 0.5;
        hand.rotation.z = 0.35 - eased * 0.3;

        // Fingers curl as it closes on you.
        for (const finger of fingers) {
          for (const joint of finger.joints) joint.rotation.x = eased * 0.55;
        }

        if (t >= 1) knockout();
      }

      if (state === 'blackout') {
        timer += delta;
        // Your head goes with it: the view rolls and drops as you do.
        const fall = Math.min(1, timer / 0.9);
        black.style.opacity = String(Math.min(1, timer / 0.55));
        camera.rotation.z = fall * 0.9;
        camera.position.y -= delta * 1.9 * (1 - fall * 0.5);
        hand.position.z = END.z - fall * 0.4;

        if (timer > 1.6) {
          state = 'done';
          hand.visible = false;
          onFinished?.();
        }
      }
    },
  };
}
