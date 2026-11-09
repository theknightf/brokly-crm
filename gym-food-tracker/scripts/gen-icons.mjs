// Generates PNG icons with no dependencies (pure Node: zlib + a tiny PNG encoder).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const BG = [15, 42, 26];
const FG = [190, 242, 100];

// Dumbbell as rectangles in unit coordinates (x0, y0, x1, y1)
const RECTS = [
  [0.15, 0.465, 0.85, 0.535],
  [0.22, 0.38, 0.29, 0.62],
  [0.71, 0.38, 0.78, 0.62],
  [0.31, 0.28, 0.39, 0.72],
  [0.61, 0.28, 0.69, 0.72],
];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, { rounded, glyphScale }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = rounded ? size * 0.22 : 0;
  const inside = (x, y) => {
    if (!rounded) return true;
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const gu = (u - 0.5) / glyphScale + 0.5;
      const gv = (v - 0.5) / glyphScale + 0.5;
      const isFg = RECTS.some(([a, b, c, d]) => gu >= a && gu <= c && gv >= b && gv <= d);
      const col = isFg ? FG : BG;
      const o = row + 1 + x * 4;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
      raw[o + 3] = inside(x + 0.5, y + 0.5) ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['pwa-192.png', 192, { rounded: true, glyphScale: 1 }],
  ['pwa-512.png', 512, { rounded: true, glyphScale: 1 }],
  ['pwa-maskable-512.png', 512, { rounded: false, glyphScale: 0.72 }],
  ['apple-touch-icon.png', 180, { rounded: false, glyphScale: 0.9 }],
];
for (const [name, size, opts] of files) writeFileSync(join(out, name), png(size, opts));
console.log('Icons generated in public/');
