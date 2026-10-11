import * as THREE from 'three';
import { createRoom } from './room.js';
import { createMachine } from './machine.js';
import { createBucket } from './bucket.js';
import { createFriend } from './friend.js';
import { createDoor } from './door.js';
import { createPlayerBody } from './playerBody.js';
import { createMedicalRoom } from './medicalRoom.js';
import { createGauntlet } from './gauntlet.js';
import { createExitRoom } from './exitRoom.js';
import { createOrangeRoom } from './orangeRoom.js';
import { createCorpseHall } from './corpseHall.js';
import { createControlRoom } from './controlRoom.js';
import { createGiantHall } from './giantHall.js';
import { createTallRoom } from './tallRoom.js';
import { createStorageRoom } from './storageRoom.js';
import { createTransferHall } from './transferHall.js';
import { createDeathScreen } from './death.js';
import { createEmployeeDoor } from './employeeDoor.js';
import { paintRoomStripes } from './wallStripes.js';
import {
  MACHINE,
  DOOR,
  BACK_DOOR,
  LAYER,
  SPAWN,
  MEDICAL,
  ROOM,
  BACK_ROOM,
  insideBackRoom,
} from './config.js';
import { createPlayer } from './player.js';
import { validateColliders } from './collision.js';
import { createWallText } from './wallText.js';
import { createInteractions } from './interaction.js';
import { setObjective, showPrompt, showNote } from './hud.js';
import {
  unlockAudio,
  playObjectiveBlip,
  playFootstep,
  playDoorClose,
  audioState,
  audioPlayed,
  playTestTone,
  mountAudioIndicator,
  tapOutput,
  playMeatLunge,
  playScreech,
} from './audio.js';
import { createDebugMenu } from './debug.js';
import { createCutscene } from './cutscene.js';
import { createWakeUp } from './wakeUp.js';
import { createPossession } from './possession.js';
import { createPainter } from './painter.js';
import { createSpeechRunner } from './voice.js';
import { updateWireCurrent } from './wire.js';
import { createSplitHalls } from './splitHalls.js';
import { createCodeLift } from './codeLift.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });

/**
 * How many pixels to actually draw, decided by how fast the machine is drawing
 * them.
 *
 * This used to be `min(devicePixelRatio, 2)` and left there. On a Retina screen
 * that is 2, which is four times the pixels of 1 — and this renderer is fill
 * bound, because it draws the world twice and shades every fragment against
 * every light in it. Four times the pixels is very nearly four times the frame.
 *
 * A fixed number cannot be right, though: 2 is free on one machine and hopeless
 * on the next, and there is no way to know which from here. So it is measured.
 * The loop keeps the last two seconds of frame times and walks this up or down
 * a step at a time to hold 60fps, and the steps are spaced far enough apart —
 * and the thresholds far enough apart from each other — that it settles rather
 * than oscillating between two of them.
 */
const PIXEL_STEPS = [0.6, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2];
let pixelStep = PIXEL_STEPS.indexOf(1);
const applyPixelRatio = () => {
  // A pixel ratio above the display's own buys nothing but pixels.
  renderer.setPixelRatio(Math.min(PIXEL_STEPS[pixelStep], window.devicePixelRatio));
  // setPixelRatio does not resize the buffer on its own; setSize is what makes
  // it take effect, so the two always go together.
  renderer.setSize(window.innerWidth, window.innerHeight);
};
applyPixelRatio();
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

/**
 * The red hall behind the red door, and the thing in it.
 *
 * Given a way to put you both back at the start, because that is the one thing
 * it cannot do for itself: it owns the room and the trap, not your body and not
 * the bucket.
 */
const gauntlet = createGauntlet({
  scene,
  onCaught(who) {
    // Out of the bucket first if you were in it — being ground up while driving
    // it and then still driving it afterwards is not a state anything expects.
    possession.reset();
    possession.unlock();
    const entry = gauntlet.entry;
    player.teleport({ position: entry.player, yaw: entry.yaw, pitch: 0 });
    friend.spawn(entry.friend);
    friend.setFollowing(followWanted);
    showNote(
      who === 'you' ? 'The spikes caught you.' : 'The spikes caught your friend.',
      2.6
    );
    // No objective set here. You have been put back inside the hall, so the
    // room notices you are in it on the very next frame and says so itself —
    // and it is the one that knows which of its lines is due.
  },
});
room.colliders.push(...gauntlet.colliders);

/**
 * What is behind the hall's way out. Handed the doorway the hall cut, so the
 * two halves of that opening cannot end up in different places.
 */
const exitRoom = createExitRoom({ scene, doorway: gauntlet.exit });
room.colliders.push(...exitRoom.colliders);

/**
 * And the orange room past that, with the swing set in it.
 *
 * Handed the far end of the exit room's passage, and the two bodies and the
 * possession, because it is the first room in this game that moves either of
 * them: a rider on a swing is put where the seat is every frame, and which body
 * that is depends on which one you are wearing.
 */
const orangeRoom = createOrangeRoom({
  scene,
  passage: exitRoom.wayOn,
  camera,
  player,
  // The shadow body, because it is the one you see riding: the puzzle has you
  // leave yourself swinging and watch from inside the bucket.
  playerBody,
  friend,
  possession: { get isPossessing() { return possession.isPossessing; } },
});
room.colliders.push(...orangeRoom.colliders);

/**
 * And the hall behind the orange door, which is the first place in here that is
 * not an experiment — just a corridor, the people who tried it before you, and
 * a door at the end that does not open.
 */
const corpseHall = createCorpseHall({ scene, passage: orangeRoom.wayOn, player });
room.colliders.push(...corpseHall.colliders);

/**
 * And the room behind the staff door lying on the floor of it: a console, a
 * chair on its side and a wall of machinery still running.
 *
 * Hung off the hall's own doorway rather than placed, for the reason every room
 * in here is hung off the one before it — the two files cannot then disagree
 * about where the hole in the wall is.
 */
const controlRoom = createControlRoom({ scene, doorway: corpseHall.staffDoor, player });
room.colliders.push(...controlRoom.colliders);

/**
 * And what is through the door he opens for you: the hall, and the tower.
 *
 * The first space in this game that is not built at a person's size. Hung off
 * the control room's own passage, like everything else here is hung off the
 * opening before it.
 */
const giantHall = createGiantHall({
  scene,
  doorway: controlRoom.wayOn,
  player,
  camera,
  // Read live rather than captured: the treads in the room at the top are
  // pressed by standing on them, and either body can be the one standing.
  bodies: () => [player.position, friend.position],
});
room.colliders.push(...giantHall.colliders);

/**
 * And through the far end of that: a shaft seventy-six metres high with the
 * walls full of rectangular openings.
 *
 * Hung off the hall's own way out, like every room in this stretch is hung off
 * the opening before it.
 */
