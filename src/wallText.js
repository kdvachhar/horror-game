import * as THREE from 'three';
import { ROOM, WALL_TEXT, TEXT_COLORS } from './config.js';

// The text is drawn to a canvas one character at a time so each glyph can take
// its own colour from the green -> blue -> purple cycle. Spaces don't consume a
// slot in the cycle, which keeps the repeat visually even across words.

const CANVAS_WIDTH = 2048;
const LINE_HEIGHT = 300;
const FONT_SIZE = 190;
const LETTER_SPACING = 6;

function splitLines(text) {
  // Break on the question mark so the two halves read as a taunt and a reply.
  const breakAt = text.indexOf('?');
  if (breakAt === -1) return [text];
  return [text.slice(0, breakAt + 1).trim(), text.slice(breakAt + 1).trim()];
}

function measure(ctx, line) {
  let width = 0;
  for (const char of line) width += ctx.measureText(char).width + LETTER_SPACING;
  return width - LETTER_SPACING;
}

function drawText({ glow }) {
  const lines = splitLines(WALL_TEXT);
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = LINE_HEIGHT * lines.length;

  const ctx = canvas.getContext('2d');
  ctx.font = `900 ${FONT_SIZE}px "Impact", "Haettenschweiler", "Arial Black", sans-serif`;
  ctx.textBaseline = 'middle';

  let colorIndex = 0;

  lines.forEach((line, lineNumber) => {
    // Squeeze the line horizontally if it would overrun the canvas.
    const rawWidth = measure(ctx, line);
    const scale = Math.min(1, (CANVAS_WIDTH * 0.94) / rawWidth);

    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, LINE_HEIGHT * (lineNumber + 0.5));
    ctx.scale(scale, 1);

    let x = -rawWidth / 2;
    for (const char of line) {
      const advance = ctx.measureText(char).width + LETTER_SPACING;
      if (char !== ' ') {
        const color = TEXT_COLORS[colorIndex % TEXT_COLORS.length];
        colorIndex++;

        if (glow) {
          // Bloom pass: the same glyph smeared out in its own colour.
          ctx.shadowColor = color;
          ctx.shadowBlur = 60;
          ctx.fillStyle = color;
          ctx.fillText(char, x, 0);
          ctx.fillText(char, x, 0);
        } else {
          ctx.shadowColor = color;
          ctx.shadowBlur = 26;
          ctx.fillStyle = color;
          ctx.fillText(char, x, 0);

          // Crisp core so the letters stay legible from across the room.
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.28;
          ctx.fillText(char, x, 0);
          ctx.globalAlpha = 1;
        }
      }
      x += advance;
    }
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, aspect: canvas.width / canvas.height };
}

export function createWallText(scene) {
  const group = new THREE.Group();

  const main = drawText({ glow: false });
  const bloom = drawText({ glow: true });

  const width = ROOM.width * 0.9;
  const height = width / main.aspect;
  const z = -ROOM.depth / 2 + 0.06;

  // Top of the wall, with a little headroom below the ceiling.
  const centerY = ROOM.height - height / 2 - 0.9;

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: main.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
  );
  sign.position.set(0, centerY, z);
  group.add(sign);

  // Same footprint as the sign — a larger plane would stretch the glyphs and
  // read as a second, offset copy of the text.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: bloom.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.7,
      toneMapped: false,
    })
  );
  halo.position.set(0, centerY, z + 0.02);
  group.add(halo);

  // Coloured spill onto the plaster, one light per palette colour.
  const spill = TEXT_COLORS.map((hex, i) => {
    const light = new THREE.PointLight(new THREE.Color(hex), 22, 26, 2);
    const spread = width * 0.34;
    light.position.set((i - 1) * spread, centerY, z + 2.4);
    group.add(light);
    return light;
  });

  scene.add(group);

  /**
   * Re-fit the sign to the wall. The editor can resize the hall underneath it,
   * and the text is pinned to a wall that may have just moved.
   */
  function reposition() {
    const w = ROOM.width * 0.9;
    const h = w / main.aspect;
    const y = ROOM.height - h / 2 - 0.9;
    const z = -ROOM.depth / 2 + 0.06;

    sign.geometry.dispose();
    sign.geometry = new THREE.PlaneGeometry(w, h);
    sign.position.set(0, y, z);

    halo.geometry.dispose();
    halo.geometry = new THREE.PlaneGeometry(w, h);
    halo.position.set(0, y, z + 0.02);

    spill.forEach((light, i) => light.position.set((i - 1) * w * 0.34, y, z + 2.4));
  }

  let time = 0;
  return {
    group,
    reposition,
    update(delta) {
      time += delta;
      // Tired neon: a slow breath with occasional stutters.
      const breath = 0.86 + Math.sin(time * 1.7) * 0.07 + Math.sin(time * 5.3) * 0.03;
      const stutter = Math.sin(time * 37) > 0.985 ? 0.35 : 1;
      const intensity = breath * stutter;

      halo.material.opacity = 0.7 * intensity;
      sign.material.opacity = 0.82 + 0.18 * intensity;
      spill.forEach((light, i) => {
        light.intensity = 22 * intensity * (0.8 + 0.2 * Math.sin(time * 2.1 + i));
      });
    },
  };
}
