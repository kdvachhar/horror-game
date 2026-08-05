import * as THREE from 'three';
import { ROOM, BACK_ROOM, DOOR, LAYER } from './config.js';
import {
  makeRockSurface,
  makeWoodSurface,
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  cloneSurface,
  worldRepeat,
} from './textures.js';
import { buildBucketMesh } from './bucket.js';

/**
 * The map editor's model: what exists, where, and what it contributes to
 * collision. Interaction lives in editorView.js — this file knows nothing about
 * the mouse.
 *
 * Anything placed here is a real scene object with real colliders, so the level
 * can be walked immediately without a reload.
 */

const STORAGE_KEY = 'horror-game.map';

// Materials are shared across every instance of a type. Each surface costs a
// canvas plus a Sobel pass, so one rock texture serves a hundred rocks.
const shared = {};

function rockMaterial() {
  shared.rock ??= new THREE.MeshStandardMaterial({ ...makeRockSurface(2, 2), metalness: 0.02 });
  return shared.rock;
}
function woodMaterial() {
  shared.wood ??= new THREE.MeshStandardMaterial({ ...makeWoodSurface(1, 1), metalness: 0.02 });
  return shared.wood;
}
function concreteMaterial() {
  shared.block ??= new THREE.MeshStandardMaterial({ ...makeWallSurface(0.4, 0.4), metalness: 0 });
  return shared.block;
}

// Base surfaces for rooms. Cloned per surface with the right repeat rather
// than shared outright, so a big room and a small one keep the same detail
// density instead of one looking magnified.
function roomSurfaces() {
  shared.roomWall ??= makeWallSurface(1, 1);
  shared.roomFloor ??= makeFloorSurface(1, 1);
  shared.roomCeiling ??= makeCeilingSurface(1, 1);
  return shared;
}

/** Doorway cut into a room wall. Clamped to fit small rooms. */
const ROOM_DOOR = { width: 2.2, height: 3.2 };
export const ROOM_SIDES = ['none', 'north', 'south', 'east', 'west'];

/**
 * Wall pieces along one side, in wall-local coordinates where `u` runs along
 * the wall's length. Returns whole-wall panels, or three pieces around a
 * doorway — the same split the building's own far wall uses.
 */
function wallPanels(length, height, hasDoor) {
  if (!hasDoor) return [{ u: 0, y: height / 2, w: length, h: height }];

  const doorWidth = Math.min(ROOM_DOOR.width, length * 0.6);
  const doorHeight = Math.min(ROOM_DOOR.height, height * 0.85);
  const side = (length - doorWidth) / 2;

  return [
    { u: -(doorWidth + side) / 2, y: height / 2, w: side, h: height },
    { u: (doorWidth + side) / 2, y: height / 2, w: side, h: height },
    { u: 0, y: doorHeight + (height - doorHeight) / 2, w: doorWidth, h: height - doorHeight },
  ];
}

/** Solid spans along one side, for collision. Empty across a doorway. */
function wallSpans(length, hasDoor) {
  if (!hasDoor) return [{ u: 0, w: length }];
  const doorWidth = Math.min(ROOM_DOOR.width, length * 0.6);
  const side = (length - doorWidth) / 2;
  return [
    { u: -(doorWidth + side) / 2, w: side },
    { u: (doorWidth + side) / 2, w: side },
  ];
}

/**
 * What the palette can place. `collider` returns the box this object should
 * contribute, or null; `top` on that box makes it standable.
 */
export const OBJECT_TYPES = {
  rock: {
    label: 'Rock',
    footprint: 0.7,
    build: () => new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), rockMaterial()),
    collider: null,
  },
  crate: {
    label: 'Crate',
    footprint: 1,
    build: () => new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), woodMaterial()),
    collider: (s) => ({ half: 0.5 * s, top: 0.8 * s }),
    lift: (s) => 0.4 * s,
  },
  block: {
    label: 'Block',
    footprint: 2,
    build: () => new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), concreteMaterial()),
    collider: (s) => ({ half: 1 * s }),
    lift: (s) => 1 * s,
  },
  bucket: {
    label: 'Bucket',
    footprint: 0.6,
    build: () => buildBucketMesh(),
    collider: null,
  },
  light: {
    label: 'Light',
    footprint: 0.5,
    build: () => {
      const group = new THREE.Group();
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffe9c4 })
      );
      group.add(bulb);
      const light = new THREE.PointLight(0xffe9c4, 60, 22, 1.5);
      group.add(light);
      return group;
    },
    collider: null,
    lift: () => 3,
  },
};