// The window in the room at the top of the hoist is a hole in a wall these
// two rooms share a side of each. It is cut here rather than agreed on:
// the lift owns the opening and the tall room is handed it.
/**
 * The screen you get when something kills you, and the way back off it.
 *
 * Built before the room that uses it, because the room takes it as an
 * argument — and the way back points at that same room, which does not exist
 * yet when this is written. That is fine and it is why `respawn` is a function
 * rather than a value: nothing in it runs until somebody has died, by which
 * time every room in the building has been standing for several minutes.
 *
 * There is exactly one death in the game and it is the meat cube, so the way
 * back is the tall room's own threshold — three metres down the hall from the
 * thing that just ate you, which is a floor at every point in its cycle and is
 * the same spot the debug menu uses for the same reason. The room is wound
 * back with you: the animal goes back to the bottom of its shaft with nothing
 * scripted holding it, and it is waiting in the doorway again when the black
 * lifts.
 */
const death = createDeathScreen({
  onRestart() {
    /**
     * There are two things in this building that kill you now, and they are
     * seventy metres apart.
     *
     * The rule below — back to the tall room's threshold — was written when
     * the meat cube was the only one. Sending somebody who has just been
     * caught by the screen back down to the bottom of a climb they have
     * already done is not a retry, it is the room being taken off them: the
     * chase is thirty seconds long and the climb in front of it is several
     * minutes. So a death during the chase puts you back at the top, in the
     * shed, with the machine off and the racking standing, and you press the
     * button again when you are ready.
     *
     * Asked of the room rather than remembered here, because "was the chase
     * on" is a fact the room owns and a copy of it in this file is a copy
     * that goes stale the first time the chase learns a new way to end.
     */
    /**
     * And a third place, because the chase is now the length of the
     * building rather than the length of one hall.
     *
     * Sending somebody who has been caught in the lift lobby back to the
     * shed is four minutes of ground they have already covered, most of it
     * a climb. The breach is the checkpoint: everything past it winds back
     * and the thing starts again from the hall behind you, which is the
     * same relationship you had with it the first time you came through.
     *
     * Before the shed's branch, because during this stretch both are true
     * — the chase is on *and* you are past the breach — and the nearer of
     * the two is the one that should win.
     */
    const died = player.position;
    /**
     * Caught in the last corridor, which is its own checkpoint.
     *
     * Before the splits branch, for the same reason that one is before the
     * shed's: during this stretch both are true and the nearer should win.
     * What is behind you here is the climb, three junctions and eight arrows
     * — about ninety seconds of ground you have already covered, most of it
     * standing still at a keypad — and the run that killed you is sixteen
     * metres long. Paying for the second with the first is the game over the
     * death screen is supposed not to be.
     */
    if (codeLift.inTheCorridor(died.x, died.z)) {
      storageRoom.scare.reset();
      codeLift.backToTheCar();
      const back = codeLift.atTheCar;
      player.teleport({ position: back.position, yaw: back.yaw, pitch: 0 });
      // Out of sight until you walk out of the car again, which is what arms
      // it: the corridor's own trigger does that and it has just been rewound.
      storageRoom.beast.lurk();
      setObjective('Get to the window');
      return;
    }
    if (splitHalls.contains(died.x, died.z) || codeLift.contains(died.x, died.z)) {
      /**
       * The shot first, and it is not optional.
       *
       * What kills you is the jumpscare, and while it is playing it owns the
       * camera *and* the creature — it puts the thing where the lens wants
       * it every frame. Restarting without winding it back therefore put a
       * beast at the breach for exactly one frame, after which the shot that
       * was still running dragged it back to where it had caught you:
       * measured at seventy-six metres away on a respawn meant to be eleven.
       * The shed's branch gets this for free inside storageRoom.reset; this
       * one has to ask for it, because it must not rewind the shed.
       */
      storageRoom.scare.reset();
      splitHalls.reset();
      codeLift.reset();
      const back = splitHalls.entry;
      player.teleport({ position: back.position, yaw: back.yaw, pitch: 0 });
      storageRoom.beast.restartAt(
        // Twenty metres back up the hall, which measures as about thirteen
        // by the time you have control: it starts at three metres a second
        // and spends the first instants of the restart getting up to speed.
        // Eleven gave a respawn at six and a half, which is a second and a
        // half of grace and reads as being killed by the checkpoint.
        new THREE.Vector3(back.position[0], back.position[1] + 3.2, back.position[2] + 20)
      );
      setObjective('Climb the fall');
      return;
    }

    if (storageRoom.isChasing) {
      storageRoom.reset();
      transferHall.reset();
      const back = storageRoom.entry;
      player.teleport({ position: back.position, yaw: back.yaw, pitch: 0 });
      setObjective('Find the switch');
      return;
    }

    tallRoom.reset();
    const entry = tallRoom.entry;
    player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });

    /**
     * And the bucket goes back to its post at the top of the hoist.
     *
     * Not beside you, which is what every other respawn in a game does and
     * what this one did until now — it left the bucket wherever the death
     * happened to catch it, which after a death at the meat cube is standing
     * in a hall seventy metres below the only room it has any business being
     * in. The puzzle is the bucket working the treads behind the glass while
     * you climb; a run that begins with it loose at the bottom of the shaft
     * begins in a state the puzzle cannot be solved from.
     *
     * `spawn` and not `collect`. Spawn is "alive but not yet trailing
     * anyone", which is exactly right: it waits up there. Collecting it would
     * set it following a body seventy metres down a shaft it cannot climb,
     * and it would spend the rest of the run trying. You pick it up the
     * ordinary way — by arriving.
     *
     * The car goes up with it, and that is not decoration. The car is the
     * floor of that landing when it is at this end, so parking it is what
     * stops the bucket being spawned over an open shaft; it is also simply
     * true, because the way the bucket got up there is that the car carried
     * it. The one other place in this file that puts a body at the top of the
     * hoist does the same thing for the same reason — see scene 15.
     */
    const lift = giantHall.lift;
    lift.parkAtTop();
    /**
     * On the pad it was standing on, and that is the half of "back to its
     * post" this was missing.
     *
     * It used to go to the floor of that room, which sounds like the same
     * place and is not. The stage is 0.6 up and the bucket steps 0.25 for
     * free, so the floor is the one spot up there with a wall between it and
     * the pads — deliberately, that lip is the reason the pads are somewhere
     * you have to get to rather than somewhere you are. Clearing it takes a
     * jump, which the bucket can do; what it cannot do is tell you so.
     *
     * The effect was that the first death after a wall was called ended the
     * room. You come back, climb, reach the handover, press F — and find the
     * bucket on the floor walking into the side of a step it will not take.
     * The wall that is out stays out, which makes it worse: nothing looks
     * broken, the pads are right there lit, and the one thing between you
     * and the rest of the climb is a verb nobody mentioned.
     *
     * So it comes back where it was. `sequence` is the right source rather
     * than which pad is lit, because lit is a fact about this frame and the
     * death may have taken a while: the last press is the wall that is
     * standing out in the next room, and putting the bucket back on that pad
     * is what keeps those two agreeing.
     */
    const { room: top, top: floor } = lift.state;
    const held = lift.board.padAt(lift.board.sequence.at(-1));
    friend.spawn(
      held
        ? new THREE.Vector3(held.x, held.y, held.z)
        : new THREE.Vector3(top.minX + 4.2, floor + 0.05, (top.minZ + top.maxZ) / 2 + 1.4)
    );

    setObjective('Find the way on');
  },
});

