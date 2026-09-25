/**
 * Dependency-free PWA icon generator.
 *
 * Writes public/icons/*.png from code so the repository carries no binary
 * assets of unknown provenance and another agent can regenerate them with
 * `npm run icons`. Deliberately plain: a dark field, a pale road line rising
 * left-to-right, and a marker dot. No third-party imagery, no rights questions.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance from point p to segment ab, in pixels. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const BG = [18, 16, 14, 255];
const ROAD = [232, 226, 214, 255];
const MARK = [214, 122, 74, 255];

function draw(size, inset) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size;
  const i = inset * s;
  // Road polyline in normalised coordinates, then scaled into the safe area.
  const pts = [
    [0.14, 0.80],
    [0.36, 0.66],
    [0.52, 0.68],
    [0.70, 0.44],
    [0.86, 0.26],
  ].map(([x, y]) => [i + x * (s - 2 * i), i + y * (s - 2 * i)]);
  const roadW = Math.max(2, s * 0.055);
  const markR = Math.max(3, s * 0.085);
  const [mx, my] = pts[pts.length - 1];

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let colour = BG;
      let best = Infinity;
      for (let k = 0; k < pts.length - 1; k++) {
        best = Math.min(best, distToSegment(px, py, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]));
      }
      if (best <= roadW / 2) colour = ROAD;
      if (Math.hypot(px - mx, py - my) <= markR) colour = MARK;
      const o = (y * s + x) * 4;
      rgba[o] = colour[0];
      rgba[o + 1] = colour[1];
      rgba[o + 2] = colour[2];
      rgba[o + 3] = colour[3];
    }
  }
  return encodePng(s, s, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const files = [
  ['icon-192.png', draw(192, 0.08)],
  ['icon-512.png', draw(512, 0.08)],
  // Maskable icons need ~20% safe-area padding on every side.
  ['maskable-512.png', draw(512, 0.22)],
  ['apple-touch-icon.png', draw(180, 0.08)],
];

for (const [name, buf] of files) {
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`wrote icons/${name} (${buf.length} bytes)`);
}

writeFileSync(
  join(OUT_DIR, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#12100e"/><path d="M9 51 23 42 33 43 45 28 55 17" fill="none" stroke="#e8e2d6" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="55" cy="17" r="6" fill="#d67a4a"/></svg>\n`,
);
console.log('wrote icons/favicon.svg');
