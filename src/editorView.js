import { ROOM, BACK_ROOM, DOOR, MACHINE } from './config.js';
import { OBJECT_TYPES } from './mapEditor.js';

/**
 * Top-down plan view for the map editor, modelled on the level editor in
 * ../prehistoric-peril: rubber-band a rectangle on empty space to create, drag
 * a shape to move it, drag its handles to resize, right/space-drag to pan,
 * wheel to zoom, F to fit.
 *
 * That editor works in 2D because its game is 2D. The same interaction is worth
 * keeping here, so this draws a schematic plan onto an overlay canvas and
 * mutates the 3D scene underneath — laying out a floorplan by dragging boxes is
 * far quicker than nudging objects around in a perspective view.
 */

/** Minimum rect, world units. */
const MIN = 0.5;
/** Handle half-size, screen px. */
const HANDLE = 4;

const COLOUR = {
  background: '#0f1117',
  grid: 'rgba(255,255,255,0.05)',
  axis: 'rgba(120,160,255,0.30)',
  fixed: 'rgba(137,180,250,0.45)',
  fixedFill: 'rgba(137,180,250,0.07)',
  shell: '#89b4fa',
  shellFill: 'rgba(137,180,250,0.10)',
  room: 'rgba(76,175,80,0.30)',
  roomEdge: '#7bd88f',
  prop: 'rgba(255,215,95,0.30)',
  propEdge: '#ffd75f',
  dim: 'rgba(255,255,255,0.28)',
  handle: '#ffd75f',
  player: '#f38ba8',
  text: '#a6adc8',
};

/** The hand-authored level, drawn for reference and never editable. */
function fixedGeometry() {
  const belt = {
    x: MACHINE.center[0] + MACHINE.conveyorStart,
    z: MACHINE.center[2] - MACHINE.conveyorWidth / 2,
    w: MACHINE.conveyorLength,
    d: MACHINE.conveyorWidth,
    label: 'conveyor',
  };
  const plinth = MACHINE.bodyWidth / 2 + 0.6;
  return [
    { x: -plinth, z: -plinth, w: plinth * 2, d: plinth * 2, label: 'machine' },
    belt,
    { x: -DOOR.width / 2, z: DOOR.z - 0.3, w: DOOR.width, d: 0.6, label: 'door' },
  ];
}