const tallRoom = createTallRoom({
  scene,
  doorway: giantHall.wayOn,
  player,
  port: giantHall.lift.port,
  // For the one scene in this building that takes the camera off you and does
  // not give it back.
  camera,
  death,
});
room.colliders.push(...tallRoom.colliders);

/**
 * And behind the two-body door at the top of the hoist: the storage room, and
 * the thing that has been watching you from inside televisions.
 *
 * Hung off the lift room's way on, which is the outside face of that door —
 * so the one is the other's near wall and neither of them owns where it is.
 */
const storageRoom = createStorageRoom({
  scene,
  doorway: giantHall.lift.wayOn,
  player,
  camera,
  death,
  /**
   * The way back shuts when the thing comes out of the wall.
   *
   * Not because a locked door is frightening — because the room has two
   * exits and only one of them is a chase. The door you came in by is nine
   * metres behind you when that screen tears off, and a player who runs for
   * it has solved the set piece by walking out of it. The two-body door is
   * also the one door in this building you cannot open alone, so it shutting
   * costs you nothing you could have used.
   */
  /**
   * How much room the thing has, wherever it has got to.
   *
   * Asked of every room that has an opinion, in the order it meets them.
   * The shed itself is not in the list: it is twenty-six across and ten
   * high and the animal is welcome to all of it, which is what the reveal
   * needs. Everything past it is tighter than the animal and says so, and
   * the animal folds and then crushes to suit. See `cram` in screenBeast.js.
   *
   * A function rather than a value because two of the three rooms it asks
   * do not exist yet on this line — the hall hangs off this room's opening
   * and the corridors hang off the hall's.
   */
  clearance: (x, z) =>
    transferHall.clearance(x, z) ?? codeLift.clearance(x, z) ?? splitHalls.clearance(x, z),
  onChase: () => giantHall.lift.pairDoor.slam(),
  onCalm: () => giantHall.lift.pairDoor.release(),
});
room.colliders.push(...storageRoom.colliders);

/**
 * And through the hole in the corner of it: the hall over the racking.
 *
 * Hung off `wayUp`, which is the transfer opening at the top of the crate
 * stair — so the one is the other's near wall and neither owns where it is.
 * The hall's shutter is what ends the chase, so it is the hall that tells the
 * thing to stop.
 */
const transferHall = createTransferHall({
  scene,
  doorway: storageRoom.wayUp,
  player,
  /**
   * The shutter no longer ends the chase, it delays it.
   *
   * Stopping the thing here was right while this hall was the last room in
   * the building. It is now the fortieth metre of about two hundred, and a
   * pursuer that gives up at the fortieth is a pursuer the rest of the
   * route never meets.
   *
   * Two and four fifths of a second is what the shutter is worth instead,
   * and that number is the lead for the whole rest of the run: the thing is
   * held while you are on the heap, so every second of it is a second of
   * climbing you get for free and about five metres it never gets back. At
   * four and a half the measured gap at the lift was twenty-four metres —
   * two junctions away, which is not a chase. At 2.8 you reach the pad with
   * it in the corridor behind you.
   */
  onSeal: () => storageRoom.beast.holdAt(transferHall.gateZ, 2.8, 'z'),
});
room.colliders.push(...transferHall.colliders);

/**
 * And out of the breach in the far end of it: the collapse, the three splits,
 * and the lift at the end of them.
 *
 * Three files in a chain, each hung off the last one's opening — the shed's
 * transfer hole, the hall's breach, the lobby's lift doors — so no file in the
 * run knows where it is in the world and moving any of them moves everything
 * behind it. The chase ends at the hall's shutter; everything from here on is
 * quiet, and deliberately.
 */
const splitHalls = createSplitHalls({ scene, doorway: transferHall.onward, player });
room.colliders.push(...splitHalls.colliders);

const codeLift = createCodeLift({
  scene,
  doorway: splitHalls.liftDoor,
  player,
  camera,
  /**
   * The doors shut on it, and that is all they do.
   *
   * The car's doorway was meant to be the end of the chase — the first
   * opening in the building too small to fold through, and the eight arrows
   * were its price. It is not, because the thing does not need the car, it
   * needs the shaft, and the shaft is a hole twelve metres straight down to
   * the floor you are going to. So the doors shutting only buy the ride: it
   * is shut out of the car and it goes over the top, which is what you can
   * hear on the roof all the way down.
   *
   * `lurk` and not `stop`, because this is not it giving up. It is it being
   * somewhere you cannot see — see screenBeast.js, which keeps the body and
   * takes the picture away.
   */
  onShut: () => storageRoom.beast.lurk(),
  /**
   * And out of the shaft behind you, once you are clear of the car.
   *
   * With a second and a bit of it getting out, which is not decoration. It
   * arrives five metres behind you and its reach is 1.9, so a player who does
   * the thing every player does when something screams behind them in a
   * corridor — stop and look — was dead in about half a second. Held at the
   * mouth of the lift while it drags itself out of the shaft, the same stop
   * costs you the look and not the run.
   *
   * The hold is the shutter's mechanism and it brings the shutter's sound with
   * it: see `heldUntil` in screenBeast.js, which grinds and screeches on the
   * frame it comes off whatever was holding it. So the lift being torn open is
   * one noise and it coming after you is another, a beat apart, which is the
   * right number of events for what is happening.
   */
  onOut: () => {
    const at = codeLift.atTheShaft;
    storageRoom.beast.restartAt(new THREE.Vector3(at.x, at.y, at.z), at.yaw);
    storageRoom.beast.holdAt(at.z - 1.2, 1.2, 'z', { y: [at.y - 1.0, at.y + 1.0] });
  },
  /**
   * The gap at the end, and it is the hold that does this rather than a stop.
   *
   * A pursuer that is switched off the instant you are through reads as a
   * pursuer that was never really behind you: it stops wherever it happens to
   * be, which in a corridor is the middle of nothing. Held at the wall it
   * keeps coming, arrives, and presses — so the last thing in this building
   * is a thing you are watching fail to fit through a door.
   *
   * The hold is long enough to be permanent at the pace of the six metres it
   * is holding you off; `onWindow` is what actually ends it.
   */
  onSafe: () =>
    storageRoom.beast.holdAt(codeLift.pinchZ, 900, 'z', {
      y: [codeLift.atTheShaft.y - 1.0, codeLift.atTheShaft.y + 1.0],
    }),
  onWindow: () => storageRoom.beast.stop(),
});
room.colliders.push(...codeLift.colliders);

/**
 * Every room has now put its boxes in, so this is the one moment the world is
 * complete and nothing has moved yet.
 *
 * Dev only, and a warning rather than a throw: a bad collider is something to
 * fix, not a reason the game should refuse to start. The rule that earns this
 * is the unknown-field one — a collider carrying a key no reader looks at does
 * not fail, it quietly means something else, which is what `ceiling` was for
 * two days. See collision.js.
 */
