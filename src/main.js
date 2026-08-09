import * as THREE from 'three';
import { createRoom } from './room.js';
import { createMachine } from './machine.js';
import { createBucket } from './bucket.js';
import { createFriend } from './friend.js';
import { createDoor } from './door.js';
import { createPlayerBody } from './playerBody.js';
import { createMedicalRoom } from './medicalRoom.js';
import { MACHINE, DOOR, LAYER, SPAWN, MEDICAL } from './config.js';
import { createPlayer } from './player.js';
import { createWallText } from './wallText.js';
import { createInteractions } from './interaction.js';
import { setObjective, showPrompt } from './hud.js';
import {
  unlockAudio,
  playObjectiveBlip,
  playFootstep,
  playDoorClose,
  audioState,
  playTestTone,
  mountAudioIndicator,
} from './audio.js';
import { createDebugMenu } from './debug.js';
import { createCutscene } from './cutscene.js';
import { createWakeUp } from './wakeUp.js';
import { createPossession } from './possession.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;
renderer.autoClear = false; // the render loop clears once, then draws both passes
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Deliberately NOT scene.background. A Color background forces a buffer clear
// inside every render() call — even with autoClear off — which would wipe the
// first pass when the second one runs. Setting it as the clear colour instead
// leaves clearing entirely under our control.
renderer.setClearColor(0x05070a, 1);
scene.fog = new THREE.FogExp2(0x0d1219, 0.011);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
scene.add(camera);

const room = createRoom(scene);
const machine = createMachine(scene);
const bucket = createBucket(scene, new THREE.Vector3(-15.5, 0, -5));
const friend = createFriend(scene);
const door = createDoor(scene);
const wallText = createWallText(scene);

// The player keeps a reference to this array, so the conveyor's collider has to
// be folded in before it's constructed.
room.colliders.push(...machine.colliders);

// The doorway is solid while the door is shut. Gated rather than added and
// removed, so the array the player holds never changes identity.
// Hugs the shutter rather than filling the whole reveal. At 0.6 deep against a
// door 0.1 thick you were stopped a quarter of a metre short of it, in the gap.
// Still thicker than a frame's travel at running speed, so nothing tunnels.
const doorwayCollider = {
  minX: -DOOR.width / 2,
  maxX: DOOR.width / 2,
  minZ: DOOR.z - 0.45,
  maxZ: DOOR.z - 0.05,
  enabled: () => !door.isOpen,
};
room.colliders.push(doorwayCollider);
const player = createPlayer(camera, renderer.domElement, room.colliders);
const playerBody = createPlayerBody(scene);
const medical = createMedicalRoom(scene);
room.colliders.push(...medical.colliders);

const interactions = createInteractions(camera, showPrompt);

setObjective('Inspect the machine');

interactions.add({
  position: machine.hatchAnchor,
  label: 'Inspect machine',
  range: 4.5,
  onInteract() {
    machine.openHatch();
    setObjective('Find something to load into the machine');
  },
});

interactions.add({
  position: bucket.anchor,
  label: 'Pick up bucket',
  range: 3,
  onInteract() {
    bucket.pickUp(camera);
    setObjective('Load the bucket into the machine');
  },
});

// Shares the hatch's anchor with the inspect target above. That one is spent
// once used, and this one stays disabled until you're actually carrying the
// bucket and the hatch is open, so only ever one of them is offered.
interactions.add({
  position: machine.hatchAnchor,
  label: 'Load bucket',
  range: 4.5,
  enabled: () => bucket.isHeld && machine.hatchOpen,
  onInteract() {
    bucket.placeInto(machine.group, machine.chamberSlot);
    machine.closeHatch();
    setObjective('Collect your friend');
    processing = PROCESS_SECONDS;
  },
});

// How long the machine chews on the bucket before something comes out the far
// end of the conveyor. Null means it isn't running.
const PROCESS_SECONDS = 4;
let processing = null;

