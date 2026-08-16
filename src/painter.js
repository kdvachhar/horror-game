import { bucketPaintSurface, clearBucketPaint } from './bucket.js';

/**
 * The paint GUI: a flat map of the bucket, and colours to put on it.
 *
 * Opened from the tin in the back room. It is the one place in this game that
 * takes the mouse off the camera and gives it to a cursor, so it has to be
 * unmistakably a mode — a full backdrop, the world dimmed behind it, and
 * nothing to do but paint or leave.
 *
 * The canvas it draws into is the bucket's own texture, so there is no apply
 * step and no preview: the friend is repainted as the brush moves, and if it is
 * stood behind you when you open this, it is already wearing what you have
 * done by the time you close it.
 */

const STYLE = `
#painter {
  position: fixed; inset: 0; z-index: 80; display: none;
  background: rgba(6, 9, 8, 0.82);
  align-items: center; justify-content: center;
  font-family: "Courier New", Courier, monospace;
}
#painter.open { display: flex; }

#painter .panel {
  background: rgba(12, 16, 14, 0.96);
  border: 1px solid rgba(210, 226, 214, 0.22);
  border-radius: 10px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.75);
  padding: 1.1rem 1.2rem 1rem;
  max-width: min(1120px, 94vw);
}

#painter h2 {
  margin: 0 0 0.1rem; font-size: 0.72rem; letter-spacing: 0.42em;
  text-indent: 0.42em; text-transform: uppercase; color: #46e07a; text-align: center;
}
#painter .hint {
  margin: 0 0 0.8rem; font-size: 0.78rem; letter-spacing: 0.05em;
  color: #8d968f; text-align: center;
}

/* The bucket, unrolled. Chequerboard under it so you can see what is paint. */
#paint-canvas {
  display: block; width: min(1040px, 88vw); height: auto; aspect-ratio: 4 / 1;
  border: 1px solid rgba(210, 226, 214, 0.3); border-radius: 4px;
  cursor: crosshair; touch-action: none; image-rendering: auto;
}

#painter .tools {
  display: flex; align-items: center; gap: 0.9rem;
  margin-top: 0.85rem; flex-wrap: wrap; justify-content: center;
}
#painter .swatches { display: flex; gap: 0.36rem; flex-wrap: wrap; }
#painter .swatch {
  width: 30px; height: 30px; border-radius: 5px; cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.22); padding: 0;
}
#painter .swatch.on { border-color: #46e07a; transform: scale(1.14); }

#painter .sizes { display: flex; gap: 0.36rem; align-items: center; }
#painter .size {
  width: 34px; height: 30px; border-radius: 5px; cursor: pointer;
  background: rgba(255, 255, 255, 0.06); border: 2px solid rgba(255, 255, 255, 0.22);
  display: grid; place-items: center; padding: 0;
}
#painter .size.on { border-color: #46e07a; }
#painter .size i { display: block; border-radius: 50%; background: #dfe9e0; }

#painter button.text {
  font-family: inherit; font-size: 0.8rem; letter-spacing: 0.12em;
  text-transform: uppercase; cursor: pointer; color: #dfe9e0;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(210, 226, 214, 0.3);
  border-radius: 5px; padding: 0.5rem 0.95rem;
}
#painter button.text:hover { background: rgba(255, 255, 255, 0.13); }
#painter button.done { border-color: rgba(70, 224, 122, 0.55); color: #9df0bb; }
`;

/**
 * Twelve colours and the metal. Picked to be obviously distinct at a glance on
 * a 30px swatch rather than to be a tasteful ramp — this is a box of paint.
 */
const PALETTE_COLOURS = [
  '#f2f2ec', '#1a1c1a', '#c0392b', '#e8641c', '#e8b21c', '#6fbf3a',
  '#2f8f4e', '#2bb8c4', '#2f6fd0', '#7a4fc4', '#d9558f', '#8a5a2b',
];

/**
 * What actually goes on the canvas, given a swatch.
 *
 * The swatch is the colour you will see on the bucket; the paint is darker,
 * because the bucket is lit and tone mapped and ACES lifts hard through the
 * mids. Painted at face value a red came out pink — the same trap the ward's
 * green door and the red side door both needed backing off for. Doing it here
 * rather than darkening the swatches keeps the box of paint looking like a box
 * of paint while the result matches what you picked.
 */
const TONE_COMPENSATION = 0.62;
function paintFor(swatch) {
  const n = parseInt(swatch.slice(1), 16);
  const mix = (shift) => Math.round(((n >> shift) & 255) * TONE_COMPENSATION);
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}