if (import.meta.env.DEV) validateColliders(room.colliders);

/**
 * And the wire between the two of them, which is the only thing either room
 * needed the other for.
 *
 * The treads are in the room at the top of the hoist and the walls they run are
 * sixty metres down the other side of that room's window. Neither file knows
 * about the other and neither should: the panel counts presses and hands out a
 * number, the tall room takes a number and runs that wall out, and this line is
 * where the number crosses. It is bound here rather than passed in because the
 * tall room is built after the hoist — it needs the window the hoist owns
 * before it can cut its own side of it — so at the moment the panel is made,
 * the thing it drives does not exist yet.
 */
giantHall.lift.board.wireTo((label) => tallRoom.showWall(label));

/**
 * The staff doors, in five rooms, none of which own them.
 *
 * Placed from here rather than from inside each room because they belong to the
 * building rather than to any one space in it — that is the whole idea of them,
 * and a copy of the same prop built five times inside five files would be five
 * chances for them to drift apart.
 *
 * Every one of these positions was probed against what is already standing
 * there before it was written down. That is not caution for its own sake: these
 * rooms are full, and a door hung by eye on the ward's far wall lands inside a
 * wall fitting, one on the hall's long wall gets a skirting rail across the
 * bottom of it, and neither is visible from where you write the number.
 *
 * The red hall is deliberately not on the list. It is the one room with
 * something that sweeps its whole width, and a door fixed to the wall of it is
 * a door the spike wall passes through.
 */
const STAFF_DOORS = [
  // The room you wake up in, on both long walls — the biggest space in the
  // game, and the one whose walls read as blank without something human on them.
  // standoff: this room has the skirting rail. See createEmployeeDoor.
  { x: -22, z: 6, facing: Math.PI / 2, standoff: 0.1 },
  { x: 22, z: -7, facing: -Math.PI / 2, standoff: 0.1 },
  // The dark room, on the wall opposite the red door. Built into the dark pass
  // like everything else in there; lightUpBackRoom finds it by layer and brings
  // it into the main one when the power comes back.
  { x: 8, z: -26, facing: -Math.PI / 2, dark: true },
  // The ward's far wall — the wall you wake up facing.
  { x: -3.5, z: -52.5, facing: 0 },
  // And the swing room, which is the furthest into the building you get.
  { x: -60.2, z: -25, facing: Math.PI / 2 },
];

// Built and then left alone. They are not registered with the interaction
// system and nothing in the loop touches them: a staff door is a thing on a
// wall, the same as the poster and the paint tin's shelf.
for (const { dark, ...where } of STAFF_DOORS) {
  const door = createEmployeeDoor({ scene, ...where });
  if (dark) door.group.traverse((object) => object.layers.set(LAYER.DARK));
}

/**
 * And the stripe, round every room in the building that has no colour of its
 * own. The red hall and the orange room are left alone — they already say what
 * they are.
 *
 * Bounds only. Where the wall is and what is already fixed to it are read off
 * the scene when the paint goes on, which is why a corridor that turns a corner
 * and a store room with half a near wall can both be given as plain rectangles.
 * See wallStripes.js.
 *
 * Painted last, after every room and prop exists, because it paints round
 * whatever it finds. The bodies are excluded by hand: they are the only things
 * in the scene that will not still be there in a minute, and the bucket happens
 * to start its life against a wall.
 */
const NOT_FIXTURES = [friend.mesh, playerBody.group, bucket.group];
for (const room of [
  // The room you wake up in. Its own height is 22m and the band is capped well
  // under that — see HIGHEST in wallStripes.js.
  { minX: -22, maxX: 22, minZ: -21, maxZ: 21, height: ROOM.height },
  // The dark room behind it. On the dark layer with everything else in there
  // until the power comes back; lightUpBackRoom finds it by layer.
  { minX: -8, maxX: 8, minZ: -39, maxZ: -21, height: BACK_ROOM.height, dark: true },
  // The ward you wake up in, the corridor behind its back wall, and the store
  // room the corridor turns into. The corridor and the store are one space and
  // share a ceiling.
  { minX: -5, maxX: 8, minZ: -52.5, maxZ: -41.5, height: MEDICAL.height },
  { minX: 2, maxX: 8, minZ: -41.5, maxZ: -39, height: 3.4 },
  { minX: 8, maxX: 13.9, minZ: -41.5, maxZ: -37.4, height: 3.4 },
  // The hall behind the orange door. It gets the line like every other
  // uncoloured room, and here it does something the others do not: it leads all
  // the way down the wall to a door nobody got through.
  { minX: -55.65, maxX: -52.75, minZ: -15.2, maxZ: 1.8, height: 2.9 },
  // The control room behind the staff door in that hall is deliberately not on
  // this list, and it is the first room to be left off for a reason other than
  // having a colour of its own.
  //
  // The band is wayfinding. It is painted for people being moved through a
  // building, and the whole point of the door it is behind is that they are not
  // meant to go through it — so the paint stopping at that doorway is the line
  // doing its job. It was painted in there first and it also simply looked
  // wrong: a machine room lit by one screen, with the brightest thing in it a
  // decorative purple-green-blue band across the plant.
  // And the room at the end with the television in it. Measured off the room
  // rather than worked out from the hall: the doorway the hall hands over is at
  // the far side of a 2.6m passage, so the room starts at -50.6 and not at the
  // hall's end wall, and its far wall — the one the television is on — is at
  // -57.8. Guessing this put the paint 2.6m into the passage at one end and
  // stopped it short of the television's wall at the other.
  { minX: -57.8, maxX: -50.6, minZ: -39.4, maxZ: -31.4, height: 4.2 },
]) {
  const { dark, ...bounds } = room;
  const painted = paintRoomStripes({ scene, ignore: NOT_FIXTURES, ...bounds });
  if (dark) painted.group.traverse((object) => object.layers.set(LAYER.DARK));
}

const interactions = createInteractions(camera, showPrompt);
for (const target of gauntlet.interactions) interactions.add(target);
for (const target of exitRoom.interactions) interactions.add(target);
for (const target of orangeRoom.interactions) interactions.add(target);
// One target: the switch that brings the set in the control room up.
for (const target of controlRoom.interactions) interactions.add(target);
// And one the player can never reach: the lever on the hoist behind the
// rockfall, which is on the far side of a hole only the bucket fits through.
for (const target of giantHall.interactions) interactions.add(target);
for (const target of storageRoom.interactions) interactions.add(target);
for (const target of codeLift.interactions) interactions.add(target);

/**
 * What you think, turning round and finding the way you came in is shut.
 *
 * Silent lines: subtitles with no voice behind them. The television is the only
 * thing in this game that speaks, and it should stay that way — you get text.
 */
const OPENING_LINES = [
  { text: 'Why is the door locked?', hold: 2.2, silent: true },
  { text: 'Well… I guess I should find a way out.', hold: 2.8, silent: true },
  { text: 'I’ll start by checking out that machine.', hold: 3.0, silent: true },
];
const monologue = createSpeechRunner();

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

