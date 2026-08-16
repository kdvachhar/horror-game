import * as THREE from 'three';

// Procedural surfaces — keeps the project asset-free so it runs anywhere.
//
// Every surface is built the same way: one palette, one grime pass, one detail
// scale. Each is drawn twice in lockstep — once for colour, once for height —
// and the height pass is then converted into a normal map and a roughness map.
// That shared pipeline is what makes the room read as one building, and the
// derived maps are what make the materials react to light like real surfaces
// instead of like painted cardboard.

/** Shared environment palette. The goo and wall text are the only accents. */
export const PALETTE = {
  // Concrete family — one hue, four values.
  wall: '#4d4e47',
  floor: '#44453f',
  ceiling: '#3a3b34',
  pillar: '#494a42',

  // Grime, reused on every surface.
  damp: (a) => `rgba(26,27,23,${a})`,
  bloom: (a) => `rgba(104,106,92,${a})`,
  rust: (a) => `rgba(92,64,38,${a})`,

  // Props, pulled toward the concrete hue so they sit in the room. Kept a
  // step lighter than the floor so clutter still reads against it.
  // All CSS strings — three parses these, and the canvas needs them anyway.
  wood: '#4a4034',
  woodDark: '#3f372d',
  woodLight: '#544737',
  rubble: '#42433d',
  metal: '#44483f',
  metalDark: '#32352f',
  // Galvanised steel — deliberately lighter and more neutral than the room's
  // structural metal, so a bucket reads as a bucket and not as machinery.
  galvanised: '#9aa0a3',
  galvanisedDark: '#6f7679',
  trim: '#2f302a',
  hazard: '#9c8730',
  void: '#191a12',
};

/**
 * World units covered by one texture tile. Applying this everywhere is what
 * makes the detail scale match from floor to wall to pillar — mismatched
 * density is the main thing that makes procedural surfaces look unrelated.
 */
export const UNITS_PER_TILE = 6;

/** Repeat counts for a surface of the given world size. Fractions are fine. */
export function worldRepeat(width, height) {
  return [width / UNITS_PER_TILE, height / UNITS_PER_TILE];
}

// Fabricated steel is panelled much finer than poured concrete, so it gets its
// own pitch — one tile is a 2x2 group of plates.
export const METAL_UNITS_PER_TILE = 2.6;

export function metalRepeat(width, height) {
  return [width / METAL_UNITS_PER_TILE, height / METAL_UNITS_PER_TILE];
}

const SIZE = 512;
const GRAIN = 13;

// Height is drawn in greyscale with mid-grey as the resting surface, so a
// feature can push out (lighter) or cut in (darker).
const FLAT = '#808080';
const raise = (a) => `rgba(255,255,255,${a})`;
const carve = (a) => `rgba(0,0,0,${a})`;

function createCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

/**
 * A surface under construction: a colour canvas and a matching height canvas.
 * Draw operations that represent real relief should touch both — that's what
 * keeps the normal map aligned with what you can see.
 */
function beginSurface(baseColor) {
  const color = createCanvas(SIZE);
  const height = createCanvas(SIZE);
  const c = color.getContext('2d');
  const h = height.getContext('2d');
  c.fillStyle = baseColor;
  c.fillRect(0, 0, SIZE, SIZE);
  h.fillStyle = FLAT;
  h.fillRect(0, 0, SIZE, SIZE);
  return { color, height, c, h };
}

/**
 * Runs `draw` nine times, once per neighbouring tile offset, so any feature
 * that crosses a canvas edge reappears on the opposite side. Without this the
 * texture shows a hard grid of seams once it's repeated across a large surface.
 * `draw` must be deterministic — randomise before calling, not inside.
 */
function wrapped(ctx, draw, axes = 'xy') {
  const xs = axes.includes('x') ? [-1, 0, 1] : [0];
  const ys = axes.includes('y') ? [-1, 0, 1] : [0];
  for (const ox of xs) {
    for (const oy of ys) {
      ctx.save();
      ctx.translate(ox * SIZE, oy * SIZE);
      draw();
      ctx.restore();
    }
  }
}

// Per-pixel noise is what makes a surface shimmer when it's viewed at a glancing
// angle, so this stays subtle and leans on mipmapping to average it out.
function grain(ctx, amount = GRAIN) {
  const image = ctx.getImageData(0, 0, SIZE, SIZE);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
}

function blotches(ctx, count, tint, maxRadius, strength) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = (0.2 + Math.random() * 0.8) * maxRadius;
    wrapped(ctx, () => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, tint(strength));
      gradient.addColorStop(1, tint(0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/**
 * The common weathering every surface in the room gets: damp patches, mineral
 * bloom, a little rust bleed, then noise. `wear` scales how beaten up the
 * surface is without changing the character of it.
 */
function grime(surface, wear = 1) {
  // Radius stays modest — very large soft blotches read as blurry cloud rather
  // than as staining, and they smother whatever structure is underneath.
  blotches(surface.c, Math.round(38 * wear), PALETTE.damp, 120, 0.26);
  blotches(surface.c, Math.round(24 * wear), PALETTE.bloom, 95, 0.2);
  blotches(surface.c, Math.round(10 * wear), PALETTE.rust, 70, 0.16);
  grain(surface.c);
  // A matching sprinkle of height noise gives the surface tooth up close.
  grain(surface.h, 13 * wear);
}

/** Fine granular relief — the aggregate you feel in a concrete surface. */
function speckle(surface, count, lift = 0.26) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 0.4 + Math.random() * 1.6;
    const up = Math.random() > 0.45;
    surface.c.fillStyle = up ? PALETTE.bloom(0.3) : PALETTE.damp(0.25);
    surface.c.beginPath();
    surface.c.arc(x, y, r, 0, Math.PI * 2);
    surface.c.fill();

    surface.h.fillStyle = up ? raise(lift) : carve(lift * 0.7);
    surface.h.beginPath();
    surface.h.arc(x, y, r, 0, Math.PI * 2);
    surface.h.fill();
  }
}

