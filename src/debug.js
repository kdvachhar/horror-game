import { createMapEditor, OBJECT_TYPES, ROOM_SIDES } from './mapEditor.js';
import { createEditorView } from './editorView.js';

/**
 * Debug menu and level editor. Type `debug` anywhere to open it.
 *
 * The trigger is a rolling keystroke buffer rather than a bound key, because
 * every convenient key is already gameplay. It does mean typing it while
 * playing costs you a strafe and an interact — d and e are both bound — which
 * is the price of the trigger the way it was asked for.
 *
 * The editor follows the conventions of the one in ../prehistoric-peril: a plan
 * view you rubber-band rectangles onto, eight resize handles on the selection,
 * pan and zoom, arrow-key nudge, and an explicit Save / Revert / Export JS.
 */
const SEQUENCE = 'debug';
/** Letters more than this far apart don't count as the same word. */
const GAP_MS = 1200;

const STYLE = `
#debug {
  display: none; position: fixed; top: 12px; right: 12px; width: 252px;
  background: rgba(30, 30, 46, 0.95); color: #cdd6f4; border-radius: 10px;
  padding: 14px 16px; z-index: 1001; font-family: system-ui, sans-serif;
  font-size: 13px; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7);
  max-height: calc(100vh - 24px); overflow-y: auto;
}
#debug.open { display: block; }
#debug .title { font-size: 15px; font-weight: 600; color: #89b4fa; margin-bottom: 10px; }
#debug .cap {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: #6c7086; margin: 12px 0 6px;
}
#debug button {
  background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 6px;
  padding: 6px 10px; font-size: 12px; cursor: pointer; font-family: inherit;
}
#debug button:hover { background: #3b3d52; }
#debug button.on { background: #585b70; }
#debug .bar { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
#debug .bar button { flex: 1; }
#debug .stats { font-size: 12px; font-family: monospace; color: #9399b2; margin-bottom: 4px; }
#debug .stats b { color: #cdd6f4; font-weight: normal; }
#debug input[type="range"] { width: 100%; margin-bottom: 8px; }
#debug textarea {
  display: none; width: 100%; height: 130px; resize: vertical; box-sizing: border-box;
  background: #11111b; color: #a6e3a1; border: 1px solid #45475a; border-radius: 6px;
  font-family: monospace; font-size: 11px; padding: 6px; margin-bottom: 6px;
}
#debug .help { font-size: 11px; color: #7f849c; line-height: 1.55; }
#debug .help b { color: #bac2de; font-weight: 600; }
`;

