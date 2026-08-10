// Procedural audio, so the project stays asset-free like the textures.
//
// Browsers won't let an AudioContext start without a user gesture, so nothing
// is created until unlockAudio() is called from the click that enters the room.
// Anything that tries to play before that silently no-ops.

let context = null;
let master = null;
/** Send bus into the room reverb. Sounds connect here as well as to master. */
let reverbSend = null;

/**
 * A synthetic impulse response for the room: a handful of discrete early
 * reflections — the slapback you get off bare parallel walls — followed by an
 * exponentially decaying noise tail.
 *
 * The noise is run through a one-pole lowpass as it's generated, which makes
 * the tail dark rather than hissy. Bare concrete soaks up the top end long
 * before it soaks up the bottom.
 */
function makeImpulseResponse(seconds, decay) {
  const rate = context.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);

    let lowpassed = 0;
    for (let i = 0; i < length; i++) {
      lowpassed += (Math.random() * 2 - 1 - lowpassed) * 0.3;
      data[i] = lowpassed * Math.pow(1 - i / length, decay);
    }

    // Early reflections. Offset and inverted per channel so the room has some
    // width to it instead of collapsing to the centre.
    const taps = [
      [21, 0.62],
      [34, 0.5],
      [49, 0.4],
      [67, 0.32],
      [93, 0.24],
      [128, 0.17],
    ];
    for (const [ms, gain] of taps) {
      const index = Math.floor((ms / 1000) * rate) + channel * 17;
      if (index < length) data[index] += gain * (channel ? -1 : 1);
    }
  }

  return buffer;
}

export function unlockAudio() {
  if (!context) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return Promise.resolve();

    context = new Ctx();

    // Safari will hand back a context that reports "running" and still emits
    // nothing until a buffer has actually been played through it inside the
    // originating gesture. Playing one silent sample is the long-standing
    // workaround, and it costs nothing anywhere else.
    try {
      const primer = context.createBufferSource();
      primer.buffer = context.createBuffer(1, 1, context.sampleRate);
      primer.connect(context.destination);
      primer.start(0);
    } catch {
      /* if this fails there is nothing useful to do about it */
    }

    master = context.createGain();
    master.gain.value = 0.9;

    // Rolls the top off the square edges so the blip reads as equipment
    // rather than as a phone notification.
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;

    master.connect(filter).connect(context.destination);

    // Room reverb, on a send so each sound chooses how wet it is. The UI blip
    // stays dry — it isn't in the room, it's in your head.
    const convolver = context.createConvolver();
    convolver.buffer = makeImpulseResponse(2.8, 2.2);

    const damping = context.createBiquadFilter();
    damping.type = 'lowpass';
    damping.frequency.value = 2600;

    reverbSend = context.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(damping).connect(convolver).connect(master);

    // An AudioContext can be taken away mid-session: the OS speech engine
    // grabbing the audio session, a tab switch, a device change. Left alone it
    // stays suspended and every sound in the game silently stops for good,
    // because each one bails out when the context isn't running. Resuming on
    // any state change means the worst case is losing the sound that was
    // playing at the time, rather than all of them from then on.
    context.addEventListener('statechange', () => {
      if (context.state !== 'running') context.resume().catch(() => {});
    });
  }

  // Resume unconditionally rather than only when suspended. Safari reports
  // "interrupted" as well as "suspended", and treating anything that is not
  // running as recoverable is both correct and harmless.
  if (context.state !== 'running') {
    return Promise.resolve(context.resume()).catch(() => {});
  }
  return Promise.resolve();
}

/**
 * True when a sound can be scheduled. Nudges a stalled context back to life on
 * the way past, so playback recovers by itself on the next sound.
 */
function ready() {
  if (!context) return false;
  if (context.state === 'running') return true;
  context.resume().catch(() => {});
  return false;
}

/** Route a voice to the dry master and into the room reverb. */
function send(node, wet) {
  node.connect(master);
  if (!reverbSend) return;
  const tap = context.createGain();
  tap.gain.value = wet;
  node.connect(tap).connect(reverbSend);
}