/**
 * Sobel the height canvas into a tangent-space normal map.
 *
 * Sign convention: three uploads canvases with flipY, so canvas rows run
 * opposite to V. That makes dHeight/dV equal to +dy in canvas space, and the
 * normal's Y component is its negation's negation — hence ny uses +dy while
 * nx uses -dx. Getting this backwards lights every groove as a ridge.
 */
function makeNormalMap(heightCanvas, strength) {
  const src = heightCanvas.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const out = createCanvas(SIZE);
  const ctx = out.getContext('2d');
  const image = ctx.createImageData(SIZE, SIZE);
  const data = image.data;

  // Wrapping sample keeps the normal map seamless like the colour map.
  const at = (x, y) => src[(((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)) * 4] / 255;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));

      let nx = -dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;

      const i = (y * SIZE + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / len) * 0.5 * 255 + 127.5;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return out;
}

/**
 * Roughness from the colour pass. On concrete the dark patches are damp, so
 * they're smoother; on metal the dark patches are grime and rust, so they're
 * rougher. `invert` picks which way round.
 */
function makeRoughnessMap(colorCanvas, min, max, invert) {
  const src = colorCanvas.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  const out = createCanvas(SIZE);
  const ctx = out.getContext('2d');
  const image = ctx.createImageData(SIZE, SIZE);
  const data = image.data;

  for (let i = 0; i < src.length; i += 4) {
    const luma = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
    const t = invert ? 1 - luma : luma;
    const value = (min + (max - min) * t) * 255;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return out;
}

function toTexture(canvas, repeatX, repeatY, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = colorSpace;
  // Mipmaps plus a high anisotropy budget are what stop the floor from
  // sparkling as it recedes; three clamps this to whatever the GPU supports.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  return texture;
}

/**
 * Turns a finished surface into the three maps a MeshStandardMaterial wants.
 * Spread the result straight into the material.
 */
function finish(surface, repeatX, repeatY, options = {}) {
  const {
    normalStrength = 2.4,
    roughMin = 0.62,
    roughMax = 1.0,
    roughInvert = false,
    normalScale = 1,
  } = options;

  return {
    map: toTexture(surface.color, repeatX, repeatY, THREE.SRGBColorSpace),
    normalMap: toTexture(
      makeNormalMap(surface.height, normalStrength),
      repeatX,
      repeatY,
      THREE.NoColorSpace
    ),
    roughnessMap: toTexture(
      makeRoughnessMap(surface.color, roughMin, roughMax, roughInvert),
      repeatX,
      repeatY,
      THREE.NoColorSpace
    ),
    normalScale: new THREE.Vector2(normalScale, normalScale),
  };
}

/**
 * Re-points a finished surface's maps at a new repeat. Clones share the
 * underlying canvases, so this costs nothing but a texture object.
 */
export function cloneSurface(surface, repeatX, repeatY) {
  const clone = { ...surface, normalScale: surface.normalScale.clone() };
  for (const key of ['map', 'normalMap', 'roughnessMap']) {
    clone[key] = surface[key].clone();
    clone[key].needsUpdate = true;
    clone[key].repeat.set(repeatX, repeatY);
  }
  return clone;
}

/** Every map on a surface, for callers that need to animate or dispose them. */
export function surfaceTextures(surface) {
  return [surface.map, surface.normalMap, surface.roughnessMap];
}

/**
 * Board-formed concrete for the walls and pillars: the horizontal lines left
 * by timber shuttering, the vertical joints between form panels, and the tie
 * holes where the formwork was bolted through. The structure is what makes it
 * read as a poured wall rather than as noise.
 */
export function makeWallSurface(repeatX = 6, repeatY = 2, base = PALETTE.wall) {
  const s = beginSurface(base);

  speckle(s, 2600, 0.26);

  // Shutter boards: a recessed seam with the board face stepping slightly
  // proud of it, which is what catches the light on a real formed wall.
  const boards = 6;
  const boardHeight = SIZE / boards;
  for (let i = 0; i <= boards; i++) {
    const y = (i / boards) * SIZE;

    s.c.fillStyle = PALETTE.damp(0.5);
    s.c.fillRect(0, y - 1, SIZE, 2.5);
    s.c.fillStyle = PALETTE.bloom(0.16);
    s.c.fillRect(0, y + 1.5, SIZE, 1.5);

    s.h.fillStyle = carve(0.85);
    s.h.fillRect(0, y - 1.5, SIZE, 3);
    s.h.fillStyle = raise(0.3);
    s.h.fillRect(0, y + 1.5, SIZE, 2);

    // Each plank sits at a slightly different depth and stains differently.
    const proud = Math.random();
    s.c.fillStyle = proud > 0.5 ? PALETTE.bloom(0.05) : PALETTE.damp(0.05);
    s.c.fillRect(0, y, SIZE, boardHeight);
    s.h.fillStyle = proud > 0.5 ? raise(0.09) : carve(0.09);
    s.h.fillRect(0, y, SIZE, boardHeight);
  }

  // Vertical joints between form panels.
  for (const x of [0, SIZE / 2]) {
    s.c.fillStyle = PALETTE.damp(0.42);
    s.c.fillRect(x - 1, 0, 2.5, SIZE);
    s.c.fillStyle = PALETTE.bloom(0.12);
    s.c.fillRect(x + 1.5, 0, 1.5, SIZE);

    s.h.fillStyle = carve(0.8);
    s.h.fillRect(x - 1.5, 0, 3, SIZE);
  }

  // Form-tie holes: real recesses, rust-stained, bleeding down the wall.
  for (let gx = 0; gx < 2; gx++) {
    for (let gy = 0; gy < 3; gy++) {
      // Jittered off the grid — dead-regular holes read as pegboard.
      const x = gx * (SIZE / 2) + SIZE / 4 + (Math.random() - 0.5) * 26;
      const y = gy * (SIZE / 3) + SIZE / 6 + (Math.random() - 0.5) * 26;
      if (Math.random() > 0.85) continue; // the odd one filled in
      wrapped(s.c, () => {
        const hole = s.c.createRadialGradient(x, y, 0, x, y, 7);
        hole.addColorStop(0, PALETTE.void);
        hole.addColorStop(0.7, PALETTE.damp(0.6));
        hole.addColorStop(1, PALETTE.damp(0));
        s.c.fillStyle = hole;
        s.c.beginPath();
        s.c.arc(x, y, 7, 0, Math.PI * 2);
        s.c.fill();

        const bleed = s.c.createLinearGradient(0, y, 0, y + 46);
        bleed.addColorStop(0, PALETTE.rust(0.4));
        bleed.addColorStop(1, PALETTE.rust(0));
        s.c.fillStyle = bleed;
        s.c.fillRect(x - 3, y, 6, 46);
      });
      wrapped(s.h, () => {
        const pit = s.h.createRadialGradient(x, y, 0, x, y, 7.5);
        pit.addColorStop(0, carve(0.95));
        pit.addColorStop(0.75, carve(0.6));
        pit.addColorStop(1, carve(0));
        s.h.fillStyle = pit;
        s.h.beginPath();
        s.h.arc(x, y, 7.5, 0, Math.PI * 2);
        s.h.fill();
      });
    }
  }

  // Vertical seepage running down from the top. Only wrapped horizontally —
  // these should always start at the top of the tile. Stains, not relief.
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * SIZE;
    const w = 1 + Math.random() * 5;
    const h = 60 + Math.random() * 380;
    wrapped(
      s.c,
      () => {
        const gradient = s.c.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, PALETTE.damp(0.4));
        gradient.addColorStop(1, PALETTE.damp(0));
        s.c.fillStyle = gradient;
        s.c.fillRect(x, 0, w, h);
      },
      'x'
    );
  }

  // Spalled patches where the face has broken away, exposing the aggregate.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const radii = Array.from({ length: 8 }, () => 10 + Math.random() * 26);
    const path = (ctx) => {
      ctx.beginPath();
      radii.forEach((r, p) => {
        const a = (p / radii.length) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    };
    wrapped(s.c, () => {
      s.c.fillStyle = PALETTE.rust(0.3);
      path(s.c);
    });
    wrapped(s.h, () => {
      s.h.fillStyle = carve(0.45);
      path(s.h);
    });
  }

  grime(s, 1);
  return finish(s, repeatX, repeatY, { normalStrength: 1.9, roughMin: 0.6 });
}

