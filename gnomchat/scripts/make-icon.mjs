// One-off: rasterize the GnomLogo vector mark into the committed square app
// icon (assets/app-icon.png) + its source (assets/icon.svg).
//
// This is intentionally decoupled from sync-theme.mjs: that script overwrites
// assets/logo.png with the website's photo mascot (public/logo.png) on every
// sync, so the app icon must live in its own committed asset instead.
//
// Requires sharp (not a project dependency). Run with:
//   npm i --no-save sharp && node scripts/make-icon.mjs && npm uninstall --no-save sharp
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SIZE = 1024;
const BG = '#c8e89a';      // brand light green (matches splash/adaptive background)
const FG = '#2d7d32';      // brand dark green (matches notification color)

// Native gnome paths are authored in a 140 x 209 viewBox.
const NATIVE_W = 140;
const NATIVE_H = 209;
const TARGET_H = 620;                     // logo height on the 1024 canvas
const scale = TARGET_H / NATIVE_H;
const w = NATIVE_W * scale;
const tx = (SIZE - w) / 2;
const ty = (SIZE - TARGET_H) / 2;

const paths = [
  'M65.5885 3.01814C67.3259 -1.00605 73.032 -1.00604 74.7694 3.01815L139.526 153.009C141.134 156.734 137.869 160.723 133.899 159.882L74.3232 147.263C71.5907 146.685 68.7672 146.685 66.0347 147.263L6.45875 159.882C2.48902 160.723 -0.776153 156.734 0.832247 153.009L65.5885 3.01814Z',
  'M0 198.339C0 186.595 7.16489 176.039 18.0795 171.703C29.8724 167.019 43.0447 167.218 54.69 172.259L66.057 177.179C68.5744 178.269 71.4289 178.276 73.9521 177.2L85.9455 172.085C97.5049 167.156 110.55 167.024 122.206 171.719C132.958 176.049 140 186.477 140 198.068V208.886H0V198.339Z',
  'M70 174.386C78.2843 174.386 85 168.79 85 161.886C85 154.982 78.2843 149.386 70 149.386C61.7157 149.386 55 154.982 55 161.886C55 168.79 61.7157 174.386 70 174.386Z',
];

const svg = `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})" fill="${FG}">
    ${paths.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
</svg>`;

writeFileSync(new URL('../assets/icon.svg', import.meta.url), svg);

await sharp(Buffer.from(svg)).png().toFile(new URL('../assets/app-icon.png', import.meta.url).pathname.replace(/^\//, ''));
console.log('Wrote assets/app-icon.png (1024x1024) and assets/icon.svg');