function deliverFriend() {
  const endX = MACHINE.center[0] + MACHINE.conveyorStart + MACHINE.conveyorLength;
  // Just past the open end of the hood, already moving, so it looks like it
  // rode out rather than appearing.
  // y is its feet, so this puts it stepping off the lip of the belt.
  friend.spawn(
    new THREE.Vector3(endX + 0.5, MACHINE.beltHeight + 0.15, MACHINE.center[2]),
    new THREE.Vector3(1.6, 0.4, 0)
  );

  // Something is alive now, so the way on unseals.
  door.open();
}

/**
 * Move an object between render passes. Anything that walks into the dark room
 * has to switch with it, or it stays lit by the main room and floats in the
 * black — and in the dark pass it wouldn't be drawn at all.
 */
let friendLayer = null;
function updateFriendLayer() {
  const layer = friend.position.z < DOOR.z ? LAYER.DARK : LAYER.MAIN;
  if (layer === friendLayer) return;
  friendLayer = layer;
  friend.mesh.traverse((object) => object.layers.set(layer));
}

/**
 * Your friend comes round in there with you.
 *
 * It walked through that door at your heels and the voice said it was going to
 * connect you two, so it has no business still standing in the dark room when
 * you open your eyes.
 *
 * Stood across the room rather than at the foot of the bed, and deliberately
 * not collected. Following puts it at its preferred distance of about two
 * metres, which from a sitting eye height means looking down into the top of
 * it; from here you see its face. It is also outside the loop's pick-up radius,
 * so walking over to it is yours to do.
 */
function placeFriendInMedicalRoom() {
  const [mx, , mz] = MEDICAL.center;
  // Clear of the arms. They are solid now, and the old spot was inside the
  // low one's reach — it spawned overlapping and got shoved out sideways.
  friend.spawn(new THREE.Vector3(mx - 0.8, 0, mz - 2.6));
}

const cutscene = createCutscene({
  camera,
  player,
  // You don't come back to the room you went down in — and neither does it.
  onFinished: () => {
    placeFriendInMedicalRoom();
    wakeUp.start();
  },
});

/**
 * What the television says once you are on your feet. It waits for the wake-up
 * to finish rather than talking over it — you should be standing and looking at
 * it before it starts.
 */
const TV_LINES = [
  { text: 'Oh, you’re finally awake.', hold: 1.6 },
  { text: 'And your bucket is too.', hold: 1.8 },
  // Said with its eyes shut. It is very pleased with itself about this one.
  {
    text: 'I’ve also taken the liberty of connecting you two.',
    hold: 2.6,
    eyes: 'closed',
    arms: 'crossed',
  },
  { text: 'You should now be able to control him.', hold: 2.4 },
];

/**
 * What it says the first time you take the bucket over. Split at the sentences
 * rather than run as one block, because a line is both a subtitle and a mouth
 * schedule — one long one would sit on screen for ten seconds.
 */
const HANDOVER_LINES = [
  { text: 'Awesome! Now you need to get out of this room.', hold: 2.2 },
  { text: 'See that broken window?', hold: 1.6 },
  { text: 'I need you to use your bucket to jump in there and press the button.', hold: 3.0 },
  { text: 'And the door will open.', hold: 2.2 },
];

// Said once. Wound back with everything else so a scene jump can hear it again.
let handoverSaid = false;

const possession = createPossession({
  camera,
  player,
  friend,
  playerBody,
  onTaken() {
    if (handoverSaid) return;
    handoverSaid = true;
    medical.speak(HANDOVER_LINES, () => {
      setObjective('Get the bucket through the window and press the button');
    });
  },
});

const wakeUp = createWakeUp({
  camera,
  player,
  medical,
  blackout: cutscene.blackout,
  onFinished: () => {
    document.body.classList.remove('cutscene');
    setObjective('…');
    medical.speak(TV_LINES, () => {
      // Only true once it has said so.
      possession.unlock();
      setObjective('Press F to take control of your friend');
    });
  },
});

// The door starts shut, so "is closed" alone would fire on frame one. It has to
// have opened first — which only happens once the machine has produced the
// friend, and that is exactly when this is meant to trigger.
let doorHasOpened = false;