/** Cracked concrete slab for the floor. */
export function makeFloorSurface(repeatX = 7, repeatY = 7) {
  const s = beginSurface(PALETTE.floor);

  speckle(s, 3000, 0.24);

  // Branching cracks. Each path is generated up front so the wrapped copies
  // trace the same line and meet cleanly across the tile boundary.
  for (const ctx of [s.c, s.h]) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  for (let i = 0; i < 16; i++) {
    let x = Math.random() * SIZE;
    let y = Math.random() * SIZE;
    let angle = Math.random() * Math.PI * 2;

    const points = [[x, y]];
    const segments = 6 + Math.floor(Math.random() * 10);
    for (let s2 = 0; s2 < segments; s2++) {
      angle += (Math.random() - 0.5) * 1.1;
      x += Math.cos(angle) * 22;
      y += Math.sin(angle) * 22;
      points.push([x, y]);
    }

    const lineWidth = 0.8 + Math.random() * 1.6;
    const stroke = (ctx, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      points.forEach(([px, py], index) =>
        index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      );
      ctx.stroke();
    };

    wrapped(s.c, () => stroke(s.c, PALETTE.damp(0.55), lineWidth));
    wrapped(s.h, () => stroke(s.h, carve(0.9), lineWidth * 1.2));
  }

  grime(s, 1.15);
  // A shallower normal than the walls: you view the floor at a glancing angle
  // most of the time, which exaggerates relief.
  return finish(s, repeatX, repeatY, { normalStrength: 1.5, roughMin: 0.55 });
}

