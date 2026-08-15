import * as THREE from 'three';
import { DOOR, LAYER } from './config.js';
import { makeWornPaintSurface } from './textures.js';
import { playDoorClose } from './audio.js';

/**
 * The door in the far wall — and the one thing in the building that isn't
 * poured concrete or industrial steel. It's the door to a children's soft play
 * room: rounded, padded plastic with a porthole, except nobody has cleaned or
 * repaired it in a very long time. The paint is sun-faded and filthy, a pad has
 * come off its bolts, the acrylic has gone yellow, and the handle hangs off one
 * fixing.
 *
 * It starts shut and only rises once the machine has produced something.
 *
 * Sliding it rather than scaling it: this panel is big enough that stretching
 * the geometry would visibly smear the panels down the door.
 */
const TRAVEL = DOOR.height + 0.1;

/** Metres of door per tile of the wear overlay. */
const WEAR_TILE = 1.4;

/** How close to shut counts as landed in the frame. */
const SEATED = 0.04;

// Faded rather than bright: every colour pulled toward grey and darkened, as
// cheap moulded plastic goes when it's left for years in the damp.
const PLAY = {
  door: '#43708c',
  red: '#96504a',
  yellow: '#a89552',
  green: '#5a7f57',
  orange: '#9d7448',
  cream: '#a9a496',
  glass: '#9d9a7c',
  rust: '#6b4326',
};

/** Rounded rectangle outline, for the chunky soft-play look. */
function roundedShape(width, height, radius) {
  const w = width / 2;
  const h = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  return shape;
}

/**
 * A rounded slab with a bevelled edge. The bevel is what sells "padded" —
 * a hard-edged extrusion just reads as a coloured box.
 */