/**
 * Everything the debug menu can jump to. The panel only renders the list — the
 * setup for each beat lives here, next to the objects it has to put in place.
 *
 * Both sequences are wound back first. Without that, jumping to a scene you
 * have already seen does nothing at all: each one refuses to start twice.
 */
function resetSequences() {
  cutscene.reset();
  wakeUp.reset();
  possession.reset();
  medical.stopSpeaking();
  handoverSaid = false;
  // The loop fires the cutscene the moment a door that has been open closes.
  // Clearing this stops a jump from immediately retriggering it underneath you.
  doorHasOpened = false;
  player.setEnabled(true);
}

const SCENES = [
  {
    label: '1 · Hall',
    hint: 'Back to the spawn point in the first room',
    go() {
      resetSequences();
      player.teleport({ position: SPAWN.position, yaw: SPAWN.yaw });
      setObjective('Inspect the machine');
    },
  },
  {
    label: '2 · Friend out',
    hint: 'The machine has run: your friend is off the belt and the door is open',
    go() {
      resetSequences();
      if (!machine.hatchOpen) machine.openHatch();
      deliverFriend();
      player.teleport({ position: [MACHINE.center[0] + 13, 0, 5], yaw: 0 });
      setObjective('Collect your friend');
    },
  },
  {
    label: '3 · Cutscene',
    hint: 'In the dark room, from the top: the voice and the hand',
    go() {
      resetSequences();
      door.open();
      player.teleport({ position: [0, 0, DOOR.z - 2.4], yaw: 0 });
      // It followed you in; the scene doesn't read without it stood there.
      friend.spawn(new THREE.Vector3(1.4, 0, DOOR.z - 1.6));
      friend.collect();
      cutscene.start();
    },
  },
  {
    label: '4 · Waking up',
    hint: 'Straight out of the blackout: coming round in the medical room',
    go() {
      resetSequences();
      placeFriendInMedicalRoom();
      wakeUp.start();
    },
  },
  {
    label: '5 · Medical room',
    hint: 'Stood in the medical room with control already handed back',
    go() {
      resetSequences();
      placeFriendInMedicalRoom();
      // This one drops you in past the television's speech, so possession has
      // to be granted directly or the mechanic is simply missing.
      possession.unlock();
      setObjective('Press F to take control of your friend');
      player.teleport({
        position: medical.wake.standing,
        yaw: medical.wake.facing,
        pitch: medical.wake.facingPitch * 0.4,
      });
    },
  },
];

const debugMenu = createDebugMenu({
  scenes: SCENES,
  scene,
  camera,
  renderer,
  room,
  player,
  colliders: room.colliders,
  // Resizing a room in the editor rebuilds the shell; everything pinned to a
  // wall has to be re-fitted to where that wall now is.
  onShellChanged() {
    room.rebuildShell();
    wallText.reposition();
    door.reposition();
    doorwayCollider.minZ = DOOR.z - 0.45;
    doorwayCollider.maxZ = DOOR.z - 0.05;
  },
});

// Audio needs a user gesture, and the overlay click is the intended one — but
// the overlay stops taking clicks the moment you're playing, so if that single
// click is ever missed there is no second chance and the game stays silent for
// the whole session. Any input will do instead. unlockAudio() is idempotent and
// also resumes a context that has been suspended, so this doubles as recovery.
for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => unlockAudio(), { capture: true });
}

const overlay = document.getElementById('overlay');
let announced = false;