/** Sagging, damp ceiling — the same concrete, just darker and more stained. */
export function makeCeilingSurface(repeatX = 7, repeatY = 7) {
  const s = beginSurface(PALETTE.ceiling);
  speckle(s, 1800, 0.22);
  grime(s, 1.3);
  return finish(s, repeatX, repeatY, { normalStrength: 1.3 });
}

/**
 * Riveted steel plate for the machine: panel seams, rivet rows along them,
 * scratches and grime. The rivets are real domes in the height pass, which is
 * what makes them catch the goo light as you walk past.
 */
export function makeMetalPanelSurface(repeatX = 2, repeatY = 1, base = PALETTE.metal) {
  const s = beginSurface(base);

  // Broad tonal drift, so large flat panels aren't dead uniform.
  blotches(s.c, 14, PALETTE.bloom, 180, 0.12);
  blotches(s.c, 12, PALETTE.damp, 160, 0.16);

  const seam = (x1, y1, x2, y2) => {
    s.c.strokeStyle = PALETTE.void;
    s.c.lineWidth = 3;
    s.c.beginPath();
    s.c.moveTo(x1, y1);
    s.c.lineTo(x2, y2);
    s.c.stroke();

    s.c.strokeStyle = PALETTE.bloom(0.22);
    s.c.lineWidth = 1.5;
    s.c.beginPath();
    s.c.moveTo(x1 + 2.5, y1 + 2.5);
    s.c.lineTo(x2 + 2.5, y2 + 2.5);
    s.c.stroke();

    s.h.strokeStyle = carve(0.95);
    s.h.lineWidth = 3.5;
    s.h.beginPath();
    s.h.moveTo(x1, y1);
    s.h.lineTo(x2, y2);
    s.h.stroke();
  };

  // Plate edges: one horizontal, one vertical, splitting the tile into panels.
  seam(0, SIZE / 2, SIZE, SIZE / 2);
  seam(SIZE / 2, 0, SIZE / 2, SIZE);

  // Rivets marching along each seam — domed in height, lit in colour.
  const rivet = (x, y) => {
    wrapped(s.c, () => {
      const g = s.c.createRadialGradient(x - 1, y - 1, 0, x, y, 4.5);
      g.addColorStop(0, PALETTE.bloom(0.5));
      g.addColorStop(0.6, PALETTE.metalDark);
      g.addColorStop(1, PALETTE.void);
      s.c.fillStyle = g;
      s.c.beginPath();
      s.c.arc(x, y, 4.5, 0, Math.PI * 2);
      s.c.fill();
    });
    wrapped(s.h, () => {
      const g = s.h.createRadialGradient(x, y, 0, x, y, 5);
      g.addColorStop(0, raise(0.95));
      g.addColorStop(0.65, raise(0.5));
      g.addColorStop(1, raise(0));
      s.h.fillStyle = g;
      s.h.beginPath();
      s.h.arc(x, y, 5, 0, Math.PI * 2);
      s.h.fill();
    });
  };
  const spacing = SIZE / 16;
  for (let i = 0; i < 16; i++) {
    rivet(i * spacing + spacing / 2, SIZE / 2 - 9);
    rivet(SIZE / 2 - 9, i * spacing + spacing / 2);
  }

  // Scratches and wear, biased diagonally like something dragged across it.
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const len = 8 + Math.random() * 70;
    const angle = (Math.random() - 0.5) * 0.9 + (Math.random() > 0.5 ? 0 : Math.PI / 2);
    const bright = Math.random() > 0.4;
    const width = 0.6 + Math.random() * 1.1;
    const line = (ctx, style) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    };
    wrapped(s.c, () => line(s.c, bright ? PALETTE.bloom(0.16) : PALETTE.damp(0.3)));
    wrapped(s.h, () => line(s.h, carve(0.3)));
  }

  // Rust creeping out of the seams and corners.
  blotches(s.c, 10, PALETTE.rust, 70, 0.26);
  grain(s.c, 9);
  grain(s.h, 12);

  // Metal inverts the roughness rule: the dark areas here are grime and rust,
  // which are rougher, while the clean plate stays comparatively polished.
  return finish(s, repeatX, repeatY, {
    normalStrength: 2.5,
    roughMin: 0.32,
    roughMax: 0.92,
    roughInvert: true,
  });
}