const painter = createPainter({ player });

/**
 * The tin in the back room. Unlike everything else here this one is not spent
 * by using it — you can come back and change your mind — so `once` is off.
 *
 * Gated on the room having its power back, which is also the only time you can
 * see the tin. Offering it in act one would put a prompt on an object sitting
 * in a room the whole point of which is that it is empty and black.
 */
interactions.add({
  position: room.paintAnchor,
  label: 'Paint your friend',
  range: 2.4,
  once: false,
  enabled: () => room.backRoomIsLit && !painter.isOpen,
  onInteract: () => painter.open(),
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
  // Once the back room's power is on it is drawn in the main pass like anywhere
  // else, and nothing standing in it should be moved out of that pass.
  const inDark = !room.backRoomIsLit && insideBackRoom(friend.position.x, friend.position.z);
  const layer = inDark ? LAYER.DARK : LAYER.MAIN;
  if (layer === friendLayer) return;
  friendLayer = layer;
  friend.mesh.traverse((object) => object.layers.set(layer));
}

/**
 * Whether you want the bucket at your heels. G toggles it.
 *
 * A separate thing from whether it is following *right now*, which is what
 * friend.isFollowing says. Being taken over stops it following without meaning
 * you no longer want it to, and so does a respawn; this survives both, so
 * stepping out of the bucket returns it to whichever you last asked for rather
 * than to a default.
 */
let followWanted = true;

window.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyG' || event.repeat) return;
  if (/^(INPUT|TEXTAREA)$/.test(event.target?.tagName ?? '')) return;
  // The map editor binds G to its own snap toggle, and it is open exactly when
  // the pointer is not captured. Without this the two fire together.
  if (!player.isLocked) return;
  if (!friend.isActive) return;

  followWanted = !followWanted;

  // Set unconditionally, including mid-possession. Driving takes priority over
  // following inside friend.update, so while you are in the bucket this changes
  // nothing you can see — it is what it does when you step back out. Guarding
  // it on `!isPossessing` meant telling it to wait from inside it did nothing
  // at all, and it trailed off after you the moment you left.
  friend.setFollowing(followWanted);

  showNote(
    followWanted
      ? 'Your friend is following you'
      : possession.isPossessing
        ? 'Your friend will wait when you leave it'
        : 'Your friend is waiting here'
  );
});

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

/** And what it says when the button goes in. */
const BUTTON_LINES = [{ text: 'Good. Now go back to your body.', hold: 2.4 }];

/**
 * The brief, delivered as the way out swings open. The last thing it says
 * before it goes dark — everything after this is the wire.
 */
const DOOR_LINES = [
  { text: 'Great! I knew you were capable!', hold: 2.0 },
  { text: 'Now I need your help.', hold: 1.7 },
  { text: 'I know you want out of here, and I can give you that.', hold: 2.9 },
  { text: 'When this place was abandoned, I was cut off from my main console.', hold: 3.4 },
  { text: 'I need you to follow this black wire from console to console.', hold: 3.1 },
  { text: 'Get me back to the main one, and I can get you out.', hold: 2.9 },
  { text: 'I’ll see you when you activate the next console.', hold: 2.8 },
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
  // Off the death screen first. Every jump below is a way out of wherever you
  // are, and "wherever you are" includes dead.
  death.clear();
  cutscene.reset();
  wakeUp.reset();
  possession.reset();
  medical.stopSpeaking();
  // The second act un-happens too, or every scene you jump to afterwards plays
  // out with the doors open and the back room lit — including the ones whose
  // whole point is that neither is true yet.
  medical.reset();
  room.darkenBackRoom();
  // The hall through the red door is part of that same second act — it has no
  // power until the ward's console gives the back room its own — so it winds
  // back with it, shutters down and the wall parked by the door.
  gauntlet.powerDown();
  exitRoom.powerDown();
  // And the two rooms past it. The swing set in particular has to come back:
  // the entry for the hall behind it opens its door for you, and without this
  // the next jump to the swing room would find the puzzle already spent.
  orangeRoom.reset();
  corpseHall.reset();
  controlRoom.reset();
  giantHall.reset();
  tallRoom.reset();
  storageRoom.reset();
  transferHall.reset();
  splitHalls.reset();
  codeLift.reset();
  handoverSaid = false;
  // The loop fires the cutscene the moment a door that has been open closes.
  // Clearing this stops a jump from immediately retriggering it underneath you.
  doorHasOpened = false;
  player.setEnabled(true);
}

/**
 * Everything that has to have happened before the tall room is a room you can
 * be in, with nothing about *where* in it you end up.
 *
 * Pulled out of the thirteenth scene because the holes below are twenty more
 * ways into the same room, and twenty copies of this list is twenty chances
 * for one of them to drift.
 */