/** Sounds successfully scheduled. Drives the on-screen indicator. */
let playedCount = 0;
export function audioPlayed() {
  return playedCount;
}

let noiseBuffer = null;

/** Two seconds of white noise, reused as the source for every noisy sound. */
function getNoise() {
  if (!noiseBuffer) {
    const length = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/**
 * A step on grit-covered concrete: a filtered noise scuff over a short body
 * thump. Both are jittered per step so a run doesn't turn into a machine gun.
 */
export function playFootstep(running = false) {
  if (!ready()) return;
  playedCount++;

  const t = context.currentTime + 0.005;
  const peak = running ? 0.2 : 0.14;

  const scuff = context.createBufferSource();
  scuff.buffer = getNoise();
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1300 + Math.random() * 1000;
  band.Q.value = 1.1;
  const scuffGain = context.createGain();
  scuffGain.gain.setValueAtTime(0.0001, t);
  scuffGain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  scuffGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
  scuff.connect(band).connect(scuffGain);
  send(scuffGain, 0.85);
  // Random offset into the noise so no two steps are the same sample.
  scuff.start(t, Math.random() * 1.5);
  scuff.stop(t + 0.12);

  const thump = context.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(96 + Math.random() * 22, t);
  thump.frequency.exponentialRampToValueAtTime(52, t + 0.08);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(peak * 0.85, t + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  thump.connect(thumpGain);
  // Less wet on the low thump — bass in a real room localises to your feet
  // rather than ringing round the walls, and a soaked low end just turns to mud.
  send(thumpGain, 0.35);
  thump.start(t);
  thump.stop(t + 0.13);
}

/**
 * The door seating in its frame: a deep impact, the body of the slab behind it,
 * and a loose metallic rattle afterwards from fittings that stopped being
 * maintained a long time ago. Sent hard into the reverb — this is the loudest
 * thing that happens in a big bare room.
 */
/**
 * The bucket's own footfalls, jump and landing.
 *
 * Deliberately nothing like the player's. Yours is a boot on concrete — a
 * broadband scuff over a low thump. This is an empty steel pail on two stub
 * legs, so it is a light tick with a ring under it, and the ring's partials
 * are spaced off-harmonically because that is what stops struck metal sounding
 * like a tuned note.
 *
 * All three take a level, since the thing making them is usually somewhere
 * across the room rather than under the camera.
 */
const PAIL_PARTIALS = [1, 1.51, 2.34, 3.11];

/** A struck-metal ring: an inharmonic stack decaying together. */
function pail(t, base, peak, decay, wet) {
  PAIL_PARTIALS.forEach((ratio, i) => {
    const partial = context.createOscillator();
    partial.type = i === 0 ? 'triangle' : 'sine';
    partial.frequency.value = base * ratio * (0.99 + Math.random() * 0.02);

    const gain = context.createGain();
    // Higher partials start louder and die faster, which is the shape of a
    // real strike — the top of the spectrum is gone almost immediately.
    const share = peak / (1 + i * 1.3);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(share, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.5));

    partial.connect(gain);
    send(gain, wet);
    partial.start(t);
    partial.stop(t + decay + 0.05);
  });
}

export function playBucketStep(level = 1) {
  if (!ready() || level < 0.02) return;
  playedCount++;

  const t = context.currentTime + 0.005;

  // The leg itself: a short, dry tick.
  const tick = context.createBufferSource();
  tick.buffer = getNoise();
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400 + Math.random() * 1400;
  band.Q.value = 1.6;
  const tickGain = context.createGain();
  tickGain.gain.setValueAtTime(0.0001, t);
  tickGain.gain.exponentialRampToValueAtTime(0.085 * level, t + 0.004);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  tick.connect(band).connect(tickGain);
  send(tickGain, 0.7);
  tick.start(t, Math.random() * 1.5);
  tick.stop(t + 0.08);

  // And the pail above it answering, quietly.
  pail(t, 470 + Math.random() * 90, 0.05 * level, 0.13, 0.8);
}

export function playBucketJump(level = 1) {
  if (!ready() || level < 0.02) return;
  playedCount++;

  const t = context.currentTime + 0.005;

  // The push off: a short dry scuff of the feet against the floor. This used
  // to be a bandpass swept from 700 up to 2600, which is a slide whistle — it
  // read as a cartoon boing rather than as something heavy leaving the ground,
  // and at 0.07 it was quieter than the footstep it followed.
  const scuff = context.createBufferSource();
  scuff.buffer = getNoise();
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 850 + Math.random() * 400;
  band.Q.value = 1.3;
  const scuffGain = context.createGain();
  scuffGain.gain.setValueAtTime(0.0001, t);
  scuffGain.gain.exponentialRampToValueAtTime(0.11 * level, t + 0.006);
  scuffGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  scuff.connect(band).connect(scuffGain);
  send(scuffGain, 0.7);
  scuff.start(t, Math.random() * 1.5);
  scuff.stop(t + 0.09);

  // Then the pail, which is what tells the three apart. A step taps it at 470
  // and it is gone in 0.13; a landing hits it at 300 and it rings for 0.42.
  // Leaving the ground sits between: brighter than an arrival, shorter than
  // one, because nothing has struck it — it has just been swung upward.
  pail(t, 540, 0.075 * level, 0.22, 0.85);
}

export function playBucketLand(level = 1) {
  if (!ready() || level < 0.02) return;
  playedCount++;

  const t = context.currentTime + 0.005;

  // The floor takes the weight.
  const thud = context.createBufferSource();
  thud.buffer = getNoise();
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 700;
  const thudGain = context.createGain();
  thudGain.gain.setValueAtTime(0.0001, t);
  thudGain.gain.exponentialRampToValueAtTime(0.15 * level, t + 0.005);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  thud.connect(low).connect(thudGain);
  send(thudGain, 0.5);
  thud.start(t, Math.random() * 1.5);
  thud.stop(t + 0.2);

  // Then the pail rings on, lower and far longer than a step — it is the
  // whole body arriving rather than one leg tapping.
  pail(t, 300 + Math.random() * 40, 0.13 * level, 0.42, 1);
}

/**
 * A big industrial push button going in and latching. Two clicks a few
 * milliseconds apart — the cap bottoming out and the contact behind it — which
 * is most of what separates a switch that has *done* something from a tap.
 */
export function playButtonPress(level = 1) {
  if (!ready() || level < 0.02) return;
  playedCount++;

  const t = context.currentTime + 0.005;

  for (const [at, peak, freq] of [[0, 0.16, 2600], [0.035, 0.11, 1500]]) {
    const click = context.createBufferSource();
    click.buffer = getNoise();
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 2.2;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t + at);
    gain.gain.exponentialRampToValueAtTime(peak * level, t + at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.05);
    click.connect(band).connect(gain);
    send(gain, 0.9);
    click.start(t + at, Math.random() * 1.5);
    click.stop(t + at + 0.08);
  }

  // The clunk of the mechanism under the clicks.
  const body = context.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(190, t);
  body.frequency.exponentialRampToValueAtTime(90, t + 0.09);
  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.1 * level, t + 0.005);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  body.connect(bodyGain);
  send(bodyGain, 0.5);
  body.start(t);
  body.stop(t + 0.15);
}

