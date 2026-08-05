import { PLAYER } from './config.js';

/**
 * Coming round in the medical room.
 *
 * Runs straight out of the cutscene's blackout, so it starts with the screen
 * already black and the player already switched off. It moves them onto the
 * bed, opens their eyes in stages — the first two don't stay open — and sits
 * them up facing the wall before handing control back.
 */

const PHASES = {
  // Out cold. Long enough that the cut doesn't feel like a stumble.
  DARK: 1.4,
  // Eyes opening: two failed attempts, then they stay open.
  BLINK: 3.2,
  // Sitting up off the pillow.
  SIT: 2.4,
  // Sat there, turning your head until you find it.
  LOOK: 2.8,
  // Getting to your feet.
  STAND: 1.5,
};

const ORDER = ['dark', 'blink', 'sit', 'look', 'stand'];
const DURATIONS = [PHASES.DARK, PHASES.BLINK, PHASES.SIT, PHASES.LOOK, PHASES.STAND];

/** Eyelids: how much black is over the view during the blink phase. */
function eyelid(t) {
  // Open, shut, open, shut, open — the last one holds.
  if (t < 0.18) return 1 - t / 0.18;
  if (t < 0.34) return (t - 0.18) / 0.16;
  if (t < 0.52) return 1 - (t - 0.34) / 0.18;
  if (t < 0.64) return (t - 0.52) / 0.12;
  if (t < 0.85) return 1 - (t - 0.64) / 0.21;
  return 0;
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function createWakeUp({ camera, player, medical, blackout, onFinished }) {
  const { pillow, sitting, standing, yaw, facing, facingPitch } = medical.wake;
  // Shortest way round, so a turn across the -PI/+PI seam doesn't spin you.
  const turn = ((facing - yaw + Math.PI) % (Math.PI * 2)) - Math.PI;

  let phase = -1;
  let time = 0;

  function enter(next) {
    phase = next;
    time = 0;
    if (ORDER[phase] === 'dark') {
      // On your back on the mattress, looking at the ceiling.
      player.teleport({ position: [pillow[0], standing[1], pillow[2]], yaw, pitch: 0.62 });
      camera.position.set(...pillow);
      camera.rotation.set(0.62, yaw, -0.22, 'YXZ');
    }
  }

  return {
    get isPlaying() {
      return phase >= 0 && phase < ORDER.length;
    },

    start() {
      if (phase !== -1) return;
      player.setEnabled(false);
      enter(0);
    },

    /** Back to never-having-run, so the debug menu can replay it. */
    reset() {
      phase = -1;
      time = 0;
    },

    update(delta) {
      if (phase < 0 || phase >= ORDER.length) return;

      time += delta;
      const duration = DURATIONS[phase];
      const t = Math.min(1, time / duration);
      const name = ORDER[phase];

      if (name === 'dark') {
        blackout.style.opacity = '1';
      }

      if (name === 'blink') {
        blackout.style.opacity = String(eyelid(t));
        // Still flat out; the head lolls a little as you come to.
        camera.position.set(pillow[0], pillow[1], pillow[2]);
        camera.rotation.set(0.62, yaw, -0.22 + Math.sin(time * 1.4) * 0.05, 'YXZ');
      }

      if (name === 'sit') {
        blackout.style.opacity = '0';
        // Off the pillow and upright. The pitch comes down off the ceiling and
        // lands on the wall — which is where the television is.
        const eased = easeInOut(t);
        camera.position.set(
          pillow[0] + (sitting[0] - pillow[0]) * eased,
          pillow[1] + (sitting[1] - pillow[1]) * eased,
          pillow[2] + (sitting[2] - pillow[2]) * eased
        );
        camera.rotation.set(0.62 * (1 - eased) - 0.02 * eased, yaw, -0.22 * (1 - eased), 'YXZ');
      }

      if (name === 'look') {
        // Sat up, catching your breath — and then your head comes round onto
        // it. Held off until the last two thirds so there is a beat of not
        // knowing before the turn starts.
        const turned = easeInOut(Math.max(0, (t - 0.3) / 0.7));
        camera.position.set(sitting[0], sitting[1] + Math.sin(time * 1.6) * 0.012, sitting[2]);
        camera.rotation.set(
          -0.02 + (facingPitch + 0.02) * turned,
          yaw + turn * turned,
          0,
          'YXZ'
        );
      }

      if (name === 'stand') {
        // Up onto your feet, eyes still on it.
        const eased = easeInOut(t);
        const targetY = standing[1] + PLAYER.eyeHeight;
        camera.position.set(
          sitting[0] + (standing[0] - sitting[0]) * eased,
          sitting[1] + (targetY - sitting[1]) * eased,
          sitting[2] + (standing[2] - sitting[2]) * eased
        );
        camera.rotation.set(facingPitch * (1 - eased * 0.6), facing, 0, 'YXZ');
      }

      if (t < 1) return;

      if (phase + 1 < ORDER.length) {
        enter(phase + 1);
        return;
      }

      // On your feet on the bed, exactly where the camera already is, so
      // control comes back without the view moving.
      phase = ORDER.length;
      player.teleport({ position: standing, yaw: facing, pitch: facingPitch * 0.4 });
      player.setEnabled(true);
      onFinished?.();
    },
  };
}