export function createEditorView({ editor, getPlayerPosition }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'editor-canvas';
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '90',
    display: 'none',
    cursor: 'crosshair',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');



  let W = 0;
  let H = 0;
  let camX = -30;
  let camZ = -46;
  let zoom = 11;
  const ZMIN = 1.5;
  const ZMAX = 90;

  let snap = 0.5;
  let snapOn = true;
  let layer = 'rooms';
  let brush = 'rock';
  let active = false;

  let mode = 'idle';
  let dragStart = null;
  let orig = null;
  let resizeHnd = null;
  let createRect = null;
  let spaceHeld = false;
  let mouseWX = 0;
  let mouseWZ = 0;

  let onChange = () => {};

  const ex = (wx) => (wx - camX) * zoom;
  const ez = (wz) => (wz - camZ) * zoom;
  const snapv = (v) => (snapOn ? Math.round(v / snap) * snap : Math.round(v * 100) / 100);

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function m2w(event) {
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    return { sx: mx, sy: my, wx: camX + mx / zoom, wz: camZ + my / zoom };
  }

  const inRect = (wx, wz, r) =>
    r && wx >= r.x && wx <= r.x + r.w && wz >= r.z && wz <= r.z + r.d;

  function pickAt(wx, wz) {
    // Topmost first, so recently placed things win.
    for (let i = editor.placed.length - 1; i >= 0; i--) {
      const entry = editor.placed[i];
      if (entry.kind !== (layer === 'rooms' ? 'room' : 'object')) continue;
      if (inRect(wx, wz, editor.footprint(entry))) return entry;
    }
    // The level's own rooms are only picked on the Rooms layer, and last —
    // they cover most of the map, so anything inside them has to win first.
    if (layer === 'rooms') {
      for (const shell of editor.shells) {
        if (inRect(wx, wz, shell.box)) return shell;
      }
    }
    return null;
  }

  function handleAt(sx, sy) {
    const entry = editor.selected;
    if (!entry) return null;
    const f = editor.footprint(entry);
    const x = ex(f.x);
    const y = ez(f.z);
    const w = f.w * zoom;
    const h = f.d * zoom;
    const points = {
      nw: [x, y], n: [x + w / 2, y], ne: [x + w, y],
      w: [x, y + h / 2], e: [x + w, y + h / 2],
      sw: [x, y + h], s: [x + w / 2, y + h], se: [x + w, y + h],
    };
    for (const key in points) {
      const [px, py] = points[key];
      if (Math.abs(sx - px) <= HANDLE + 2 && Math.abs(sy - py) <= HANDLE + 2) return key;
    }
    return null;
  }

  function resizeFrom(entry, o, hnd, m) {
    let left = o.x;
    let top = o.z;
    let right = o.x + o.w;
    let bottom = o.z + o.d;
    const wx = snapv(m.wx);
    const wz = snapv(m.wz);

    if (hnd.includes('w')) left = wx;
    if (hnd.includes('e')) right = wx;
    if (hnd.includes('n')) top = wz;
    if (hnd.includes('s')) bottom = wz;

    if (right - left < MIN) hnd.includes('w') ? (left = right - MIN) : (right = left + MIN);
    if (bottom - top < MIN) hnd.includes('n') ? (top = bottom - MIN) : (bottom = top + MIN);

    editor.setFootprint(entry, { x: left, z: top, w: right - left, d: bottom - top });
  }

  function onDown(event) {
    if (!active) return;

    const m = m2w(event);
    if (spaceHeld || event.button === 1 || event.button === 2) {
      mode = 'pan';
      dragStart = { mx: m.sx, my: m.sy, cx: camX, cz: camZ };
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;

    const hnd = handleAt(m.sx, m.sy);
    if (hnd && editor.selected) {
      mode = 'resize';
      resizeHnd = hnd;
      orig = editor.footprint(editor.selected);
      return;
    }

    const hit = pickAt(m.wx, m.wz);
    if (hit) {
      editor.select(hit);
      mode = 'move';
      orig = editor.footprint(hit);
      dragStart = m;
      onChange();
      return;
    }

    // Empty space: rubber-band something new.
    editor.select(null);
    const x0 = snapv(m.wx);
    const z0 = snapv(m.wz);
    createRect = { x: x0, z: z0, w: 0, d: 0 };
    dragStart = { wx: x0, wz: z0 };
    mode = 'create';
    onChange();
  }

  function onMove(event) {
    if (!active) return;
    const m = m2w(event);
    mouseWX = m.wx;
    mouseWZ = m.wz;

    if (mode === 'pan') {
      camX = dragStart.cx - (m.sx - dragStart.mx) / zoom;
      camZ = dragStart.cz - (m.sy - dragStart.my) / zoom;
      return;
    }
    if (mode === 'move' && editor.selected) {
      const dx = m.wx - dragStart.wx;
      const dz = m.wz - dragStart.wz;
      editor.setFootprint(editor.selected, {
        x: snapv(orig.x + dx),
        z: snapv(orig.z + dz),
        w: orig.w,
        d: orig.d,
      });
      return;
    }
    if (mode === 'resize' && editor.selected) {
      resizeFrom(editor.selected, orig, resizeHnd, m);
      return;
    }
    if (mode === 'create' && createRect) {
      const x1 = snapv(m.wx);
      const z1 = snapv(m.wz);
      createRect.x = Math.min(dragStart.wx, x1);
      createRect.z = Math.min(dragStart.wz, z1);
      createRect.w = Math.abs(x1 - dragStart.wx);
      createRect.d = Math.abs(z1 - dragStart.wz);
    }
  }

  function onUp() {
    if (!active) return;

    if (mode === 'create' && createRect) {
      if (createRect.w >= MIN && createRect.d >= MIN) {
        const centre = {
          x: createRect.x + createRect.w / 2,
          z: createRect.z + createRect.d / 2,
        };
        const entry =
          layer === 'rooms'
            ? editor.placeRoom({ ...centre, width: createRect.w, depth: createRect.d })
            : editor.place(brush, centre);
        if (entry && layer === 'props') {
          editor.setFootprint(entry, createRect);
        }
        editor.select(entry);
      }
      createRect = null;
    }

    mode = 'idle';
    onChange();
  }

  function zoomAt(sx, sy, factor) {
    const wx = camX + sx / zoom;
    const wz = camZ + sy / zoom;
    zoom = Math.max(ZMIN, Math.min(ZMAX, zoom * factor));
    camX = wx - sx / zoom;
    camZ = wz - sy / zoom;
    onChange();
  }

  function onWheel(event) {
    if (!active) return;
    event.preventDefault();
    const m = m2w(event);
    zoomAt(m.sx, m.sy, event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function bounds() {
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    const take = (r) => {
      minX = Math.min(minX, r.x);
      minZ = Math.min(minZ, r.z);
      maxX = Math.max(maxX, r.x + r.w);
      maxZ = Math.max(maxZ, r.z + r.d);
    };
    fixedGeometry().forEach(take);
    editor.shells.forEach((shell) => take(shell.box));
    editor.placed.forEach((entry) => take(editor.footprint(entry)));
    if (!isFinite(minX)) return { x: -30, z: -30, w: 60, d: 60 };
    return { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
  }

  function fitView() {
    const bb = bounds();
    const pad = 3;
    zoom = Math.max(ZMIN, Math.min(ZMAX, Math.min(W / (bb.w + pad * 2), H / (bb.d + pad * 2))));
    camX = bb.x - (W / zoom - bb.w) / 2;
    camZ = bb.z - (H / zoom - bb.d) / 2;
    onChange();
  }

  // ── drawing ────────────────────────────────────────────────────────────────
  function rect(r, fill, stroke, width = 1) {
    const x = ex(r.x);
    const y = ez(r.z);
    const w = r.w * zoom;
    const h = r.d * zoom;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  function label(text, wx, wz, colour) {
    ctx.font = '11px monospace';
    ctx.fillStyle = colour;
    ctx.fillText(text, ex(wx) + 4, ez(wz) + 13);
  }

  function grid() {
    let step = 1;
    while (step * zoom < 26) step *= 2;
    const right = camX + W / zoom;
    const bottom = camZ + H / zoom;

    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOUR.grid;
    for (let wx = Math.floor(camX / step) * step; wx < right; wx += step) {
      ctx.beginPath();
      ctx.moveTo(ex(wx), 0);
      ctx.lineTo(ex(wx), H);
      ctx.stroke();
    }
    for (let wz = Math.floor(camZ / step) * step; wz < bottom; wz += step) {
      ctx.beginPath();
      ctx.moveTo(0, ez(wz));
      ctx.lineTo(W, ez(wz));
      ctx.stroke();
    }

    ctx.strokeStyle = COLOUR.axis;
    ctx.beginPath();
    ctx.moveTo(ex(0), 0);
    ctx.lineTo(ex(0), H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, ez(0));
    ctx.lineTo(W, ez(0));
    ctx.stroke();
  }

  function handles(entry) {
    const f = editor.footprint(entry);
    const x = ex(f.x);
    const y = ez(f.z);
    const w = f.w * zoom;
    const h = f.d * zoom;
    const points = [
      [x, y], [x + w / 2, y], [x + w, y], [x + w, y + h / 2],
      [x + w, y + h], [x + w / 2, y + h], [x, y + h], [x, y + h / 2],
    ];
    ctx.fillStyle = COLOUR.handle;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    for (const [px, py] of points) {
      ctx.fillRect(px - HANDLE, py - HANDLE, HANDLE * 2, HANDLE * 2);
      ctx.strokeRect(px - HANDLE + 0.5, py - HANDLE + 0.5, HANDLE * 2 - 1, HANDLE * 2 - 1);
    }
  }

  /** Marks which wall of a room its doorway is in. */
  function doorway(entry) {
    if (entry.doorway === 'none') return;
    const f = editor.footprint(entry);
    const width = Math.min(2.2, (entry.doorway === 'north' || entry.doorway === 'south' ? f.w : f.d) * 0.6);
    const cx = f.x + f.w / 2;
    const cz = f.z + f.d / 2;
    const gap = {
      north: { x: cx - width / 2, z: f.z - 0.15, w: width, d: 0.3 },
      south: { x: cx - width / 2, z: f.z + f.d - 0.15, w: width, d: 0.3 },
      west: { x: f.x - 0.15, z: cz - width / 2, w: 0.3, d: width },
      east: { x: f.x + f.w - 0.15, z: cz - width / 2, w: 0.3, d: width },
    }[entry.doorway];
    rect(gap, COLOUR.background, '#f9e2af', 1);
  }

  function draw() {
    if (!active) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLOUR.background;
    ctx.fillRect(0, 0, W, H);

    grid();

    for (const item of fixedGeometry()) {
      rect(item, COLOUR.fixedFill, COLOUR.fixed);
      if (zoom > 5) label(item.label, item.x, item.z, COLOUR.fixed);
    }

    // The level's own rooms, editable like anything else.
    for (const shell of editor.shells) {
      const highlight = layer === 'rooms';
      rect(shell.box, COLOUR.shellFill, highlight ? COLOUR.shell : COLOUR.dim, 2);
      if (zoom > 5) label(shell.label, shell.box.x, shell.box.z, COLOUR.shell);
    }

    for (const entry of editor.placed) {
      const f = editor.footprint(entry);
      const isRoom = entry.kind === 'room';
      const activeLayer = isRoom === (layer === 'rooms');
      rect(
        f,
        isRoom ? COLOUR.room : COLOUR.prop,
        activeLayer ? (isRoom ? COLOUR.roomEdge : COLOUR.propEdge) : COLOUR.dim
      );
      if (isRoom) doorway(entry);
      else if (zoom > 9) label(OBJECT_TYPES[entry.type].label, f.x, f.z, COLOUR.propEdge);
    }

    if (createRect) rect(createRect, 'rgba(166,227,161,0.25)', '#a6e3a1');
    if (editor.selected) handles(editor.selected);

    const player = getPlayerPosition();
    ctx.fillStyle = COLOUR.player;
    ctx.beginPath();
    ctx.arc(ex(player.x), ez(player.z), 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '12px monospace';
    ctx.fillStyle = COLOUR.text;
    ctx.fillText(
      `x ${mouseWX.toFixed(1)}  z ${mouseWZ.toFixed(1)}   zoom ${zoom.toFixed(1)}   ` +
        `snap ${snapOn ? snap : 'off'}   layer ${layer}`,
      12,
      H - 14
    );
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    canvas,
    draw,

    set onChange(fn) {
      onChange = fn;
    },

    get isActive() {
      return active;
    },
    setActive(on) {
      active = on;
      canvas.style.display = on ? 'block' : 'none';
      if (on) {
        resize();
        fitView();
      }
    },

    get layer() {
      return layer;
    },
    setLayer(next) {
      layer = next;
      editor.select(null);
      onChange();
    },

    get brush() {
      return brush;
    },
    setBrush(next) {
      brush = next;
      layer = 'props';
      onChange();
    },

    get snapOn() {
      return snapOn;
    },
    get snap() {
      return snap;
    },
    toggleSnap() {
      snapOn = !snapOn;
      onChange();
    },
    cycleSnap() {
      snap = { 0.25: 0.5, 0.5: 1, 1: 2, 2: 0.25 }[snap] ?? 0.5;
      snapOn = true;
      onChange();
    },

    setSpaceHeld(held) {
      spaceHeld = held;
    },
    zoomBy(factor) {
      zoomAt(W / 2, H / 2, factor);
    },

    /** Plan coordinates to screen pixels. */
    worldToScreen(wx, wz) {
      return { x: ex(wx), y: ez(wz) };
    },
    fitView,

    /** Arrow-key nudge, matching the reference editor's shift-for-fine rule. */
    nudge(dx, dz, fine) {
      const step = fine ? 0.1 : snapOn ? snap : 1;
      const entry = editor.selected;
      if (entry) {
        const f = editor.footprint(entry);
        editor.setFootprint(entry, { ...f, x: f.x + dx * step, z: f.z + dz * step });
      } else {
        camX += dx * step * 4;
        camZ += dz * step * 4;
      }
      onChange();
    },
  };
}