function reachTheTallRoom() {
  resetSequences();
  medical.openDoor();
  medical.shutDown();
  room.lightUpBackRoom();
  gauntlet.powerUp();
  exitRoom.powerUp();
  possession.unlock();
  orangeRoom.solve();
  // The bucket waits in the hall. There is nothing in here it could help with
  // and nothing in here it could reach, and a room whose whole effect is that
  // you are the only thing in it standing on the floor is a room to be in on
  // your own.
  const hall = giantHall.entry;
  friend.spawn(new THREE.Vector3(hall.position[0], 0, hall.position[2]));
  friend.collect();
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
  {
    label: '6 · Out the other side',
    hint: 'Past the button: doors open, the console dead, back in the dark room with the lights on',
    go() {
      resetSequences();

      // Everything the button sets off, without the button. Order matters only
      // in that openDoor also marks the console pressed, so the shelf behind
      // you is spent and cannot start the speech again.
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();

      // You are back in your own body by this point, but still connected to the
      // bucket — that never gets taken away — so the mechanic has to be live or
      // it is simply missing from everything after here.
      possession.unlock();

      // Just inside the corridor doorway, facing down the room: the sign is on
      // the wall behind your shoulder and the red door it points at is ahead
      // and to your right. Right, not left — facing +z your right hand is -x,
      // and the door is at x = -8. The sign's arrow points at the reader's left
      // because you read it facing the other way. Same fact, two descriptions,
      // and mixing them up is what put the door in the wrong wall the first time.
      player.teleport({ position: [BACK_DOOR.x, 0, BACK_DOOR.z + 1.4], yaw: Math.PI, pitch: 0 });
      friend.spawn(new THREE.Vector3(BACK_DOOR.x - 1.1, 0, BACK_DOOR.z + 1.9));
      friend.collect();

      setObjective('Follow the black wire');
    },
  },
  {
    label: '7 · The red hall',
    hint: 'Through the red door, at the top of the hall, with the trap not yet armed',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();

      // Both of you inside and facing down the hall. Not on opposite sides of
      // the divider — it does not start until five metres in, so the bucket
      // walks straight over to you the moment it is following. Getting it into
      // the other lane is the first thing the room asks of you and is not
      // something the debug menu should do for you.
      const entry = gauntlet.entry;
      player.teleport({ position: entry.player, yaw: entry.yaw, pitch: 0 });
      friend.spawn(entry.friend);
      friend.collect();

      setObjective('Get to the end of the hall');
    },
  },
  {
    label: '8 · The room behind the hall',
    hint: 'Through the way out, with the button and the console',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();

      // Standing just inside it, facing the console at the far end. The hall
      // behind is left exactly as it was: getting here is what the hall is for,
      // and a menu entry that also solved it would make that impossible to see.
      const way = gauntlet.exit;
      player.teleport({ position: [way.x - 1.4, 0, way.z], yaw: Math.PI / 2, pitch: 0 });
      friend.spawn(new THREE.Vector3(way.x - 1.4, 0, way.z + 1.2));
      friend.collect();

      setObjective('See what is in here');
    },
  },
  {
    label: '9 · The swing room',
    hint: 'Through the orange door, both of you in it, puzzle unsolved',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();

      // Unsolved on purpose, the same as the hall entry leaves the hall alone.
      // This room is the only two-body puzzle in the game and the thing worth
      // testing about it is playing it; a menu entry that also solved it would
      // put the one interesting state out of reach.
      const way = exitRoom.wayOn;
      player.teleport({ position: [way.x, 0, way.z + 1.6], yaw: Math.PI, pitch: 0 });
      friend.spawn(new THREE.Vector3(way.x + 1.1, 0, way.z + 1.9));
      friend.collect();

      setObjective('Get on a swing');
    },
  },
  {
    label: '10 · The hall of bodies',
    hint: 'Behind the orange door, which this opens for you — the yellow door and the pile',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();

      // This one does solve the swings, and has to: the way in behind you is
      // the orange door, and dropped into the hall with it still shut you are
      // in a corridor with a heap at one end and a wall at the other. Every
      // other entry leaves the room before it as it was, because in every other
      // case you can walk back out.
      orangeRoom.solve();

      const entry = corpseHall.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      friend.spawn(new THREE.Vector3(entry.position[0] + 0.9, 0, entry.position[2] - 0.8));
      friend.collect();

      setObjective('Get to the end of the hall');
    },
  },
  {
    label: '11 · The control room',
    hint: 'Through the staff door in the hall — the console and the machinery',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();
      // Same reason as the hall: the only way out of this room is back through
      // the hall and out of the orange door, so that door has to be open.
      orangeRoom.solve();

      const entry = controlRoom.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      // The bucket stays out in the hall. It can follow you in — the doorway is
      // wide enough — but dropped into a room this full it starts its life
      // inside the console.
      const hall = corpseHall.entry;
      friend.spawn(new THREE.Vector3(hall.position[0], 0, hall.position[2]));
      friend.collect();

      setObjective('See what is in here');
    },
  },
  {
    label: '12 · The giant hall',
    hint: 'Through the door he opens — the long hall behind it',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();
      orangeRoom.solve();

      const entry = giantHall.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      // And the bucket comes in with you. It was left back in the hall of
      // bodies while there was a tower in here, because it jumps lower than you
      // do and could not have followed you up it. There is nothing to climb any
      // more and nothing on the floor to wedge it on, so it comes along.
      friend.spawn(new THREE.Vector3(entry.position[0] - 1.4, 0, entry.position[2] + 0.8));
      friend.collect();

      setObjective('Get to the far end');
    },
  },
  {
    label: '13 · The tall room',
    hint: 'Through the end of the long hall — the shaft with the holes in it',
    go() {
      reachTheTallRoom();
      const entry = tallRoom.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      setObjective('Find the way on');
    },
  },
  {
    label: '14 · The hoist',
    hint: 'Behind the rockfall — the lift only the bucket can get to',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();
      orangeRoom.solve();

      // Straight into the chamber, which is the one place in the game you
      // cannot walk to — the way in is a gap in a heap of rock that is too
      // short for you. Being put in here is the only way to look at it, and
      // being able to look at it is the whole reason this entry exists.
      const { chamber } = giantHall.collapse;
      const { shaft } = giantHall.lift.state;
      player.teleport({ position: [chamber.minX + 1.1, 0, chamber.minZ + 0.9], yaw: -Math.PI / 2 });
      // And the bucket on the platform, because it is the only thing that can
      // drive it. Press F and the lever is in front of you.
      friend.spawn(
        new THREE.Vector3((shaft.minX + shaft.maxX) / 2, 0.2, (shaft.minZ + shaft.maxZ) / 2)
      );
      friend.collect();

      setObjective('Take the bucket up');
    },
  },
  {
    label: '15 · Top of the hoist',
    hint: 'The room at the top of the tower, with the window down into it',
    go() {
      resetSequences();
      medical.openDoor();
      medical.shutDown();
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      possession.unlock();
      orangeRoom.solve();

      // The car has to be up here too. It is the floor of the landing when it
      // is at this end, and an entry that drops you in the room with the lift
      // still at the bottom is an entry that opens with a hole in the floor.
      const lift = giantHall.lift;
      lift.parkAtTop();

      // Facing the window, because the window is the only reason to be in this
      // room — see liftTower.js. Yaw +PI/2 is -x in this game, and -x is the
      // wall the glass is in.
      const { room: top, top: floor } = lift.state;
      const midZ = (top.minZ + top.maxZ) / 2;
      player.teleport({ position: [top.minX + 4.2, floor, midZ], yaw: Math.PI / 2, pitch: 0 });

      // And the bucket beside you, since it is the one that is meant to be up
      // here and the one you will want to walk to the glass.
      friend.spawn(new THREE.Vector3(top.minX + 4.2, floor + 0.05, midZ + 1.4));
      friend.collect();

      setObjective('Look out of the window');
    },
  },
  {
    label: '16 · Storage',
    hint: 'Behind the two-body door at the top: racking, and the thing on the screens',
    go() {
      reachTheTallRoom();
      // Both of you through, because the door that gets you in here needs the
      // two of you and a jump that put you behind it on your own would be a
      // jump into a room you could not have reached.
      const lift = giantHall.lift;
      lift.parkAtTop();
      const entry = storageRoom.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      const { room: top, top: floor } = lift.state;
      friend.spawn(new THREE.Vector3(top.maxX - 2.0, floor + 0.05, (top.minZ + top.maxZ) / 2));
      setObjective('Find the switch');
    },
  },
  {
    label: '17 · Out of the wall',
    hint: 'The machine on, the last line said, and the thing coming down the shed',
    go() {
      reachTheTallRoom();
      const lift = giantHall.lift;
      lift.parkAtTop();
      const stair = storageRoom.atTheStair;
      player.teleport({ position: stair.position, yaw: stair.yaw, pitch: 0 });
      const { room: top, top: floor } = lift.state;
      friend.spawn(new THREE.Vector3(top.maxX - 2.0, floor + 0.05, (top.minZ + top.maxZ) / 2));
      // Straight past the speech. This jump exists to look at the chase, and
      // twenty seconds of dialogue before it can start is twenty seconds of
      // nothing every time somebody wants to see the thing move.
      storageRoom.skipToChase();
      setObjective('Get to the crates');
    },
  },
  {
    label: '18 · The transfer hall',
    hint: 'Through the hole over the racking, with the run still ahead of you',
    go() {
      reachTheTallRoom();
      giantHall.lift.parkAtTop();
      const entry = transferHall.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      setObjective('Keep going');
    },
  },
  {
    label: '19 · The fall',
    hint: 'Past the shutter, at the foot of the heap you have to climb',
    go() {
      pastTheChase();
      const entry = splitHalls.entry;
      player.teleport({ position: entry.position, yaw: entry.yaw, pitch: 0 });
      setObjective('Climb the fall');
    },
  },
  {
    label: '20 · The splits',
    hint: 'Up on the deck, in the mouth of the first junction',
    go() {
      pastTheChase();
      const at = splitHalls.atTheFirstSplit;
      player.teleport({ position: at.position, yaw: at.yaw, pitch: 0 });
      setObjective('Find the way on');
    },
  },
  {
    label: '21 · The lift',
    hint: 'In the car, with eight arrows to put in and no floors to pick from',
    go() {
      pastTheChase();
      const at = codeLift.entry;
      player.teleport({ position: at.position, yaw: at.yaw, pitch: 0 });
      setObjective('Work the pad');
    },
  },
  {
    label: '22 · The window',
    hint: 'Out of the lift at the bottom, looking down the last corridor',
    go() {
      pastTheChase();
      codeLift.sendDown();
      const at = codeLift.atTheWindow;
      player.teleport({ position: at.position, yaw: at.yaw, pitch: 0 });
      setObjective('Get to the window');
    },
  },
];

