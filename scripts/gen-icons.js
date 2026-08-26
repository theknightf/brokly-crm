// Generates Brokly PWA icons (PNG) using only Node built-ins (zlib).
// Creates: icon-192, icon-512, icon-maskable-512, apple-touch-icon (180).
// Design: primary-blue (#1d4ed8) background with a white "B" glyph (5x7 bitmap).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// 5x7 bitmap for the letter "B" (MSB = left column).
const B = [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110];
const GLYPH_COLS = 5;
const GLYPH_ROWS = 7;

// ── PNG encoding ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Icon rasterizer ──────────────────────────────────────────────────────────
function renderIcon(size, opts = {}) {
  const { radius = 0.2, maskable = false } = opts;
  const px = Buffer.alloc(size * size * 4);
  const corner = Math.round(size * radius);
  const cellH = Math.round((size * 0.5) / GLYPH_ROWS);
  const cellW = cellH;
  const gx = (size - GLYPH_COLS * cellW) / 2;
  const gy = (size - GLYPH_ROWS * cellH) / 2;

  const inside = (x, y) => {
    if (maskable) return true; // full-bleed background for maskable
    const r = Math.min(corner, size / 2 - 1);
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      if (!inside(x, y)) {
        px[o + 3] = 0;
        continue;
      }
      px[o] = 0x1d; // R
      px[o + 1] = 0x4e; // G
      px[o + 2] = 0xd8; // B
      px[o + 3] = 255;
      const c = Math.floor((x - gx) / cellW);
      const r = Math.floor((y - gy) / cellH);
      if (c >= 0 && c < GLYPH_COLS && r >= 0 && r < GLYPH_ROWS && ((B[r] >> (GLYPH_COLS - 1 - c)) & 1)) {
        px[o] = 0xff;
        px[o + 1] = 0xff;
        px[o + 2] = 0xff;
      }
    }
  }
  return px;
}

try {
  fs.writeFileSync(path.join(OUT, 'icon-192.png'), encodePng(192, 192, renderIcon(192)));
  fs.writeFileSync(path.join(OUT, 'icon-512.png'), encodePng(512, 512, renderIcon(512)));
  fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), encodePng(512, 512, renderIcon(512, { maskable: true })));
  fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), encodePng(180, 180, renderIcon(180)));
  console.log('Icons generated in /public/icons:');
  fs.readdirSync(OUT).forEach((f) => console.log(' -', f));
} catch (e) {
  console.error(e);
  process.exit(1);
}