/** Scuffed hazard stripes for the machine's plinth. */
export function makeHazardSurface(repeatX = 8, repeatY = 1) {
  const s = beginSurface(PALETTE.void);

  // Diagonal bands, drawn past the edges so the stripe continues across tiles.
  // The paint sits fractionally proud of the steel, as thick paint does.
  const band = SIZE / 8;
  for (let i = -2; i < 16; i++) {
    const path = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(i * band, 0);
      ctx.lineTo(i * band + band / 2, 0);
      ctx.lineTo(i * band + band / 2 + SIZE, SIZE);
      ctx.lineTo(i * band + SIZE, SIZE);
      ctx.closePath();
      ctx.fill();
    };
    s.c.fillStyle = PALETTE.hazard;
    path(s.c);
    s.h.fillStyle = raise(0.35);
    path(s.h);
  }

  // Chipped paint: flecks knocked back to bare metal.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 1 + Math.random() * 4;
    wrapped(s.c, () => {
      s.c.fillStyle = PALETTE.void;
      s.c.beginPath();
      s.c.arc(x, y, r, 0, Math.PI * 2);
      s.c.fill();
    });
    wrapped(s.h, () => {
      s.h.fillStyle = carve(0.5);
      s.h.beginPath();
      s.h.arc(x, y, r, 0, Math.PI * 2);
      s.h.fill();
    });
  }

  // Same weathering as the walls, so the paint belongs to the same room — but
  // lighter, since the stripes are the one thing here that needs to stay read.
  grime(s, 0.45);
  return finish(s, repeatX, repeatY, {
    normalStrength: 2,
    roughMin: 0.4,
    roughMax: 0.95,
    roughInvert: true,
  });
}

/** Ribbed rubber belt. Scrolled by animating the texture offset. */
export function makeBeltSurface(repeatX = 1, repeatY = 8) {
  const s = beginSurface('#22231e');

  // Cleats standing proud across the belt, with the shadowed gap behind them.
  for (let i = 0; i < 8; i++) {
    const y = i * (SIZE / 8);
    s.c.fillStyle = '#2b2c26';
    s.c.fillRect(0, y, SIZE, 22);
    s.c.fillStyle = PALETTE.void;
    s.c.fillRect(0, y + 22, SIZE, 7);

    s.h.fillStyle = raise(0.8);
    s.h.fillRect(0, y, SIZE, 22);
    s.h.fillStyle = carve(0.7);
    s.h.fillRect(0, y + 22, SIZE, 7);
  }

  grime(s, 0.5);
  // Rubber is uniformly matte, so the roughness range is narrow.
  return finish(s, repeatX, repeatY, {
    normalStrength: 3,
    roughMin: 0.8,
    roughMax: 0.98,
  });
}

/**
 * Fractured stone for the rubble. Broken concrete breaks along flat faces, so
 * the character comes from angular facets at slightly different depths rather
 * than from smooth noise — that's what stops it reading as a potato.
 */
export function makeRockSurface(repeatX = 2, repeatY = 2) {
  const s = beginSurface(PALETTE.rubble);

  // Fracture facets: angular planes, each sitting a little proud or sunk.
  for (let i = 0; i < 30; i++) {
    const cx = Math.random() * SIZE;
    const cy = Math.random() * SIZE;
    const sides = 4 + Math.floor(Math.random() * 3);
    const radii = Array.from({ length: sides }, () => 26 + Math.random() * 74);
    const spin = Math.random() * Math.PI * 2;
    const proud = Math.random() > 0.5;

    const path = (ctx) => {
      ctx.beginPath();
      radii.forEach((r, p) => {
        const a = spin + (p / sides) * Math.PI * 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    };

    wrapped(s.c, () => {
      s.c.fillStyle = proud ? PALETTE.bloom(0.13) : PALETTE.damp(0.16);
      path(s.c);
    });
    wrapped(s.h, () => {
      s.h.fillStyle = proud ? raise(0.3) : carve(0.3);
      path(s.h);
    });
  }

  // Chips and pits knocked out of the faces.
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 1.5 + Math.random() * 6;
    wrapped(s.c, () => {
      s.c.fillStyle = PALETTE.damp(0.3);
      s.c.beginPath();
      s.c.arc(x, y, r, 0, Math.PI * 2);
      s.c.fill();
    });
    wrapped(s.h, () => {
      const pit = s.h.createRadialGradient(x, y, 0, x, y, r);
      pit.addColorStop(0, carve(0.75));
      pit.addColorStop(1, carve(0));
      s.h.fillStyle = pit;
      s.h.beginPath();
      s.h.arc(x, y, r, 0, Math.PI * 2);
      s.h.fill();
    });
  }

  // Exposed aggregate — denser than a poured surface, since this is a break.
  speckle(s, 4200, 0.34);
  grime(s, 0.9);

  return finish(s, repeatX, repeatY, {
    normalStrength: 2.8,
    roughMin: 0.72,
    roughMax: 1.0,
  });
}

/** Sawn timber for the workbench. */
export function makeWoodSurface(repeatX = 2, repeatY = 1, base = PALETTE.wood) {
  const s = beginSurface(base);

  // Grain lines running along the length of the board.
  for (let i = 0; i < 150; i++) {
    const y = Math.random() * SIZE;
    const wobble = 6 + Math.random() * 16;
    const dark = Math.random() > 0.45;
    const width = 0.5 + Math.random() * 2.2;
    const line = (ctx, style) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= SIZE; x += 32) {
        ctx.lineTo(x, y + Math.sin((x / SIZE) * Math.PI * 4 + i) * wobble);
      }
      ctx.stroke();
    };
    wrapped(s.c, () => line(s.c, dark ? PALETTE.damp(0.28) : PALETTE.bloom(0.14)), 'x');
    wrapped(s.h, () => line(s.h, dark ? carve(0.35) : raise(0.2)), 'x');
  }

  // Board joints across the timber.
  for (const y of [0, SIZE / 2]) {
    s.c.fillStyle = PALETTE.damp(0.5);
    s.c.fillRect(0, y - 1, SIZE, 2);
    s.h.fillStyle = carve(0.85);
    s.h.fillRect(0, y - 1.5, SIZE, 3);
  }

  grime(s, 0.8);
  return finish(s, repeatX, repeatY, { normalStrength: 2.2, roughMin: 0.7 });
}