/**
 * Everything that has to have happened before the far end of the building is
 * somewhere you can be, with nothing about where in it you end up.
 *
 * The same idea as reachTheTallRoom and for the same reason: four of the jumps
 * above land past the chase, and four copies of the list that gets you there
 * is four chances for one of them to drift.
 *
 * **It deliberately does not run the chase.** The first cut called
 * skipToChase and then stopped the thing, on the theory that a jump to the
 * far end should reproduce the world state a player would arrive in. It
 * reproduced one more thing than that: the shed's own screen is still
 * working through its lines when the jump lands, so every one of these
 * scenes opened with "Run." sitting under it, and the beast's music started
 * somewhere behind a sealed shutter. Nothing past the hall depends on any of
 * it — the corridors are geometry and the lift is a lock — so the honest
 * setup for "look at the far end of the building" is to not have had a chase
 * at all.
 */
function pastTheChase() {
  reachTheTallRoom();
  giantHall.lift.parkAtTop();
}

/**
 * And every hole in the tall room, which is a different kind of jump.
 *
 * The scenes above are beats — fifteen places the story is at, each one
 * setting up a world state before it puts you anywhere. These are twenty
 * places a body can be, all inside one of them, and they exist because of
 * what the holes are: the only openings in that room you fit through, the
 * only cover it has, and the three handovers the whole climb turns on. The
 * question you most often want answered about one is whether you can get
 * into it and what you can see from inside — and the honest way to ask that
 * was a seventy metre climb with an animal in the shaft.
 *
 * Sorted up the room rather than by wall, because that is the order you meet
 * them in and the order the climb is in. Marked `✦` where it is a handover:
 * three of the twenty are the shelters, and those are the ones worth jumping
 * to twice.
 *
 * Built once at startup. The geometry is cut when the room is built and never
 * moves — what moves is the platforms, and none of these are platforms.
 */
const HOLES = tallRoom.refuges
  .sort((a, b) => a.y - b.y || a.wall - b.wall)
  .map((hole) => ({
    label: `${hole.shelter ? '✦' : ''}${hole.wall}·${hole.y.toFixed(1)}`,
    hint: hole.shelter
      ? `Handover shelter, wall ${hole.wall} at ${hole.y} — the plate is out the front`
      : `Refuge, wall ${hole.wall} at ${hole.y}`,
    go() {
      reachTheTallRoom();
      // Standing in it facing out, which is the way you end up after backing
      // into one — and the only way round that lets you see what is coming.
      player.teleport({ position: [hole.x, hole.y, hole.z], yaw: hole.yaw, pitch: 0 });
      setObjective('Find the way on');
    },
  }));

const debugMenu = createDebugMenu({
  scenes: SCENES,
  spots: HOLES,
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
    monologue.play(OPENING_LINES);
  });
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // Through applyPixelRatio rather than setSize directly, or a resize quietly
  // undoes whatever the tuner had settled on.
  applyPixelRatio();
});

// Dev-only readout in the corner: whether audio is alive, and whether sounds
// are actually reaching it.
const updateAudioIndicator = import.meta.env.DEV ? mountAudioIndicator() : null;

let lastTime = performance.now();

/**
 * Walks the pixel ratio toward whatever this machine can hold at 60fps.
 *
 * Judged on a two-second average rather than on single frames, because one slow
 * frame is a shader compiling or a garbage collection and is no evidence about
 * anything. The two thresholds are far apart on purpose: it steps down above
 * 20ms a frame and up only below 12, so the ratio it settles on is comfortably
 * inside both and there is no value that is simultaneously too slow to keep and
 * fast enough to go back to.
 *
 * Frames are also thrown away for a moment after a change, so the resize itself
 * — which reallocates every buffer — is never the thing being measured.
 */
const TUNE_WINDOW = 2;
let tuneClock = 0;
let tuneFrames = 0;
let tuneSettle = 0;

