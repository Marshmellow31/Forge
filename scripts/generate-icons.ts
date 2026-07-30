import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Generates the PWA icon set.
 *
 * Written by hand rather than pulled from a design tool because the mark is
 * trivial — the same amber "F" on near-black the app shell already renders —
 * and because a build that can regenerate its own icons has no binary assets
 * to drift out of sync with `tokens.ts`.
 *
 * `npm run icons`. Re-run after changing the brand colours.
 */

// From shared/design/tokens.ts. Kept as literals because this script runs in
// Node before any bundler alias exists.
const INK = [0x24, 0x1a, 0x00];      // c.inverse
const AMBER = [0xf3, 0xdc, 0x85];    // c.primary

type RGB = readonly number[];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encodes RGBA pixels as a PNG. No dependencies — zlib is built in. */
function encodePng(width: number, height: number, pixels: Uint8Array): Buffer {
  const stride = width * 4;
  // Each scanline is prefixed with its filter type; 0 = None.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draws the mark.
 *
 * `padding` is the fraction of the canvas kept clear around the glyph. A
 * maskable icon needs a much larger safe area because launchers crop it to
 * whatever shape they like — Android's circle mask removes the corners
 * entirely, so a glyph sized for the plain icon would lose its arms.
 */
function drawIcon(size: number, { maskable }: { maskable: boolean }): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const put = (x: number, y: number, [r, g, b]: RGB) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };

  // Background. A maskable icon must bleed to the edges; a plain one gets
  // rounded corners so it looks right when a platform does not mask it.
  const radius = maskable ? 0 : size * 0.22;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (radius > 0) {
        const cx = Math.min(Math.max(x, radius), size - radius);
        const cy = Math.min(Math.max(y, radius), size - radius);
        if (Math.hypot(x - cx, y - cy) > radius) continue;
      }
      put(x, y, INK);
    }
  }

  // The letter F, as three rectangles.
  const pad = maskable ? 0.30 : 0.22;
  const left = Math.round(size * pad);
  const top = Math.round(size * pad);
  const glyphH = size - top * 2;
  const glyphW = Math.round(glyphH * 0.62);
  const bar = Math.max(2, Math.round(glyphH * 0.17));

  const rect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) put(x, y, AMBER);
  };

  rect(left, top, bar, glyphH);                                        // stem
  rect(left, top, glyphW, bar);                                        // top arm
  rect(left, top + Math.round(glyphH * 0.42), Math.round(glyphW * 0.78), bar); // middle arm

  return px;
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, maskable: false },
  { file: 'public/icons/icon-512.png', size: 512, maskable: false },
  { file: 'public/icons/maskable-512.png', size: 512, maskable: true },
  { file: 'public/icons/apple-touch-icon.png', size: 180, maskable: false },
  { file: 'public/favicon-32.png', size: 32, maskable: false },
];

for (const { file, size, maskable } of targets) {
  const path = resolve(process.cwd(), file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(size, size, drawIcon(size, { maskable })));
  console.log(`wrote ${file} (${size}×${size}${maskable ? ', maskable' : ''})`);
}