/**
 * Builds a room: floor, ceiling and four walls, with an optional doorway in one
 * of them. Returns the group plus the collider boxes its walls need.
 *
 * The floor sits a whisker above y=0. Laid exactly on zero it would be coplanar
 * with the building's own floor and z-fight across the whole footprint.
 */
function buildRoom({ width, depth, height, doorway }) {
  const group = new THREE.Group();
  const boxes = [];
  const surfaces = roomSurfaces();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...cloneSurface(surfaces.roomFloor, ...worldRepeat(width, depth)),
      metalness: 0.02,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.015;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...cloneSurface(surfaces.roomCeiling, ...worldRepeat(width, depth)),
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  group.add(ceiling);

  // Each side described once: which way it faces, how long it is, and how to
  // turn a position along the wall into world x/z.
  const sides = [
    { name: 'north', length: width, rot: 0, at: (u) => [u, -depth / 2], normal: [0, 1] },
    { name: 'south', length: width, rot: Math.PI, at: (u) => [u, depth / 2], normal: [0, -1] },
    { name: 'west', length: depth, rot: Math.PI / 2, at: (u) => [-width / 2, u], normal: [1, 0] },
    { name: 'east', length: depth, rot: -Math.PI / 2, at: (u) => [width / 2, u], normal: [-1, 0] },
  ];

  const THICKNESS = 0.4;

  for (const side of sides) {
    const hasDoor = doorway === side.name;

    for (const panel of wallPanels(side.length, height, hasDoor)) {
      if (panel.w <= 0.01) continue;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(panel.w, panel.h),
        new THREE.MeshStandardMaterial({
          ...cloneSurface(surfaces.roomWall, ...worldRepeat(panel.w, panel.h)),
          metalness: 0,
          // Visible from outside too, which matters while blocking a level out.
          side: THREE.DoubleSide,
        })
      );
      const [x, z] = side.at(panel.u);
      mesh.position.set(x, panel.y, z);
      mesh.rotation.y = side.rot;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Colliders sit just outside the wall plane so the inside stays clear.
    for (const span of wallSpans(side.length, hasDoor)) {
      if (span.w <= 0.01) continue;
      const [x, z] = side.at(span.u);
      const outX = (-side.normal[0] * THICKNESS) / 2;
      const outZ = (-side.normal[1] * THICKNESS) / 2;
      const halfW = side.rot === 0 || side.rot === Math.PI ? span.w / 2 : THICKNESS / 2;
      const halfD = side.rot === 0 || side.rot === Math.PI ? THICKNESS / 2 : span.w / 2;
      boxes.push({
        minX: x + outX - halfW,
        maxX: x + outX + halfW,
        minZ: z + outZ - halfD,
        maxZ: z + outZ + halfD,
      });
    }
  }

  return { group, boxes };
}

/**
 * The two hand-authored rooms, presented to the editor as entries backed by the
 * config objects rather than by meshes of their own. Resizing one writes
 * straight to config and asks the game to rebuild its shell.
 */
function shellEntries() {
  return [
    {
      kind: 'shell',
      id: 'main',
      label: 'main hall',
      get box() {
        return { x: -ROOM.width / 2, z: -ROOM.depth / 2, w: ROOM.width, d: ROOM.depth };
      },
      set box(v) {
        // Anchored at the origin: the machine, fixtures and spawn are all in
        // absolute coordinates, so sliding the hall out from under them would
        // strand everything. Only its size is editable.
        ROOM.width = Math.max(8, v.w);
        ROOM.depth = Math.max(8, v.d);
      },
      get height() {
        return ROOM.height;
      },
      set height(v) {
        ROOM.height = v;
      },
    },
    {
      kind: 'shell',
      id: 'back',
      label: 'dark room',
      get box() {
        return {
          x: -BACK_ROOM.width / 2,
          z: DOOR.z - BACK_ROOM.depth,
          w: BACK_ROOM.width,
          d: BACK_ROOM.depth,
        };
      },
      set box(v) {
        BACK_ROOM.width = Math.max(4, v.w);
        BACK_ROOM.depth = Math.max(4, v.d);
      },
      get height() {
        return BACK_ROOM.height;
      },
      set height(v) {
        BACK_ROOM.height = v;
      },
    },
  ];
}

