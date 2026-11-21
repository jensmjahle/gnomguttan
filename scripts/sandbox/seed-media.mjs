// Procedurally generated test media for the sandbox: a PNG "photo" and an animated GIF.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 480×300 sunset-over-mountains picture. */
export function makeMountainPng() {
  const width = 480;
  const height = 300;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const mix = (a, b, t) => Math.round(a + (b - a) * t);

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const t = y / height;
      let rgb = [mix(255, 94, t), mix(170, 60, t), mix(90, 140, t)];
      const sunDistance = Math.hypot(x - 330, y - 150);
      if (sunDistance < 42) rgb = [255, 236, 160];
      else if (sunDistance < 70) rgb = rgb.map((value, i) => mix(value, [255, 220, 150][i], (70 - sunDistance) / 70));
      const far = 175 + 35 * Math.sin(x / 47) + 18 * Math.sin(x / 13 + 1);
      const near = 225 + 30 * Math.sin(x / 61 + 2) + 10 * Math.sin(x / 9);
      if (y > near) rgb = [mix(38, 20, (y - near) / 80), mix(52, 30, (y - near) / 80), mix(70, 45, (y - near) / 80)];
      else if (y > far) rgb = [72, 64, 110];
      const offset = row + 1 + x * 3;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * GIF image data without real compression: a clear code every (2^k - 2)
 * literals keeps the LZW code width fixed, which every decoder accepts.
 */
function lzwUncompressed(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const width = minCodeSize + 1;
  const chunk = (1 << minCodeSize) - 2;
  const bytes = [];
  let current = 0;
  let bits = 0;
  const emit = (code) => {
    current |= code << bits;
    bits += width;
    while (bits >= 8) {
      bytes.push(current & 0xff);
      current >>= 8;
      bits -= 8;
    }
  };
  indices.forEach((index, i) => {
    if (i % chunk === 0) emit(clear);
    emit(index);
  });
  emit(clear + 1);
  if (bits > 0) bytes.push(current & 0xff);

  const blocks = [minCodeSize];
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255);
    blocks.push(block.length, ...block);
  }
  blocks.push(0);
  return blocks;
}

/** A looping 120×120 GIF of a bouncing, colour-cycling ball. */
export function makeBouncingGif() {
  const size = 120;
  const frames = 14;
  const palette = [
    [30, 27, 46], [52, 47, 80], [255, 196, 0], [255, 160, 0], [255, 120, 60], [236, 72, 153],
    [129, 140, 248], [34, 197, 94], [255, 255, 255], [20, 18, 32], [80, 72, 120], [255, 230, 120],
    [200, 90, 0], [90, 200, 250], [160, 120, 255], [0, 0, 0],
  ];
  const bytes = [
    ...Buffer.from('GIF89a', 'ascii'),
    size & 0xff, size >> 8, size & 0xff, size >> 8,
    0xf3, 0, 0,
    ...palette.flat(),
    0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0', 'ascii'), 0x03, 0x01, 0x00, 0x00, 0x00,
  ];

  for (let frame = 0; frame < frames; frame += 1) {
    const phase = frame / frames;
    const cx = size / 2 + Math.sin(phase * Math.PI * 2) * 30;
    const cy = 30 + Math.abs(Math.sin(phase * Math.PI * 2)) * 60;
    const ballColor = [2, 3, 4, 5, 6, 7, 13, 14][frame % 8];
    const pixels = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const distance = Math.hypot(x - cx, y - cy);
        if (distance < 16) pixels.push(distance < 6 && x < cx && y < cy ? 8 : ballColor);
        else if (y > 104) pixels.push(10);
        else if (Math.hypot(x - cx, y - 106) < 18 - (106 - cy) / 8 && y > 101) pixels.push(9);
        else pixels.push(y % 24 < 12 ? 0 : 1);
      }
    }
    bytes.push(0x21, 0xf9, 0x04, 0x04, 7, 0, 0, 0);
    bytes.push(0x2c, 0, 0, 0, 0, size & 0xff, size >> 8, size & 0xff, size >> 8, 0);
    bytes.push(...lzwUncompressed(pixels, 4));
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}