/**
 * The ward door coming open: a latch letting go, then a slow hinge. The glide
 * is deliberate here — a hinge really does creak up in pitch as it turns, which
 * is the one place a swept filter is the honest thing rather than a cartoon.
 */
export function playWardDoor(level = 1) {
  if (!ready() || level < 0.02) return;
  playedCount++;

  const t = context.currentTime + 0.005;

  const latch = context.createBufferSource();
  latch.buffer = getNoise();
  const click = context.createBiquadFilter();
  click.type = 'bandpass';
  click.frequency.value = 2100;
  click.Q.value = 2.4;
  const latchGain = context.createGain();
  latchGain.gain.setValueAtTime(0.0001, t);
  latchGain.gain.exponentialRampToValueAtTime(0.13 * level, t + 0.004);
  latchGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  latch.connect(click).connect(latchGain);
  send(latchGain, 0.9);
  latch.start(t, Math.random() * 1.5);
  latch.stop(t + 0.1);

  // The hinge, starting a moment after the latch releases.
  const creak = context.createOscillator();
  creak.type = 'sawtooth';
  creak.frequency.setValueAtTime(180, t + 0.09);
  creak.frequency.exponentialRampToValueAtTime(420, t + 0.85);
  const throat = context.createBiquadFilter();
  throat.type = 'bandpass';
  throat.frequency.value = 900;
  throat.Q.value = 6;
  const creakGain = context.createGain();
  creakGain.gain.setValueAtTime(0.0001, t + 0.09);
  creakGain.gain.exponentialRampToValueAtTime(0.05 * level, t + 0.22);
  creakGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  creak.connect(throat).connect(creakGain);
  send(creakGain, 1);
  creak.start(t + 0.09);
  creak.stop(t + 1);

  // And the weight of it settling once it is open.
  const thud = context.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(110, t + 0.88);
  thud.frequency.exponentialRampToValueAtTime(58, t + 1.02);
  const thudGain = context.createGain();
  thudGain.gain.setValueAtTime(0.0001, t + 0.88);
  thudGain.gain.exponentialRampToValueAtTime(0.09 * level, t + 0.895);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.06);
  thud.connect(thudGain);
  send(thudGain, 0.5);
  thud.start(t + 0.88);
  thud.stop(t + 1.1);
}