export function createMapEditor({ scene, camera, renderer, colliders, onShellChanged }) {
  const placed = [];
  // Always present and never removable — the level's own two rooms.
  const shells = shellEntries();
  // Pristine dimensions, so Revert can put them back.
  const shellOriginals = shells.map((s) => ({ ...s.box, height: s.height }));
  let selected = null;
  let onChange = () => {};

  const outline = new THREE.BoxHelper(undefined, 0x46e07a);
  outline.visible = false;
  outline.layers.enableAll();
  scene.add(outline);

  /** Objects in the dark room have to render in the dark pass, like the friend. */
  function applyLayer(entry) {
    const layer = entry.mesh.position.z < DOOR.z ? LAYER.DARK : LAYER.MAIN;
    entry.mesh.traverse((object) => object.layers.set(layer));
  }

  function syncCollider(entry) {
    const spec = OBJECT_TYPES[entry.type].collider?.(entry.scale);
    if (!spec) return;
    const { x, z } = entry.mesh.position;
    Object.assign(entry.collider, {
      minX: x - spec.half,
      maxX: x + spec.half,
      minZ: z - spec.half,
      maxZ: z + spec.half,
      top: spec.top,
    });
  }

  function place(type, position, options = {}) {
    const definition = OBJECT_TYPES[type];
    if (!definition) return null;

    const mesh = definition.build();
    const scale = options.scale ?? 1;
    const rotationY = options.rotationY ?? 0;

    mesh.scale.setScalar(scale);
    mesh.rotation.y = rotationY;
    mesh.position.set(position.x, (definition.lift?.(scale) ?? 0) + (options.y ?? 0), position.z);
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    scene.add(mesh);

    const entry = { kind: 'object', type, mesh, scale, rotationY, collider: null };
    if (definition.collider) {
      entry.collider = {};
      colliders.push(entry.collider);
      syncCollider(entry);
    }
    applyLayer(entry);
    placed.push(entry);
    onChange();
    return entry;
  }

  function select(entry) {
    selected = entry;
    if (entry && entry.kind === 'shell') {
      outline.visible = false;
    } else if (entry) {
      outline.setFromObject(entry.mesh);
      outline.visible = true;
    } else {
      outline.visible = false;
    }
    onChange();
  }

  function placeRoom(spec) {
    const entry = {
      kind: 'room',
      mesh: null,
      boxes: [],
      x: spec.x,
      z: spec.z,
      width: Math.max(2, spec.width),
      depth: Math.max(2, spec.depth),
      height: spec.height ?? 5,
      doorway: spec.doorway ?? 'south',
    };
    buildRoomInto(entry);
    placed.push(entry);
    onChange();
    return entry;
  }

  /** (Re)builds a room entry's geometry and colliders from its properties. */
  function buildRoomInto(entry) {
    if (entry.mesh) scene.remove(entry.mesh);
    for (const box of entry.boxes) {
      const index = colliders.indexOf(box);
      if (index !== -1) colliders.splice(index, 1);
    }

    const { group, boxes } = buildRoom(entry);
    group.position.set(entry.x, 0, entry.z);
    scene.add(group);

    // Collider boxes come back in room-local space; shift them into the world.
    for (const box of boxes) {
      box.minX += entry.x;
      box.maxX += entry.x;
      box.minZ += entry.z;
      box.maxZ += entry.z;
      colliders.push(box);
    }

    entry.mesh = group;
    entry.boxes = boxes;
    applyLayer(entry);
  }

  function remove(entry) {
    const index = placed.indexOf(entry);
    if (index === -1) return;
    placed.splice(index, 1);
    scene.remove(entry.mesh);
    if (entry.collider) {
      const c = colliders.indexOf(entry.collider);
      if (c !== -1) colliders.splice(c, 1);
    }
    for (const box of entry.boxes ?? []) {
      const b = colliders.indexOf(box);
      if (b !== -1) colliders.splice(b, 1);
    }
    if (selected === entry) select(null);
    onChange();
  }

  /** Re-reads an entry's transform onto its mesh, collider and outline. */
  function refresh(entry) {
    if (entry.kind === 'shell') {
      onShellChanged?.();
      onChange();
      return;
    }
    if (entry.kind === 'room') {
      // Rooms are cheap enough to rebuild wholesale, and a resize changes the
      // panel split, the doorway and every collider at once.
      entry.x = entry.mesh.position.x;
      entry.z = entry.mesh.position.z;
      buildRoomInto(entry);
      if (selected === entry) outline.setFromObject(entry.mesh);
      onChange();
      return;
    }

    entry.mesh.scale.setScalar(entry.scale);
    entry.mesh.rotation.y = entry.rotationY;
    const lift = OBJECT_TYPES[entry.type].lift?.(entry.scale) ?? 0;
    entry.mesh.position.y = lift;
    syncCollider(entry);
    applyLayer(entry);
    if (selected === entry) outline.setFromObject(entry.mesh);
    onChange();
  }

  return {
    placed,
    shells,

    /** Everything selectable in the plan view, editor-made or not. */
    all() {
      return [...shells, ...placed];
    },

    resetShells() {
      shells.forEach((shell, i) => {
        shell.box = shellOriginals[i];
        shell.height = shellOriginals[i].height;
      });
      onShellChanged?.();
      onChange();
    },

    get selected() {
      return selected;
    },
    set onChange(fn) {
      onChange = fn;
    },

    place,
    placeRoom,

    /**
     * Plan-view rectangle for any entry, so rooms and props can be dragged and
     * resized through one code path. Props have no width of their own — their
     * footprint is their base size times their scale.
     */
    footprint(entry) {
      if (entry.kind === 'shell') return entry.box;
      if (entry.kind === 'room') {
        return {
          x: entry.mesh.position.x - entry.width / 2,
          z: entry.mesh.position.z - entry.depth / 2,
          w: entry.width,
          d: entry.depth,
        };
      }
      const size = (OBJECT_TYPES[entry.type].footprint ?? 1) * entry.scale;
      return {
        x: entry.mesh.position.x - size / 2,
        z: entry.mesh.position.z - size / 2,
        w: size,
        d: size,
      };
    },

    /** Inverse of footprint(): resizing a prop drives its uniform scale. */
    setFootprint(entry, box) {
      if (entry.kind === 'shell') {
        entry.box = box;
        onShellChanged?.();
        onChange();
        return;
      }
      if (entry.kind === 'room') {
        entry.width = Math.max(2, box.w);
        entry.depth = Math.max(2, box.d);
        entry.mesh.position.x = box.x + box.w / 2;
        entry.mesh.position.z = box.z + box.d / 2;
      } else {
        const base = OBJECT_TYPES[entry.type].footprint ?? 1;
        entry.scale = Math.max(0.2, Math.min(6, Math.max(box.w, box.d) / base));
        entry.mesh.position.x = box.x + box.w / 2;
        entry.mesh.position.z = box.z + box.d / 2;
      }
      refresh(entry);
    },

    select,
    remove,
    refresh,

    /** Serialisable description of the level, for pasting into source. */
    serialise() {
      const shellData = shells.map((shell) => ({
        type: 'shell',
        id: shell.id,
        width: +shell.box.w.toFixed(2),
        depth: +shell.box.d.toFixed(2),
        height: +shell.height.toFixed(2),
      }));
      return shellData.concat(placed.map((entry) =>
        entry.kind === 'room'
          ? {
              type: 'room',
              x: +entry.mesh.position.x.toFixed(2),
              z: +entry.mesh.position.z.toFixed(2),
              width: +entry.width.toFixed(2),
              depth: +entry.depth.toFixed(2),
              height: +entry.height.toFixed(2),
              doorway: entry.doorway,
            }
          : {
              type: entry.type,
              x: +entry.mesh.position.x.toFixed(2),
              z: +entry.mesh.position.z.toFixed(2),
              scale: +entry.scale.toFixed(2),
              rotationY: +entry.rotationY.toFixed(3),
            }
      ));
    },

    load(list) {
      for (const entry of [...placed]) remove(entry);
      for (const item of list ?? []) {
        if (item.type === 'shell') {
          const shell = shells.find((s) => s.id === item.id);
          if (shell) {
            shell.box = { ...shell.box, w: item.width, d: item.depth };
            shell.height = item.height;
            onShellChanged?.();
          }
        } else if (item.type === 'room') {
          placeRoom(item);
        } else {
          place(item.type, { x: item.x, z: item.z }, {
            scale: item.scale,
            rotationY: item.rotationY,
          });
        }
      }
      select(null);
    },

    /** Explicit, like the reference editor: edits are only kept if you Save. */
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialise()));
      } catch {
        // Private browsing and full quotas both throw here; losing the autosave
        // is not worth breaking the editor over.
      }
    },

    restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.load(JSON.parse(raw));
      } catch {
        // Corrupt or hand-edited storage — start empty rather than refuse to run.
      }
    },

    clearStorage() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* nothing to do */
      }
    },

    setOutlineVisible(visible) {
      outline.visible = visible && selected !== null;
    },
  };
}
