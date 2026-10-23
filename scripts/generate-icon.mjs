import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const t = Buffer.from(type);
  let crc = 0xffffffff;
  for (const b of Buffer.concat([t, data])) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, t, data, sum]);
}
function inside(x, y) {
  return (
    (y >= 120 && y <= 136 && x >= 42 && x <= 214) ||
    (x >= 70 && x <= 86 && y >= 68 && y <= 128) ||
    (x >= 123 && x <= 139 && y >= 128 && y <= 192) ||
    (x >= 176 && x <= 192 && y >= 68 && y <= 128) ||
    Math.hypot(x - 78, y - 68) <= 17 ||
    Math.hypot(x - 131, y - 192) <= 17 ||
    Math.hypot(x - 184, y - 68) <= 17
  );
}
function png(size) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let cover = 0,
        mask = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) / size) * 256;
          const py = ((y + (sy + 0.5) / 4) / size) * 256;
          const dx = Math.max(36 - px, px - 220, 0),
            dy = Math.max(36 - py, py - 220, 0);
          if (dx * dx + dy * dy <= 30 * 30) {
            mask++;
            if (inside(px, py)) cover++;
          }
        }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const a = mask ? cover / mask : 0;
      rows[i] = Math.round(49 + (239 - 49) * a);
      rows[i + 1] = Math.round(99 + (246 - 99) * a);
      rows[i + 2] = Math.round(77 + (236 - 77) * a);
      rows[i + 3] = Math.round((mask / 16) * 255);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
mkdirSync('build', { recursive: true });
const sizes = [16, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
images.forEach((img, i) => {
  const p = 6 + i * 16;
  head[p] = sizes[i] === 256 ? 0 : sizes[i];
  head[p + 1] = head[p];
  head.writeUInt16LE(1, p + 4);
  head.writeUInt16LE(32, p + 6);
  head.writeUInt32LE(img.length, p + 8);
  head.writeUInt32LE(offset, p + 12);
  offset += img.length;
});
writeFileSync('build/icon.ico', Buffer.concat([head, ...images]));
writeFileSync('build/icon.png', png(256));