/**
 * Wear overlay for painted plastic: dirt, scratches, scuffs and crazing on a
 * near-white base.
 *
 * Greyscale on purpose. three multiplies `map` by the material's `color`, so a
 * single overlay serves every colour on the door — each part keeps its own
 * faded paint and picks up the same grime. Baking the colour into the texture
 * would mean generating one of these per colour.
 */
export function makeWornPaintSurface(repeatX = 1, repeatY = 1) {
  const s = beginSurface('#e9e7e1');

  // Ingrained dirt.
  blotches(s.c, 34, PALETTE.damp, 62, 0.2);
  blotches(s.c, 14, PALETTE.rust, 40, 0.16);

  // Scuffs: patches rubbed back to a duller, lighter plastic.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const rx = 8 + Math.random() * 26;
    const ry = 4 + Math.random() * 11;
    const angle = Math.random() * Math.PI;
    wrapped(s.c, () => {
      s.c.save();
      s.c.translate(x, y);
      s.c.rotate(angle);
      s.c.fillStyle = `rgba(244,244,240,${0.04 + Math.random() * 0.07})`;
      s.c.beginPath();
      s.c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      s.c.fill();
      s.c.restore();
    });
  }

  // Scratches, mostly shallow, a few cut right through the paint.
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const len = 10 + Math.random() * 90;
    const angle = Math.random() * Math.PI * 2;
    const deep = Math.random() > 0.75;
    const width = 0.5 + Math.random() * (deep ? 1.4 : 0.7);
    const draw = (ctx, style) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    };
    wrapped(s.c, () => draw(s.c, deep ? PALETTE.damp(0.5) : 'rgba(255,255,255,0.4)'));
    wrapped(s.h, () => draw(s.h, carve(deep ? 0.6 : 0.25)));
  }

  // Crazing — the fine branching cracks old plastic gets in the cold.
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * SIZE;
    let y = Math.random() * SIZE;
    let angle = Math.random() * Math.PI * 2;
    const points = [[x, y]];
    for (let seg = 0; seg < 5 + Math.floor(Math.random() * 6); seg++) {
      angle += (Math.random() - 0.5) * 1.5;
      x += Math.cos(angle) * 14;
      y += Math.sin(angle) * 14;
      points.push([x, y]);
    }
    const trace = (ctx, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      points.forEach(([px, py], n) => (n === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.stroke();
    };
    wrapped(s.c, () => trace(s.c, PALETTE.damp(0.42), 0.9));
    wrapped(s.h, () => trace(s.h, carve(0.7), 1.2));
  }

  grime(s, 0.38);

  // Dirt is rough, surviving paint is still slightly glossy — so dark means
  // rough here, the same way round as metal rather than as damp concrete.
  return finish(s, repeatX, repeatY, {
    normalStrength: 1.8,
    roughMin: 0.35,
    roughMax: 0.95,
    roughInvert: true,
  });
}

/**
 * Knitted fabric for the glove: a warp-and-weft grid with real relief, so the
 * weave catches light instead of being painted on.
 *
 * Greyscale, like the paint wear overlay — three multiplies `map` by the
 * material's colour, so one weave serves both the glove and its darker cuff.
 */
export function makeGloveSurface(repeatX = 5, repeatY = 5) {
  const s = beginSurface('#efece6');

  const threads = 24;
  const pitch = SIZE / threads;
  const width = pitch * 0.46;

  for (let i = 0; i < threads; i++) {
    const p = i * pitch;

    // Warp, running one way.
    s.c.fillStyle = 'rgba(60,58,52,0.16)';
    s.c.fillRect(p, 0, width, SIZE);
    s.h.fillStyle = raise(0.55);
    s.h.fillRect(p, 0, width, SIZE);

    // Weft, crossing it and offset by half a pitch so the two interlock.
    s.c.fillStyle = 'rgba(60,58,52,0.12)';
    s.c.fillRect(0, p + pitch * 0.5, SIZE, width);
    s.h.fillStyle = raise(0.42);
    s.h.fillRect(0, p + pitch * 0.5, SIZE, width);
  }

  // Slight unevenness, so it isn't a perfect machine grid.
  blotches(s.c, 16, PALETTE.damp, 55, 0.09);
  grain(s.c, 7);
  grain(s.h, 9);

  // Fabric is matte throughout; the range is narrow on purpose.
  return finish(s, repeatX, repeatY, {
    normalStrength: 2.4,
    roughMin: 0.66,
    roughMax: 0.96,
  });
}

/**
 * Greyscale radial falloff for use as an alphaMap. Has to fade RGB to black
 * rather than fading alpha — three samples alphaMap's green channel, so a
 * gradient that only drops its alpha reads as fully opaque everywhere.
 */