function padded(width, height, radius, depth, color, wear) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(width, height, radius), {
    depth,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.025,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -depth / 2);

  const material = new THREE.MeshStandardMaterial({
    // The wear overlay is greyscale, so this multiplies through it — the paint
    // colour and the grime come from different places and can be tuned apart.
    ...wear,
    color,
    metalness: 0.02,
  });
  // Barely any self-illumination now. The bright version glowed to stay
  // cheerful across a dim room; a derelict one should be lit by the room and
  // no more than that.
  material.emissive = new THREE.Color(color).multiplyScalar(0.05);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createDoor(scene) {
  const group = new THREE.Group();
  const width = DOOR.width - 0.06;
  const height = DOOR.height;

  // One shared wear overlay. ExtrudeGeometry's UVs are in world units, so a
  // single repeat gives every part of the door the same grime density without
  // needing a texture each.
  const wear = makeWornPaintSurface(1 / WEAR_TILE, 1 / WEAR_TILE);

  // Main leaf.
  const leaf = padded(width, height, 0.22, 0.16, PLAY.door, wear);
  group.add(leaf);

  // Porthole: a fat ring with acrylic gone yellow and opaque behind it.
  const ringY = height / 2 - 0.95;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.1, 12, 28),
    new THREE.MeshStandardMaterial({
      color: PLAY.yellow,
      roughness: 0.62,
      metalness: 0.02,
      emissive: new THREE.Color(PLAY.yellow).multiplyScalar(0.05),
    })
  );
  ring.position.set(0, ringY, 0.1);
  ring.castShadow = true;
  group.add(ring);

  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.44, 28),
    new THREE.MeshStandardMaterial({
      color: PLAY.glass,
      roughness: 0.7,
      metalness: 0,
      transparent: true,
      // Barely see-through any more. Years of scratches and nicotine-coloured
      // haze, so it hides the dark room rather than revealing it.
      opacity: 0.92,
    })
  );
  glass.position.set(0, ringY, 0.11);
  group.add(glass);

  // The pads. One has come off — only its bolt holes and a clean patch of
  // unfaded paint are left, which says more about the age than dirt alone.
  const pads = [
    [-0.5, -0.42, PLAY.red],
    [0.5, -0.42, PLAY.green],
    [-0.5, -1.22, PLAY.orange],
  ];
  for (const [x, y, color] of pads) {
    const pad = padded(0.8, 0.66, 0.16, 0.06, color, wear);
    pad.position.set(x, y, 0.11);
    group.add(pad);
  }

  const missing = { x: 0.5, y: -1.22 };
  // Paint the pad was covering never weathered, so it's a shade fresher — but
  // only a shade, and shaped like the pad that was bolted over it. A flat
  // bright rectangle reads as a sticker rather than as an absence.
  const ghost = padded(
    0.8,
    0.66,
    0.16,
    0.015,
    new THREE.Color(PLAY.door).multiplyScalar(1.1),
    wear
  );
  ghost.position.set(missing.x, missing.y, 0.108);
  group.add(ghost);

  const holeMaterial = new THREE.MeshStandardMaterial({ color: '#14161a', roughness: 0.95 });
  for (const dx of [-0.29, 0.29]) {
    for (const dy of [-0.22, 0.22]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), holeMaterial);
      hole.position.set(missing.x + dx, missing.y + dy, 0.122);
      group.add(hole);

      // Rust bleeding out of each bolt hole.
      const streak = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05, 0.3),
        new THREE.MeshStandardMaterial({
          color: PLAY.rust,
          roughness: 0.95,
          transparent: true,
          opacity: 0.34,
        })
      );
      streak.position.set(missing.x + dx, missing.y + dy - 0.16, 0.125);
      group.add(streak);
    }
  }

  // Padded kick rail along the bottom — the filthiest part of any door.
  const kick = padded(
    width - 0.1,
    0.3,
    0.12,
    0.07,
    new THREE.Color(PLAY.cream).multiplyScalar(0.34),
    wear
  );
  kick.position.set(0, -height / 2 + 0.2, 0.11);
  group.add(kick);

  // Grab handle, hanging off its one remaining fixing.
  const handle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.055, 0.42, 6, 12),
    new THREE.MeshStandardMaterial({
      color: PLAY.red,
      roughness: 0.6,
      metalness: 0.02,
    })
  );
  const handleY = ringY - 0.95;
  handle.position.set(width / 2 - 0.16, handleY - 0.14, 0.19);
  handle.rotation.z = 0.36;
  handle.castShadow = true;
  group.add(handle);

  // Only the top mount is left; the lower one is an empty hole.
  {
    const y = handleY + 0.27;
    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: PLAY.cream, roughness: 0.6, metalness: 0.05 })
    );
    mount.rotation.x = Math.PI / 2;
    mount.position.set(width / 2 - 0.16, y, 0.14);
    group.add(mount);

    const empty = new THREE.Mesh(new THREE.CircleGeometry(0.032, 10), holeMaterial);
    empty.position.set(width / 2 - 0.16, handleY - 0.27, 0.122);
    group.add(empty);
  }

  // Centre of the doorway when shut; one full height higher when open. It
  // starts shut — nothing gets through here until the machine has produced
  // something.
  const closedY = DOOR.height / 2;
  group.position.set(0, closedY, DOOR.z - 0.35);
  scene.add(group);

  // Housing for the retracted door. The wall hides it from the lit room, but
  // the door hangs on the far side of that wall, so from the dark room it would
  // otherwise be left dangling in mid-air above the opening.
  //
  // It is on the dark layer because it is in that room, and it now has to hold
  // up as an object rather than as an absence. It used to be near-black on the
  // reasoning that unlit black reads as nothing — which was true for exactly as
  // long as the room was unlit. The room gets its power back in the second act,
  // room.js moves everything on this layer into the main pass, and a black slab
  // the width of the doorway appeared above it. Painted as what it is instead:
  // a steel hood the shutter winds up into.
  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR.width + 0.6, TRAVEL + 0.5, 0.4),
    new THREE.MeshStandardMaterial({ color: '#42474a', roughness: 0.62, metalness: 0.5 })
  );
  pocket.position.set(0, DOOR.height + (TRAVEL + 0.5) / 2 - 0.15, DOOR.z - 0.62);
  pocket.layers.set(LAYER.DARK);
  scene.add(pocket);

  // 1 = fully up and out of sight, 0 = shut.
  let target = 0;
  let travel = 0;

  return {
    group,

    /** Follow the far wall if the editor moves it. */
    reposition() {
      group.position.set(0, group.position.y, DOOR.z - 0.35);
      pocket.position.z = DOOR.z - 0.62;
    },

    get isOpen() {
      return travel > 0.9;
    },
    get isClosed() {
      return travel < 0.02;
    },

    open() {
      target = 1;
    },
    close() {
      target = 0;
    },

    update(delta) {
      // Eased rather than linear, and deliberately unhurried — a heavy door
      // that slams instantly reads as a bug, not as a threat.
      const before = travel;
      travel += (target - travel) * Math.min(1, delta * 1.9);
      group.position.y = closedY + travel * TRAVEL;

      // Bang on the frame the moment it seats. The ease means travel only
      // approaches zero, so this triggers on crossing the threshold rather
      // than on reaching it — otherwise it would never fire, or fire forever.
      if (target === 0 && before > SEATED && travel <= SEATED) playDoorClose();
    },
  };
}
