import { bucketPaintSurface, clearBucketPaint, PAINT_BANDS } from './bucket.js';

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

/* The bucket, unrolled. Aspect ratio is set from the texture in JS — the bands
   decide how tall it is, and a hardcoded one here would silently squash it. */
#paint-canvas {
  display: block; width: min(1040px, 88vw); height: auto;
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
/* The eraser: the metal, struck through, so it is not read as another grey. */
#painter .swatch.erase {
  background:
    linear-gradient(135deg, transparent 44%, #c0392b 44%, #c0392b 56%, transparent 56%),
    #9aa0a3;
}

#painter button.text:disabled {
  opacity: 0.35; cursor: default;
}
#painter button.text:disabled:hover { background: rgba(255, 255, 255, 0.06); }

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

/** The eraser, as a colour you can select. Not a hex, so it never tone-maps. */
const ERASER = 'erase';

/**
 * How far back you can go, as memory rather than as a count.
 *
 * Each step is a full-canvas ImageData — over a megabyte and a half now that
 * the rim and handle have bands of their own — so the honest limit is a budget.
 * A count would quietly double what this holds the next time a part is added.
 */
const UNDO_BUDGET = 24 * 1024 * 1024;

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
  const undoSteps = Math.max(4, Math.floor(UNDO_BUDGET / (surface.width * surface.height * 4)));

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'painter';
  root.innerHTML = `
    <div class="panel">
      <h2>Paint your friend</h2>
      <p class="hint">drag to paint &nbsp;·&nbsp; the bucket unrolled, handle and rim included &nbsp;·&nbsp; esc to finish</p>
      <canvas id="paint-canvas"></canvas>
      <div class="tools">
        <div class="swatches"></div>
        <div class="sizes"></div>
        <button class="text" data-act="undo" disabled>Undo</button>
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
  view.style.aspectRatio = `${surface.width} / ${surface.height}`;
  const viewCtx = view.getContext('2d');

  /**
   * The texture, plus the part names written over it.
   *
   * The bands are metal on metal — without the labels the two strips along the
   * top are a mystery, and the first thing anyone would do is try to paint the
   * body and miss. Drawn here on the copy and never into the texture, so none
   * of it ends up on the bucket.
   */
  function repaintView() {
    viewCtx.drawImage(surface.canvas, 0, 0);
    viewCtx.save();
    viewCtx.font = '600 15px "Courier New", Courier, monospace';
    viewCtx.textBaseline = 'middle';
    for (const band of PAINT_BANDS) {
      if (band.y > 0) {
        viewCtx.setLineDash([10, 8]);
        viewCtx.strokeStyle = 'rgba(70, 224, 122, 0.5)';
        viewCtx.lineWidth = 2;
        viewCtx.beginPath();
        viewCtx.moveTo(0, band.y);
        viewCtx.lineTo(surface.width, band.y);
        viewCtx.stroke();
      }
      const label = band.label.toUpperCase();
      const width = viewCtx.measureText(label).width;
      viewCtx.fillStyle = 'rgba(8, 12, 10, 0.62)';
      viewCtx.fillRect(0, band.y, width + 20, 26);
      viewCtx.fillStyle = 'rgba(223, 233, 224, 0.85)';
      viewCtx.fillText(label, 10, band.y + 14);
    }
    viewCtx.restore();
  }

  let colour = PALETTE_COLOURS[5];
  let brush = BRUSHES[1];
  let open = false;

  const swatches = root.querySelector('.swatches');
  const pickColour = (value, button) => {
    colour = value;
    for (const el of swatches.children) el.classList.toggle('on', el === button);
  };
  for (const c of PALETTE_COLOURS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === colour ? ' on' : '');
    b.style.background = c;
    b.title = 'Paint';
    b.onclick = () => pickColour(c, b);
    swatches.appendChild(b);
  }

  // The eraser sits with the colours because that is what it is — another
  // thing to have loaded on the brush. Marked with a slash so it is not mistaken
  // for a grey.
  const rubber = document.createElement('button');
  rubber.className = 'swatch erase';
  rubber.title = 'Eraser — back to bare metal';
  rubber.onclick = () => pickColour(ERASER, rubber);
  swatches.appendChild(rubber);

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
   * The bare bucket as a repeating pattern, which is the whole eraser.
   *
   * Stroking with it paints the base image's own pixels at the coordinates the
   * brush is over, so what comes back is the streaked metal that was there and
   * not an approximation of it. `repeat` rather than `no-repeat` is what makes
   * it survive the seam passes below: a stroke drawn at x + W samples the base
   * at x, which is exactly the pixel that is at that place on the cylinder.
   */
  const barePattern = ctx.createPattern(surface.base, 'repeat');

  /** Which part of the bucket a point on the canvas is, clamped to the ends. */
  function bandAt(y) {
    for (const band of PAINT_BANDS) {
      if (y < band.y + band.height) return band;
    }
    return PAINT_BANDS[PAINT_BANDS.length - 1];
  }

  /**
   * One stroke, on one part.
   *
   * Clipped to the band it started in, for two reasons. The widest brush is
   * 90px and the rim's band is 80, so an unclipped stroke anywhere near it
   * paints the handle and the body at the same time — three parts of the bucket
   * that are nowhere near each other in the world. And it fixes where a drag
   * belongs: run off the rim onto the body mid-sweep and the line would jump
   * the width of the bucket rather than stopping at the edge of the part.
   *
   * Drawn three times where the band wraps: where it is, and one canvas width
   * either side. The body and the rim are closed rings, so the left and right
   * edges are the same seam — a brush that runs off one side has to arrive on
   * the other or every stroke stops dead at a join that does not exist on the
   * object. The extra passes fall outside the canvas and cost nothing. The
   * handle does not wrap; its ends are the two lugs.
   */
  function stroke(from, to, band) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, band.y, surface.width, band.height);
    ctx.clip();
    ctx.strokeStyle = colour === ERASER ? barePattern : paintFor(colour);
    ctx.lineWidth = brush;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const shift of band.wraps ? [-surface.width, 0, surface.width] : [0]) {
      ctx.beginPath();
      ctx.moveTo(from.x + shift, from.y);
      ctx.lineTo(to.x + shift, to.y);
      ctx.stroke();
    }
    ctx.restore();
    surface.texture.needsUpdate = true;
    repaintView();
  }

  /**
   * Undo history, one entry per stroke rather than per segment.
   *
   * Taken on pointerdown, before anything is laid down, so a step is "the whole
   * drag you just did". Snapshotting inside stroke() instead would fill the
   * fifteen slots with fifteen frames of a single sweep and undo would look
   * broken — it would appear to do nothing.
   */
  const history = [];
  const undoButton = root.querySelector('[data-act="undo"]');
  const syncUndo = () => { undoButton.disabled = history.length === 0; };

  function snapshot() {
    history.push(ctx.getImageData(0, 0, surface.width, surface.height));
    if (history.length > undoSteps) history.shift();
    syncUndo();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    ctx.putImageData(previous, 0, 0);
    surface.texture.needsUpdate = true;
    repaintView();
    syncUndo();
  }

  let last = null;
  let painting = null;
  view.addEventListener('pointerdown', (event) => {
    view.setPointerCapture(event.pointerId);
    snapshot();
    last = at(event);
    painting = bandAt(last.y);
    stroke(last, last, painting); // a click with no drag should still leave a dot
  });
  view.addEventListener('pointermove', (event) => {
    if (!last) return;
    const now = at(event);
    stroke(last, now, painting);
    last = now;
  });
  const release = () => { last = null; painting = null; };
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', release);

  undoButton.onclick = () => undo();
  root.querySelector('[data-act="clear"]').onclick = () => {
    // Undoable too. Stripping a bucket you have spent five minutes on because
    // you meant to press the button next to it is the one mistake here that
    // would actually cost you something.
    snapshot();
    clearBucketPaint();
    repaintView();
  };
  root.querySelector('[data-act="done"]').onclick = () => close();

  window.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.code === 'Escape') {
      // Ours, not the browser's — the pointer is already unlocked, so nothing
      // else is listening for this and it would otherwise do nothing at all.
      event.preventDefault();
      close();
      return;
    }
    if (event.code === 'KeyZ' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      undo();
    }
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