export function makeRadialFalloffTexture() {
  const size = 128;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.55, '#b4b4b4');
  gradient.addColorStop(0.85, '#232323');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Soft round falloff used for dust motes. */
/**
 * The sign on the dark room's wall: the thing from the television, drawn as a
 * cartoon of itself, pointing the way and saying so.
 *
 * Flat shapes and heavy outlines on purpose. Everything else in this building
 * is rendered — lit, tone mapped, weathered — and this is a printed notice
 * stuck to a wall, so it should look drawn, by someone, on purpose. The joke
 * only lands if it is obviously a picture of him rather than another one of him.
 *
 * `flip` mirrors the drawing, because the arm has to point at a door whose side
 * is a fact about the room, not about the artwork.
 */
/** Poster stock: off-white, and grubbier toward the edges the way tape and
 *  hands leave it. Shared so the notices in this building match each other. */
const POSTER_W = 512;
const POSTER_H = 640;
const POSTER_INK = '#1b1d1a';
const POSTER_GREEN = '#4e7d33';

function posterPaper() {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const c = canvas.getContext('2d');

  c.fillStyle = '#e8e6da';
  c.fillRect(0, 0, POSTER_W, POSTER_H);
  const grime = c.createRadialGradient(
    POSTER_W / 2, POSTER_H / 2, POSTER_H * 0.25,
    POSTER_W / 2, POSTER_H / 2, POSTER_H * 0.62
  );
  grime.addColorStop(0, 'rgba(120,118,96,0)');
  grime.addColorStop(1, 'rgba(120,118,96,0.34)');
  c.fillStyle = grime;
  c.fillRect(0, 0, POSTER_W, POSTER_H);
  for (let i = 0; i < 240; i++) {
    c.fillStyle = `rgba(90,86,70,${0.02 + Math.random() * 0.07})`;
    c.fillRect(Math.random() * POSTER_W, Math.random() * POSTER_H, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  return { canvas, c };
}

function posterTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makePosterTexture(flip = false) {
  const W = POSTER_W;
  const H = POSTER_H;
  const { canvas, c } = posterPaper();

  if (flip) {
    c.translate(W, 0);
    c.scale(-1, 1);
  }

  const ink = '#1b1d1a';
  const line = (w) => {
    c.strokeStyle = ink;
    c.lineWidth = w;
    c.lineJoin = 'round';
    c.lineCap = 'round';
  };
  const box = (x, y, w, h, r, fill) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    c.stroke();
  };

  // ── the speech bubble, up top ──────────────────────────────────────────────
  line(7);
  box(48, 40, W - 96, 150, 26, '#fbfbf5');
  // Tail, down toward the head.
  c.beginPath();
  c.moveTo(238, 186);
  c.lineTo(284, 234);
  c.lineTo(302, 186);
  c.closePath();
  c.fillStyle = '#fbfbf5';
  c.fill();
  c.stroke();

  // "THIS WAY". Drawn unmirrored inside a mirrored context, or the sign would
  // be the one thing on the wall you had to stand behind to read.
  c.save();
  if (flip) {
    c.translate(W, 0);
    c.scale(-1, 1);
  }
  c.fillStyle = ink;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = 'bold 84px "Courier New", Courier, monospace';
  c.fillText('THIS', W / 2, 92);
  c.fillText('WAY', W / 2, 158);
  c.restore();

  // ── the television itself ──────────────────────────────────────────────────
  // Sat well right of centre. The arm is what this picture is for and it needs
  // somewhere to go: at 118 the glove and its finger ran off the left edge of
  // the sheet and the sign pointed at nothing.
  const tvX = 206;
  const tvY = 250;
  const tvW = 250;
  const tvH = 200;

  line(8);
  box(tvX, tvY, tvW, tvH, 22, '#b9bdb6');       // the case
  line(6);
  box(tvX + 24, tvY + 22, tvW - 48, tvH - 70, 12, '#15181a'); // the screen

  // Two plug eyes: a round pin with two prongs, the way they are drawn on the
  // real one. Green, and flat — no gradient, this is printed.
  const face = '#4e7d33';
  for (const ex of [tvX + 84, tvX + 166]) {
    const ey = tvY + 88;
    c.fillStyle = face;
    c.beginPath();
    c.arc(ex, ey, 26, 0, Math.PI * 2);
    c.fill();
    line(5);
    c.stroke();
    c.fillStyle = face;
    for (const px of [ex - 11, ex + 11]) c.fillRect(px - 4, ey - 46, 8, 24);
  }

  // The stepped mouth, three courses of it.
  c.fillStyle = face;
  for (const [mw, my] of [[104, 0], [66, 19], [32, 38]]) {
    c.fillRect(tvX + tvW / 2 - mw / 2, tvY + 120 + my, mw, 19);
  }

  // Feet, so it is standing rather than floating.
  c.fillStyle = '#8d928b';
  line(6);
  for (const fx of [tvX + 48, tvX + tvW - 78]) {
    c.beginPath();
    c.rect(fx, tvY + tvH, 30, 26);
    c.fill();
    c.stroke();
  }

  // ── the arm, pointing ──────────────────────────────────────────────────────
  // Out of the case's left side, along a ribbed conduit, to a glove with the
  // index finger out. Ribs rather than a plain tube, because that is what the
  // arms in the medical room are.
  const armY = tvY + 112;
  line(9);
  c.beginPath();
  c.moveTo(tvX, armY);
  c.quadraticCurveTo(tvX - 40, armY + 8, tvX - 74, armY - 2);
  c.stroke();
  line(4);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = tvX - 8 - t * 58;
    const y = armY + 6 - t * 7;
    c.beginPath();
    c.moveTo(x, y - 12);
    c.lineTo(x, y + 12);
    c.stroke();
  }

  const gy = armY - 4;
  c.fillStyle = face;
  line(7);
  box(tvX - 118, gy - 25, 48, 50, 15, face);    // the fist
  c.beginPath();                                 // and the finger
  c.moveTo(tvX - 116, gy - 9);
  c.lineTo(tvX - 166, gy - 9);
  c.lineTo(tvX - 166, gy + 9);
  c.lineTo(tvX - 116, gy + 9);
  c.closePath();
  c.fillStyle = face;
  c.fill();
  c.stroke();

  // ── and a big arrow under it all, in case the finger is missed ─────────────
  line(9);
  c.fillStyle = ink;
  c.beginPath();
  c.moveTo(W - 96, 556);
  c.lineTo(160, 556);
  c.lineTo(160, 528);
  c.lineTo(72, 578);
  c.lineTo(160, 628);
  c.lineTo(160, 600);
  c.lineTo(W - 96, 600);
  c.closePath();
  c.fill();

  return posterTexture(canvas);
}