export function createDebugMenu(context) {
  const { renderer, camera, room, player, scenes = [] } = context;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'debug';
  panel.innerHTML = `
    <div class="title">Level Editor</div>

    <div class="stats">
      fps <b data-stat="fps">—</b> · calls <b data-stat="calls">—</b> · tris <b data-stat="tris">—</b>
    </div>
    <div class="stats">
      rooms <b data-stat="rooms">0</b> · props <b data-stat="props">0</b> ·
      colliders <b data-stat="colliders">0</b>
    </div>

    <div class="cap" data-scenes-cap>Jump to</div>
    <div class="bar" data-scenes></div>

    <div class="cap">Layer</div>
    <div class="bar">
      <button data-layer="rooms">Rooms</button>
      <button data-layer="props">Props</button>
    </div>

    <div class="cap">Prop</div>
    <div class="bar" data-palette></div>

    <div class="cap">View</div>
    <div class="bar">
      <button data-act="zout" title="Zoom out (−)">−</button>
      <button data-act="zin" title="Zoom in (+)">+</button>
      <button data-act="fit" title="Fit level to view (F)" style="flex:2;">Fit</button>
    </div>

    <div class="bar">
      <button data-act="snap"></button>
      <button data-act="delete">Delete</button>
      <button data-act="clear" title="Remove everything the editor has placed">Clear all</button>
    </div>

    <div class="cap">Selection</div>
    <div data-selection></div>

    <div class="bar">
      <button data-act="save" title="Persist edits (survives refresh)">Save</button>
      <button data-act="revert" title="Discard saved edits">Revert</button>
    </div>
    <div class="bar">
      <button data-act="export">Export JS</button>
      <button data-act="play">Play ▶</button>
    </div>
    <textarea data-json spellcheck="false"></textarea>
    <button data-act="copy" style="display:none;width:100%;margin-bottom:10px;">Copy to clipboard</button>

    <div class="help">
      <b>Drag</b> empty = new · <b>drag</b> shape = move · <b>handles</b> = resize<br>
      <b>Right</b>/<b>Space</b>-drag = pan · <b>wheel</b> = zoom · <b>−</b>/<b>+</b>/<b>F</b> zoom·fit<br>
      <b>arrows</b> nudge (<b>shift</b> fine) · <b>G</b> snap · <b>R</b>/<b>P</b> layer · <b>Del</b> remove<br>
      <b>Save</b> persists across refresh · <b>Revert</b> restores the original level
    </div>
  `;
  document.body.appendChild(panel);

  // ── scene jumps ───────────────────────────────────────────────────────────
  // The panel knows nothing about the game's beats — it just renders whatever
  // list it is handed, so the setup for each one lives next to the objects it
  // has to touch rather than in here.
  const sceneBar = panel.querySelector('[data-scenes]');
  if (scenes.length === 0) {
    panel.querySelector('[data-scenes-cap]').style.display = 'none';
  }
  for (const scene of scenes) {
    const button = document.createElement('button');
    button.textContent = scene.label;
    button.title = scene.hint ?? '';
    button.style.flex = '1 1 46%';
    button.addEventListener('click', () => {
      // Close first: several of these hand control to a sequence, and the menu
      // holds the player disabled while it is up.
      setOpen(false);
      scene.go();
    });
    sceneBar.appendChild(button);
  }

  const editor = createMapEditor(context);
  const view = createEditorView({ editor, getPlayerPosition: () => camera.position });

  let open = false;
  let buffer = '';
  let lastKey = 0;

  const $ = (selector) => panel.querySelector(selector);
  const stat = (name, value) => {
    panel.querySelector(`[data-stat="${name}"]`).textContent = value;
  };

  /** Briefly change a button's label to confirm an action, then restore it. */
  function flash(selector, text) {
    const button = $(selector);
    if (!button) return;
    button._label ??= button.textContent;
    button.textContent = text;
    clearTimeout(button._timer);
    button._timer = setTimeout(() => (button.textContent = button._label), 1200);
  }

  // ── palette ───────────────────────────────────────────────────────────────
  const palette = $('[data-palette]');
  for (const [key, definition] of Object.entries(OBJECT_TYPES)) {
    const button = document.createElement('button');
    button.textContent = definition.label;
    button.dataset.brush = key;
    button.addEventListener('click', () => view.setBrush(key));
    palette.appendChild(button);
  }

  // ── selection ─────────────────────────────────────────────────────────────
  let rendered = null;

  function renderSelection() {
    const host = $('[data-selection]');
    const entry = editor.selected;

    if (!entry) {
      if (rendered !== null) {
        host.innerHTML = '<div class="stats" style="margin-bottom:12px;">nothing selected</div>';
      }
      rendered = null;
      return;
    }

    const box = editor.footprint(entry);
    if (entry === rendered) {
      // Same object, just moved or resized — update the readout in place rather
      // than rebuilding, which would replace a control mid-drag.
      host.querySelector('[data-readout]').textContent =
        `${box.w.toFixed(1)} x ${box.d.toFixed(1)}`;
      return;
    }
    rendered = entry;

    if (entry.kind === 'shell') {
      host.innerHTML = `
        <div class="stats">${entry.label}
          <b data-readout>${box.w.toFixed(1)} x ${box.d.toFixed(1)}</b></div>
        <div class="cap">Height</div>
        <input type="range" min="4" max="30" step="0.5" data-field="height" value="${entry.height}">
        <div class="stats" style="margin-bottom:12px;">anchored at origin · not removable</div>
      `;
      host.querySelector('[data-field="height"]').addEventListener('input', (event) => {
        entry.height = Number(event.target.value);
        editor.refresh(entry);
      });
      return;
    }

    const isRoom = entry.kind === 'room';
    host.innerHTML = `
      <div class="stats">${isRoom ? 'room' : OBJECT_TYPES[entry.type].label}
        <b data-readout>${box.w.toFixed(1)} x ${box.d.toFixed(1)}</b></div>
      ${isRoom ? `<div class="cap">Height</div>
        <input type="range" min="2.5" max="14" step="0.25" data-field="height" value="${entry.height}">
        <div class="cap">Doorway</div><div class="bar" data-doors></div>` : ''}
    `;

    if (!isRoom) return;

    host.querySelector('[data-field="height"]').addEventListener('input', (event) => {
      entry.height = Number(event.target.value);
      editor.refresh(entry);
    });

    const doors = host.querySelector('[data-doors]');
    for (const side of ROOM_SIDES) {
      const button = document.createElement('button');
      button.textContent = side === 'none' ? '–' : side[0].toUpperCase();
      button.title = side;
      button.classList.toggle('on', entry.doorway === side);
      button.addEventListener('click', () => {
        entry.doorway = side;
        editor.refresh(entry);
        for (const other of doors.children) other.classList.toggle('on', other === button);
      });
      doors.appendChild(button);
    }
  }

  function refreshPanel() {
    const rooms = editor.placed.filter((e) => e.kind === 'room').length;
    stat('rooms', rooms);
    stat('props', editor.placed.length - rooms);
    stat('colliders', room.colliders.length);

    for (const button of panel.querySelectorAll('[data-layer]')) {
      button.classList.toggle('on', button.dataset.layer === view.layer);
    }
    for (const button of palette.children) {
      button.classList.toggle('on', button.dataset.brush === view.brush && view.layer === 'props');
    }
    $('[data-act="snap"]').textContent = `Snap: ${view.snapOn ? view.snap : 'off'}`;

    renderSelection();
  }

  editor.onChange = refreshPanel;
  view.onChange = refreshPanel;

  // ── buttons ───────────────────────────────────────────────────────────────
  for (const button of panel.querySelectorAll('[data-layer]')) {
    button.addEventListener('click', () => view.setLayer(button.dataset.layer));
  }
  $('[data-act="zout"]').addEventListener('click', () => view.zoomBy(1 / 1.2));
  $('[data-act="zin"]').addEventListener('click', () => view.zoomBy(1.2));
  $('[data-act="fit"]').addEventListener('click', () => view.fitView());
  $('[data-act="snap"]').addEventListener('click', () => view.toggleSnap());
  const deleteSelected = () => {
    const entry = editor.selected;
    if (entry && entry.kind !== 'shell') editor.remove(entry);
  };
  $('[data-act="delete"]').addEventListener('click', deleteSelected);
  $('[data-act="clear"]').addEventListener('click', () => editor.load([]));
  $('[data-act="save"]').addEventListener('click', () => {
    editor.save();
    flash('[data-act="save"]', 'Saved ✓');
  });
  $('[data-act="revert"]').addEventListener('click', () => {
    editor.clearStorage();
    editor.load([]);
    editor.resetShells();
    flash('[data-act="revert"]', 'Reverted');
  });
  $('[data-act="play"]').addEventListener('click', () => setOpen(false));
  $('[data-act="export"]').addEventListener('click', () => {
    const out = $('[data-json]');
    out.value = `export const MAP = ${JSON.stringify(editor.serialise(), null, 2)};\n`;
    out.style.display = 'block';
    $('[data-act="copy"]').style.display = 'block';
  });
  $('[data-act="copy"]').addEventListener('click', () => {
    const out = $('[data-json]');
    out.select();
    navigator.clipboard?.writeText(out.value);
    flash('[data-act="copy"]', 'Copied ✓');
  });

  // ── keyboard ──────────────────────────────────────────────────────────────
  const typingIn = (target) => /^(INPUT|TEXTAREA)$/.test(target?.tagName ?? '');

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') view.setSpaceHeld(false);
  });

  window.addEventListener('keydown', (event) => {
    if (typingIn(event.target)) return;

    if (open) {
      if (event.code === 'Space') view.setSpaceHeld(true);

      let handled = true;
      switch (event.code) {
        case 'Escape': setOpen(false); break;
        case 'Delete':
        case 'Backspace': deleteSelected(); break;
        case 'KeyG': view.toggleSnap(); break;
        case 'KeyR': view.setLayer('rooms'); break;
        case 'KeyP': view.setLayer('props'); break;
        case 'KeyF':
        case 'Digit0': view.fitView(); break;
        case 'Minus':
        case 'NumpadSubtract': view.zoomBy(1 / 1.2); break;
        case 'Equal':
        case 'NumpadAdd': view.zoomBy(1.2); break;
        case 'ArrowLeft': view.nudge(-1, 0, event.shiftKey); break;
        case 'ArrowRight': view.nudge(1, 0, event.shiftKey); break;
        case 'ArrowUp': view.nudge(0, -1, event.shiftKey); break;
        case 'ArrowDown': view.nudge(0, 1, event.shiftKey); break;
        default: handled = false;
      }
      if (handled) {
        event.preventDefault();
        return;
      }
    }

    if (event.key.length !== 1) return;
    const now = performance.now();
    if (now - lastKey > GAP_MS) buffer = '';
    lastKey = now;
    buffer = (buffer + event.key.toLowerCase()).slice(-SEQUENCE.length);
    if (buffer === SEQUENCE) {
      buffer = '';
      setOpen(!open);
    }
  });

  // ── open / close ──────────────────────────────────────────────────────────
  let overlayTimer = null;

  function setOpen(next) {
    open = next;
    panel.classList.toggle('open', open);
    view.setActive(open);
    // The plan view owns the keyboard while it's up, or the player walks off
    // under you while you type.
    player.setEnabled(!open);
    clearTimeout(overlayTimer);

    if (open) {
      document.body.classList.add('debugging');
      document.exitPointerLock?.();
    } else {
      // Closing drops you straight back into the game rather than onto the
      // start screen. Pointer lock had to be released to give you a cursor,
      // and the start screen is keyed off that lock, so it has to be taken
      // back. Called inside the originating click, which is the user gesture
      // browsers require.
      player.requestLock();
      // Held a beat longer than the lock takes to come back, since that
      // resolves asynchronously and the overlay would flash in the gap. If the
      // lock is refused the overlay does reappear — which is right, because
      // then you genuinely do have to click.
      overlayTimer = setTimeout(() => document.body.classList.remove('debugging'), 400);
    }

    refreshPanel();
  }

  editor.restore();
  refreshPanel();

  let frames = 0;
  let elapsed = 0;

  return {
    editor,
    view,
    get isOpen() {
      return open;
    },
    get isEditing() {
      return open;
    },
    toggle: setOpen,
    setEditing: setOpen,

    update(delta) {
      if (!open) return;
      view.draw();

      frames++;
      elapsed += delta;
      if (elapsed >= 0.4) {
        stat('fps', Math.round(frames / elapsed));
        stat('calls', renderer.info.render.calls);
        stat('tris', renderer.info.render.triangles);
        frames = 0;
        elapsed = 0;
      }
    },
  };
}
