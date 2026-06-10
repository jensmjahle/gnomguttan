// Generates Google Play store-listing assets from the app icon SVG.
//   - assets/store/icon-512.png       512x512  (high-res app icon)
//   - assets/store/feature-graphic.png 1024x500 (feature / promo graphic)
//
// Requires `sharp` (not a project dependency). Run once with:
//   npm install --no-save sharp
//   FONTCONFIG_FILE=scripts/_fonts.conf node scripts/generate-store-assets.mjs
// The FONTCONFIG_FILE points sharp at assets/fonts so the wordmark uses Futura.

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const GREEN_DARK = '#2d7d32';
const GREEN_BG = '#c8e89a';
const OUT = 'assets/store';

// The gnome mark (same paths as assets/icon.svg), as a transparent-background group.
const gnomeGroup = `
  <g transform="translate(304.3444976076555 202) scale(2.9665071770334928)" fill="${GREEN_DARK}">
    <path d="M65.5885 3.01814C67.3259 -1.00605 73.032 -1.00604 74.7694 3.01815L139.526 153.009C141.134 156.734 137.869 160.723 133.899 159.882L74.3232 147.263C71.5907 146.685 68.7672 146.685 66.0347 147.263L6.45875 159.882C2.48902 160.723 -0.776153 156.734 0.832247 153.009L65.5885 3.01814Z"/>
    <path d="M0 198.339C0 186.595 7.16489 176.039 18.0795 171.703C29.8724 167.019 43.0447 167.218 54.69 172.259L66.057 177.179C68.5744 178.269 71.4289 178.276 73.9521 177.2L85.9455 172.085C97.5049 167.156 110.55 167.024 122.206 171.719C132.958 176.049 140 186.477 140 198.068V208.886H0V198.339Z"/>
    <path d="M70 174.386C78.2843 174.386 85 168.79 85 161.886C85 154.982 78.2843 149.386 70 149.386C61.7157 149.386 55 154.982 55 161.886C55 168.79 61.7157 174.386 70 174.386Z"/>
  </g>`;

await mkdir(OUT, { recursive: true });

// --- 1. High-res app icon: 512x512 ---------------------------------------
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${GREEN_BG}"/>
  ${gnomeGroup}
</svg>`;

await sharp(Buffer.from(iconSvg))
  .resize(512, 512)
  .png()
  .toFile(`${OUT}/icon-512.png`);
console.log('wrote', `${OUT}/icon-512.png`, '512x512');

// --- 2. Feature graphic: 1024x500 ----------------------------------------
// Left: rounded app-icon badge with soft shadow. Right: wordmark + tagline.
const W = 1024, H = 500;
const badge = 320;            // badge size
const badgeX = 70, badgeY = (H - badge) / 2;
const radius = 72;

// Badge: light-green rounded square holding the gnome (echoes the app icon).
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${badge}" height="${badge}" viewBox="0 0 1024 1024">
  <defs><clipPath id="r"><rect width="1024" height="1024" rx="${radius * (1024 / badge)}" ry="${radius * (1024 / badge)}"/></clipPath></defs>
  <g clip-path="url(#r)">
    <rect width="1024" height="1024" fill="${GREEN_BG}"/>
    ${gnomeGroup}
  </g>
</svg>`;
const badgePng = await sharp(Buffer.from(badgeSvg)).resize(badge, badge).png().toBuffer();

// Background: soft diagonal green gradient + the wordmark text.
const textX = badgeX + badge + 60;
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d8f0ad"/>
      <stop offset="1" stop-color="#bfe488"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <text x="${textX}" y="245" font-family="Futura Cyrillic" font-weight="bold" font-size="104" fill="${GREEN_DARK}">GnomChat</text>
  <text x="${textX + 4}" y="305" font-family="Futura Cyrillic" font-weight="500" font-size="40" fill="#3f6b34">Meldinger for gjengen</text>
</svg>`;

// Soft shadow for the badge.
const shadow = await sharp({
  create: { width: badge + 40, height: badge + 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${badge + 40}" height="${badge + 40}"><rect x="20" y="24" width="${badge}" height="${badge}" rx="${radius}" fill="#1b4d1f" fill-opacity="0.28"/></svg>`),
  }])
  .blur(14)
  .png()
  .toBuffer();

await sharp(Buffer.from(bgSvg))
  .composite([
    { input: shadow, left: badgeX - 20, top: badgeY - 16 },
    { input: badgePng, left: badgeX, top: Math.round(badgeY) },
  ])
  .png()
  .toFile(`${OUT}/feature-graphic.png`);
console.log('wrote', `${OUT}/feature-graphic.png`, `${W}x${H}`);