/**
 * Brush widths in texture pixels. The canvas is 1024 across for a body 1.6m
 * around, so this is 640 pixels to the metre: the old 7/16/34 were strokes of
 * one, two and five centimetres, which is a set of fineliners for painting a
 * bucket with. These are 2.5cm, 6cm and 14cm.
 */
const BRUSHES = [16, 40, 90];

export function createPainter({ player }) {
  const surface = bucketPaintSurface();
  const ctx = surface.canvas.getContext('2d');

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'painter';
  root.innerHTML = `
    <div class="panel">
      <h2>Paint your friend</h2>
      <p class="hint">drag to paint &nbsp;·&nbsp; this is the bucket unrolled &nbsp;·&nbsp; esc to finish</p>
      <canvas id="paint-canvas"></canvas>
      <div class="tools">
        <div class="swatches"></div>
        <div class="sizes"></div>
        <button class="text" data-act="clear">Strip it</button>
        <button class="text done" data-act="done">Done</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  // The visible canvas is a copy of the texture, scaled to fit. Drawing goes to
  // the texture and is mirrored here, rather than the other way round, so the
  // thing on screen can never disagree with the thing on the bucket.
  const view = root.querySelector('#paint-canvas');
  view.width = surface.width;
  view.height = surface.height;
  const viewCtx = view.getContext('2d');
  const repaintView = () => viewCtx.drawImage(surface.canvas, 0, 0);

  let colour = PALETTE_COLOURS[5];
  let brush = BRUSHES[1];
  let open = false;

  const swatches = root.querySelector('.swatches');
  for (const c of PALETTE_COLOURS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === colour ? ' on' : '');
    b.style.background = c;
    b.onclick = () => {
      colour = c;
      for (const el of swatches.children) el.classList.toggle('on', el === b);
    };
    swatches.appendChild(b);
  }

  const sizes = root.querySelector('.sizes');
  for (const size of BRUSHES) {
    const b = document.createElement('button');
    b.className = 'size' + (size === brush ? ' on' : '');
    const dot = document.createElement('i');
    const d = Math.round(size * 0.19) + 4;
    dot.style.width = `${d}px`;
    dot.style.height = `${d}px`;
    b.appendChild(dot);
    b.onclick = () => {
      brush = size;
      for (const el of sizes.children) el.classList.toggle('on', el === b);
    };
    sizes.appendChild(b);
  }

  /** Client coords to texture coords, via the canvas's drawn size. */
  function at(event) {
    const r = view.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * surface.width,
      y: ((event.clientY - r.top) / r.height) * surface.height,
    };
  }

  /**
   * One stroke, drawn three times: where it is, and one canvas width either
   * side. The bucket is a cylinder, so the left and right edges of this canvas
   * are the same seam — a brush that runs off one side has to arrive on the
   * other or every stroke stops dead at a join that does not exist on the
   * object. The two extra passes are clipped away by the canvas bounds.
   */
  function stroke(from, to) {
    ctx.strokeStyle = paintFor(colour);
    ctx.lineWidth = brush;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const shift of [-surface.width, 0, surface.width]) {
      ctx.beginPath();
      ctx.moveTo(from.x + shift, from.y);
      ctx.lineTo(to.x + shift, to.y);
      ctx.stroke();
    }
    surface.texture.needsUpdate = true;
    repaintView();
  }

  let last = null;
  view.addEventListener('pointerdown', (event) => {
    view.setPointerCapture(event.pointerId);
    last = at(event);
    stroke(last, last); // a click with no drag should still leave a dot
  });
  view.addEventListener('pointermove', (event) => {
    if (!last) return;
    const now = at(event);
    stroke(last, now);
    last = now;
  });
  const release = () => { last = null; };
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', release);

  root.querySelector('[data-act="clear"]').onclick = () => {
    clearBucketPaint();
    repaintView();
  };
  root.querySelector('[data-act="done"]').onclick = () => close();

  window.addEventListener('keydown', (event) => {
    if (!open || event.code !== 'Escape') return;
    // Ours, not the browser's — the pointer is already unlocked, so nothing
    // else is listening for this and it would otherwise do nothing at all.
    event.preventDefault();
    close();
  });

  function close() {
    if (!open) return;
    open = false;
    root.classList.remove('open');
    document.body.classList.remove('painting');
    player.setEnabled(true);
    // Re-grabbing the pointer has to come off a real gesture, and the click or
    // keypress that closed this is one. Done any later and the browser refuses.
    player.requestLock();
  }

  return {
    get isOpen() {
      return open;
    },

    open() {
      if (open) return;
      open = true;
      repaintView();
      root.classList.add('open');
      document.body.classList.add('painting');
      // Hand the mouse back to the cursor. The player keeps updating — it just
      // stops listening — which is the same thing possession does.
      player.setEnabled(false);
      document.exitPointerLock?.();
    },

    close,
  };
}