export function playDoorClose() {
  if (!ready()) return;
  playedCount++;

  const t = context.currentTime + 0.01;

  // Impact: the boom you feel through the floor.
  const boom = context.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(78, t);
  boom.frequency.exponentialRampToValueAtTime(32, t + 0.32);
  const boomGain = context.createGain();
  boomGain.gain.setValueAtTime(0.0001, t);
  boomGain.gain.exponentialRampToValueAtTime(0.42, t + 0.01);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  boom.connect(boomGain);
  send(boomGain, 0.45);
  boom.start(t);
  boom.stop(t + 0.45);

  // Slab: broadband thud, rolled right off so it reads as mass not as noise.
  const slab = context.createBufferSource();
  slab.buffer = getNoise();
  const slabFilter = context.createBiquadFilter();
  slabFilter.type = 'lowpass';
  slabFilter.frequency.setValueAtTime(1400, t);
  slabFilter.frequency.exponentialRampToValueAtTime(260, t + 0.25);
  const slabGain = context.createGain();
  slabGain.gain.setValueAtTime(0.0001, t);
  slabGain.gain.exponentialRampToValueAtTime(0.3, t + 0.008);
  slabGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  slab.connect(slabFilter).connect(slabGain);
  send(slabGain, 0.9);
  slab.start(t, Math.random() * 1.5);
  slab.stop(t + 0.35);

  // Rattle: two loose knocks chasing the impact.
  for (const [delay, level] of [[0.07, 0.1], [0.14, 0.06]]) {
    const rattle = context.createBufferSource();
    rattle.buffer = getNoise();
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 780 + Math.random() * 500;
    band.Q.value = 3.2;
    const gain = context.createGain();
    const at = t + delay;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    rattle.connect(band).connect(gain);
    send(gain, 1);
    rattle.start(at, Math.random() * 1.5);
    rattle.stop(at + 0.12);
  }
}

/** Heavier, lower version of a footstep, for coming down off a jump. */
export function playLanding() {
  if (!ready()) return;
  playedCount++;

  const t = context.currentTime + 0.005;

  const impact = context.createBufferSource();
  impact.buffer = getNoise();
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 900;
  const impactGain = context.createGain();
  impactGain.gain.setValueAtTime(0.0001, t);
  impactGain.gain.exponentialRampToValueAtTime(0.2, t + 0.006);
  impactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  impact.connect(low).connect(impactGain);
  send(impactGain, 1);
  impact.start(t, Math.random() * 1.5);
  impact.stop(t + 0.2);

  const body = context.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(84, t);
  body.frequency.exponentialRampToValueAtTime(42, t + 0.13);
  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(0.0001, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.22, t + 0.006);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
  body.connect(bodyGain);
  send(bodyGain, 0.4);
  body.start(t);
  body.stop(t + 0.2);
}