overlay.addEventListener('click', () => {
  // Audio FIRST, and synchronously. requestPointerLock throws outright in
  // Safari when it doesn't like the request, and it used to run before this —
  // one throw and unlockAudio never ran, leaving the whole session silent with
  // no way back. Nothing may come between the gesture and the unlock.
  const unlocked = unlockAudio();

  try {
    player.requestLock();
  } catch {
    // Pointer lock is a nicety; losing it must never cost us the audio.
  }

  // The opening objective was set before any of that, so it never got to
  // sound — announce it once here.
  unlocked.then(() => {
    if (announced) return;
    announced = true;
    playObjectiveBlip();
  });
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Dev-only readout in the corner: whether audio is alive, and whether sounds
// are actually reaching it.
const updateAudioIndicator = import.meta.env.DEV ? mountAudioIndicator() : null;

let lastTime = performance.now();

renderer.setAnimationLoop((time) => {
  // Clamped at both ends.
  //
  // The cap stops an alt-tab teleporting the player across the room. The floor
  // is for the very first frame: `time` is when that frame *started*, which is
  // before this module finished building the scene, so `time - lastTime` comes
  // out several seconds negative — measured at -6.4s. Everything in the loop
  // integrates that once. Most of it just steps backwards a little and
  // recovers invisibly, but anything easing exponentially inverts and diverges
  // instead: 1 - e^(-24 · -6.4) is about -5e66, which is what sent the
  // television's mouth to a scale of 1e55 for the first few seconds.
  const delta = Math.min(Math.max((time - lastTime) / 1000, 0), 0.05);
  lastTime = time;

  debugMenu.update(delta);
  player.update(delta);
  playerBody.update(delta, player.pose);
  // Routes the keys to whoever is being driven. Before the friend's update, so
  // it steers on this frame's input rather than last frame's.
  possession.update();
  room.update(delta);
  medical.update(delta);
  machine.update(delta);
  door.update(delta);
  wallText.update(delta);

  // Shuts once your friend is properly through the threshold — not when you
  // cross it. You get to walk in, watch it follow you, and only then hear the
  // door come down behind the pair of you.
  if (friend.isActive && friend.position.z < DOOR.z - 1.5) door.close();

  if (door.isOpen) doorHasOpened = true;
  if (doorHasOpened && door.isClosed) cutscene.start();
  cutscene.update(delta);
  wakeUp.update(delta);


  if (processing !== null) {
    processing -= delta;
    if (processing <= 0) {
      processing = null;
      deliverFriend();
    }
  }

  friend.update(delta, camera, camera.position, room.colliders);
  // Only the bucket can get up there, but the check is on position rather than
  // on identity — whatever ends up on the top board presses it.
  if (friend.isActive) medical.tryPressButton(friend.position, friend.isGrounded);
  // The view has to be written after the body it is attached to has moved, or
  // it trails a frame behind everything you do.
  possession.applyCamera();

  // Walking up to it is what "collecting" means — no prompt, it just notices
  // you and starts trailing. That stops once you can possess it: from then on
  // where it stands is your decision, and an unconditional follower would drag
  // it straight back off anything you deliberately parked it on.
  if (friend.isActive && !friend.isFollowing && !possession.isUnlocked) {
    if (friend.position.distanceTo(camera.position) < 2.6) {
      friend.collect();
      setObjective('Your friend is following you');
    }
  }
  // Prompts only make sense while the mouse is captured, and never during the
  // cutscene or the wake-up — there is no control to act with.
  if (player.isLocked && !cutscene.isPlaying && !wakeUp.isPlaying) interactions.update();
  else showPrompt(null);

  updateFriendLayer();

  // Two passes sharing one depth buffer: the lit room, then the dark one. Each
  // pass only sees its own lights, which is the only way to deny the ambient
  // light to one room while keeping it in the other.
  updateAudioIndicator?.();

  renderer.clear();
  camera.layers.set(LAYER.MAIN);
  renderer.render(scene, camera);
  camera.layers.set(LAYER.DARK);
  renderer.render(scene, camera);
});

// Dev-only handle for poking at the scene from the console.
if (import.meta.env.DEV) {
  window.game = { scene, camera, renderer, room, machine, bucket, friend, door, player, interactions, debugMenu, cutscene, playerBody, medical, wakeUp, possession };
  window.game.__tvLines = TV_LINES;
  // Console handles for diagnosing silence: game.audio.state() / .test()
  window.game.audio = {
    state: audioState,
    test: playTestTone,
    unlock: unlockAudio,
    footstep: () => playFootstep(false),
    door: playDoorClose,
    blip: playObjectiveBlip,
  };
}