/**
 * The other notice: how to work the bucket.
 *
 * The controls are on the title card and nowhere else, which is fine until
 * someone starts at the medical room or comes back after a week. A card on the
 * wall is the diegetic version — the thing on the television connected you two
 * and then put up a sign about it, which is entirely in character.
 *
 * Same stock and the same flat cartoon hand as the THIS WAY sign, so the two
 * read as having come off the same printer.
 */
export function makeInstructionPosterTexture() {
  const { canvas, c } = posterPaper();
  const W = POSTER_W;
  const ink = POSTER_INK;

  c.textAlign = 'center';
  c.textBaseline = 'middle';

  // Title, with a rule under it.
  c.fillStyle = ink;
  c.font = 'bold 60px "Courier New", Courier, monospace';
  c.fillText('YOUR FRIEND', W / 2, 62);
  c.fillRect(56, 100, W - 112, 6);

  // The bucket itself, drawn the way it is built: a tapered pail on two stub
  // legs with a wire handle, and the two big eyes that are the whole character.
  const bx = W / 2;
  const by = 150;
  c.strokeStyle = ink;
  c.lineWidth = 7;
  c.lineJoin = 'round';
  c.lineCap = 'round';

  c.beginPath();                                  // handle, behind the body
  c.arc(bx, by + 6, 62, Math.PI, 0);
  c.stroke();

  c.beginPath();                                  // tapered body
  c.moveTo(bx - 66, by);
  c.lineTo(bx + 66, by);
  c.lineTo(bx + 50, by + 104);
  c.lineTo(bx - 50, by + 104);
  c.closePath();
  c.fillStyle = '#b9bdb6';
  c.fill();
  c.stroke();

  c.beginPath();                                  // rim
  c.ellipse(bx, by, 66, 15, 0, 0, Math.PI * 2);
  c.fillStyle = '#9aa09a';
  c.fill();
  c.stroke();

  for (const ex of [-26, 26]) {                   // eyes
    c.beginPath();
    c.arc(bx + ex, by + 48, 21, 0, Math.PI * 2);
    c.fillStyle = '#fbfbf5';
    c.fill();
    c.lineWidth = 6;
    c.stroke();
    c.beginPath();
    c.arc(bx + ex + 4, by + 52, 9, 0, Math.PI * 2);
    c.fillStyle = ink;
    c.fill();
  }

  c.lineWidth = 8;                                // legs
  for (const lx of [-24, 24]) {
    c.beginPath();
    c.moveTo(bx + lx, by + 104);
    c.lineTo(bx + lx, by + 138);
    c.stroke();
  }

  // The four things you can do, each with its key cap.
  const rows = [
    ['F', 'TAKE OVER'],
    ['WASD', 'WALK'],
    ['SPACE', 'JUMP'],
    ['G', 'STAY / COME'],
  ];
  let y = 348;
  for (const [key, what] of rows) {
    const capW = Math.max(76, key.length * 30 + 34);
    c.fillStyle = '#fbfbf5';
    c.strokeStyle = ink;
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(56, y - 30, capW, 60, 12);
    c.fill();
    c.stroke();

    c.fillStyle = ink;
    c.font = `bold ${key.length > 2 ? 30 : 40}px "Courier New", Courier, monospace`;
    c.fillText(key, 56 + capW / 2, y + 2);

    c.textAlign = 'left';
    c.font = 'bold 38px "Courier New", Courier, monospace';
    c.fillText(what, 56 + capW + 26, y + 2);
    c.textAlign = 'center';
    y += 74;
  }

  return posterTexture(canvas);
}

export function makeSoftDotTexture() {
  const size = 64;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