function tone(startTime, frequency, duration, peak) {
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, startTime);

  // Exponential ramps can't touch zero, hence the tiny floor values.
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain).connect(master);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/** The impact that ends the cutscene. */
export function playKnockout() {
  if (!ready()) return;
  playedCount++;
  const t = context.currentTime + 0.005;

  const thud = context.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(140, t);
  thud.frequency.exponentialRampToValueAtTime(28, t + 0.55);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  thud.connect(gain);
  send(gain, 0.7);
  thud.start(t);
  thud.stop(t + 0.75);

  const crack = context.createBufferSource();
  crack.buffer = getNoise();
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 1600;
  const crackGain = context.createGain();
  crackGain.gain.setValueAtTime(0.0001, t);
  crackGain.gain.exponentialRampToValueAtTime(0.34, t + 0.006);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  crack.connect(low).connect(crackGain);
  send(crackGain, 1);
  crack.start(t, Math.random() * 1.5);
  crack.stop(t + 0.3);
}

/**
 * Diagnostics, for when the game is silent and it isn't clear whether the fault
 * is in here or in the browser. `game.audio.state()` from the console reports
 * what the graph thinks; `game.audio.test()` plays a deliberately loud tone
 * straight to the destination, bypassing the master chain and the reverb.
 * If the test tone is audible but the game is not, the fault is in this file.
 * If neither is audible, it is the tab, the device or the system volume.
 */
export function audioState() {
  if (!context) return { context: 'not created — no user gesture has reached it yet' };
  return {
    state: context.state,
    sampleRate: context.sampleRate,
    masterGain: master?.gain.value,
    outputLatency: context.outputLatency,
    destinationChannels: context.destination.channelCount,
  };
}

/**
 * A small always-visible readout of what the audio system is doing, because
 * "there is no sound" has too many causes to guess at: the context may never
 * have started, may be suspended, or may be running fine and inaudible because
 * of something outside the page. Clicking it forces an unlock and a test tone.
 */
export function mountAudioIndicator() {
  const el = document.createElement('div');
  el.id = 'audio-indicator';
  Object.assign(el.style, {
    position: 'fixed', left: '10px', bottom: '10px', zIndex: '200',
    font: '11px "Courier New", monospace', color: '#9aa79c',
    background: 'rgba(10,14,11,0.8)', border: '1px solid #2c352e',
    borderRadius: '4px', padding: '4px 8px', cursor: 'pointer',
    letterSpacing: '0.08em', userSelect: 'none',
  });
  el.title = 'click to force-unlock audio and play a test tone';
  el.addEventListener('click', async (event) => {
    event.stopPropagation();
    await unlockAudio();
    playTestTone();
  });
  document.body.appendChild(el);

  let lastCount = -1;
  let flash = 0;

  return function update() {
    const state = context ? context.state : 'no context';
    if (playedCount !== lastCount) {
      lastCount = playedCount;
      flash = 1;
    }
    flash = Math.max(0, flash - 0.05);

    const ok = state === 'running';
    el.style.color = ok ? (flash > 0.5 ? '#8fe3a4' : '#9aa79c') : '#e78284';
    el.textContent = `audio: ${state} · ${playedCount} played${ok ? '' : ' · click here'}`;
  };
}

export function playTestTone() {
  if (!context) return 'no audio context — click or press a key first';

  const t = context.currentTime + 0.02;
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 440;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
  gain.gain.setValueAtTime(0.35, t + 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1);

  // Straight to the destination on purpose: no master gain, no filter, no
  // reverb. This is testing the browser, not the mix.
  osc.connect(gain).connect(context.destination);
  osc.start(t);
  osc.stop(t + 1.05);

  return `playing 440Hz for 1s at 0.35 — context is ${context.state}`;
}

/** Two-note rising blip for a new objective. */
export function playObjectiveBlip() {
  if (!ready()) return;
  playedCount++;

  const start = context.currentTime + 0.01;
  tone(start, 784, 0.085, 0.16);
  tone(start + 0.075, 1175, 0.17, 0.13);
}