function tuneResolution(delta) {
  if (tuneSettle > 0) {
    tuneSettle -= delta;
    tuneClock = 0;
    tuneFrames = 0;
    return;
  }
  tuneClock += delta;
  tuneFrames++;
  if (tuneClock < TUNE_WINDOW) return;

  const ms = (tuneClock * 1000) / tuneFrames;
  tuneClock = 0;
  tuneFrames = 0;

  const want = ms > 20 ? -1 : ms < 12 ? 1 : 0;
  if (want === 0) return;
  const next = Math.max(0, Math.min(PIXEL_STEPS.length - 1, pixelStep + want));
  // Already at the end of what it can do, or at the display's own ratio, in
  // which case going up would allocate more pixels than the screen has.
  if (next === pixelStep) return;
  if (want > 0 && PIXEL_STEPS[pixelStep] >= window.devicePixelRatio) return;

  pixelStep = next;
  applyPixelRatio();
  tuneSettle = 0.7;
}

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

  tuneResolution(delta);

  debugMenu.update(delta);
  monologue.update(delta);
  player.update(delta);
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

  /**
   * The two rooms where the bucket is a thing you drive and not a thing that
   * trails you.
   *
   * Both of them are built out of it being somewhere you are not. The red
   * hall is two lanes with a barred divider down the middle and each of you
   * holding the key to the other's; the room at the top of the hoist is four
   * pads over a seventy-two metre drop, driving a room the bucket cannot go
   * into. In both, "walk towards the player" is not help — it is the room
   * undoing itself, and the bucket does it through no decision you made.
   *
   * Two things come off it in here, and they are the same rule twice.
   *
   * The rescue, first: a bucket that cannot reach you normally means it is
   * wedged and wants teleporting to your feet, and in these two it means the
   * room is working. On the pads it is worse than that — four seconds
   * stranded and it is on the ground floor, where the only way back up is
   * the hoist it came up on.
   *
   * And the following. `setDriven` leaves it alone on purpose, so stepping
   * out of the bucket sets it off after you again, which is right wherever
   * you are both standing on the same floor. In here it walked off the pads
   * after a body seventy metres below — across every pad between it and the
   * stairs, calling each of those walls on the way — and in the red hall it
   * paced you down its own lane whether or not that was what you wanted of
   * it. Now it stays where you put it in both, and getting it where it needs
   * to be is the errand.
   *
   * Gated once, here, and read again further down where a bucket within
   * arm's reach gets picked back up: without that the two would fight, one
   * setting the flag each frame and the other clearing it.
   */
  const driveOnly =
    gauntlet.contains(friend.position.x, friend.position.z) ||
    giantHall.lift.holds(friend.position);
  friend.setRecallAllowed(!driveOnly);
  if (driveOnly && friend.isFollowing) friend.setFollowing(false);
  friend.update(delta, camera, camera.position, room.colliders);
  // After the friend has moved, so the plates read where it is now, and given
  // the *body's* position rather than the camera's — while you are driving the
  // bucket the camera is in the other lane and the thing the spikes are walking
  // toward is standing still where you left it.
  gauntlet.update(delta, player.position, friend);
  exitRoom.update(delta, player.position);
  // The black wire runs through four of these rooms and belongs to none of
  // them, so the charge in it is driven from here rather than from whichever
  // room happens to have switched it on. It costs nothing while it is off.
  updateWireCurrent(delta);
  // Only the bucket can get up there, but the check is on position rather than
  // on identity — whatever ends up on the top board presses it. It latches, so
  // this is true on exactly one frame ever.
  if (friend.isActive && medical.tryPressButton(friend.position, friend.isGrounded)) {
    medical.speak(BUTTON_LINES, () => {
      // It said the door would open. It opens, and it talks over the swing.
      medical.openDoor();
      // And the room past it comes back on. That room is the one you were
      // taken in — it is the same room, not one built to look like it — so
      // this is the ward's power reaching the far side of the building, and
      // the reason you can walk back into somewhere you have only ever seen
      // one lit circle of.
      room.lightUpBackRoom();
      gauntlet.powerUp();
      exitRoom.powerUp();
      setObjective('Press F to return to your body');
      medical.speak(DOOR_LINES, () => {
        // Then it goes dark and takes its arms back, and the wire is all that
        // is left pointing anywhere.
        medical.shutDown();
        setObjective('Follow the black wire');
      });
    });
  }
  // Before the camera is written, and after both bodies have had their own
  // update: a rider on a swing is put where the seat is, and if that is the
  // bucket then the view below has to be taken from where it has just been put.
  orangeRoom.update(delta);
  corpseHall.update(delta);
  controlRoom.update(delta);
  giantHall.update(delta);
  tallRoom.update(delta);
  storageRoom.update(delta);
  // After the room the chase starts in, because the shutter in here is what
  // stops the thing that room let out and a frame's lag on that is a frame of
  // it standing inside a closed shutter.
  transferHall.update(delta);
  splitHalls.update(delta);
  // After the halls it hangs off, so a frame in which you step out of the car
  // is a frame the corridor under it has already had.
  codeLift.update(delta);
  // After the room that raises it. The screen's own clock is only the beat it
  // waits before it will take a key — see death.js — and that beat starts on
  // the frame the room puts it up.
  death.update(delta);
  // After that, not before it, and for the same reason the view is: the shadow
  // body is drawn where the player is, and on a swing the player is wherever
  // the room has just put them. Updated ahead of the rooms it lagged a frame
  // behind the body it belongs to, which on the fastest part of an arc is the
  // best part of a foot.
  playerBody.update(delta, player.pose);
  // The view has to be written after the body it is attached to has moved, or
  // it trails a frame behind everything you do.
  possession.applyCamera();

  // Walking up to it is what "collecting" means — no prompt, it just notices
  // you and starts trailing. It does not stop on its own again: it used to be
  // dropped as soon as you could possess it, on the reasoning that where it
  // stands then becomes your decision, and the result was that every time you
  // stepped out of it you left it behind and had to go back for it.
  //
  // Making that decision is now G's job, and `followWanted` is what it sets.
  // Without it this would pick the bucket straight back up the moment you told
  // it to wait and then stood next to it.
  if (friend.isActive && followWanted && !friend.isFollowing && !driveOnly) {
    if (friend.position.distanceTo(camera.position) < 2.6) {
      friend.collect();
      setObjective('Your friend is following you');
    }
  }
  // Prompts only make sense while the mouse is captured, and never during the
  // cutscene or the wake-up — there is no control to act with.
  if (player.isLocked && !cutscene.isPlaying && !wakeUp.isPlaying && !death.isShowing)
    interactions.update();
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
  window.game = { scene, camera, renderer, room, machine, bucket, friend, door, player, interactions, debugMenu, cutscene, playerBody, medical, gauntlet, exitRoom, orangeRoom, corpseHall, controlRoom, giantHall, tallRoom, storageRoom, transferHall, splitHalls, codeLift, wakeUp, possession, painter, monologue, death };
  window.game.__tvLines = TV_LINES;
  /**
   * The scene jumps, so a harness can walk all fifteen of them.
   *
   * The debug panel already renders this list; exposing it means the jumps
   * can be driven without clicking, which is what `npm run check:scenes`
   * does. Every one of them runs `resetSequences`, and that is a
   * hand-maintained list of every stateful module in the game — correct
   * today, and exactly the sort of list that goes quietly out of date when a
   * room is added.
   */
  window.game.__scenes = SCENES;
  // The library itself, so a harness can raycast the scene and name what it
  // hit. Everything else on this handle is a thing the game built; this is
  // the one entry that is just a way to ask questions about them.
  window.game.__three = THREE;
  // Console handles for diagnosing silence: game.audio.state() / .test()
  window.game.perf = () => ({
    pixelRatio: renderer.getPixelRatio(),
    step: `${pixelStep + 1} of ${PIXEL_STEPS.length}`,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs.length,
  });
  window.game.audio = {
    played: audioPlayed,
    state: audioState,
    test: playTestTone,
    unlock: unlockAudio,
    footstep: () => playFootstep(false),
    door: playDoorClose,
    blip: playObjectiveBlip,
    // Measuring what the mix peaks at, rather than adding up the gains in the
    // source and hoping. See tapOutput.
    tap: tapOutput,
    // The jumpscare's two voices, so they can be fired and measured without
    // having to be eaten first.
    lunge: playMeatLunge,
    screech: playScreech,
  };
}
