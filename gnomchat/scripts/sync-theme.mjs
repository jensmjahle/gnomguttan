// ─────────────────────────────────────────────────────────────────────────────
// sync-theme.mjs
//
// Single source of truth for theming lives in the WEBSITE repo (the parent of
// gnomchat/). React Native cannot read CSS custom properties, so this script
// derives an RN-consumable token module from the website sources and copies the
// shared font/background/logo assets. Re-run it (postinstall + in CI) so that
// any theme change on the website propagates to the app on the next build.
//
//   reads:  ../src/styles/themes.css     (per-theme color tokens)
//           ../src/styles/globals.css    (global radius/shadow/font tokens)
//           ../src/config/themes.ts      (theme metadata: id/label/description)
//           ../public/fonts/*.ttf        (Futura PT)
//           ../public/images/backgrounds (theme background images)
//           ../public/logo.png           (app icon / splash / notification icon)
//   writes: src/theme/themeTokens.generated.ts
//           assets/fonts/, assets/backgrounds/, assets/logo.png
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(APP_DIR, '..');

const THEMES_CSS = join(REPO_ROOT, 'src', 'styles', 'themes.css');
const GLOBALS_CSS = join(REPO_ROOT, 'src', 'styles', 'globals.css');
const THEMES_TS = join(REPO_ROOT, 'src', 'config', 'themes.ts');
const FONTS_SRC = join(REPO_ROOT, 'public', 'fonts');
const BG_SRC = join(REPO_ROOT, 'public', 'images', 'backgrounds');
const LOGO_SRC = join(REPO_ROOT, 'public', 'logo.png');

const OUT_TOKENS = join(APP_DIR, 'src', 'theme', 'themeTokens.generated.ts');
const FONTS_OUT = join(APP_DIR, 'assets', 'fonts');
const BG_OUT = join(APP_DIR, 'assets', 'backgrounds');
const LOGO_OUT = join(APP_DIR, 'assets', 'logo.png');

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Iterate top-level CSS rule blocks: `selector { body }`.
function* cssRules(css) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    yield { selector: m[1].trim(), body: m[2] };
  }
}

function parseVars(body) {
  const vars = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    vars[m[1].trim()] = m[2].trim();
  }
  return vars;
}

function parseBgImage(value) {
  const v = value.trim();
  if (v === 'none') return { type: 'none' };

  const url = v.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
  if (url) {
    const asset = url[1].split('/').pop();
    return { type: 'image', asset };
  }

  if (v.startsWith('linear-gradient')) {
    const inner = v.slice(v.indexOf('(') + 1, v.lastIndexOf(')'));
    let angle = 180;
    const degMatch = inner.match(/(-?\d+(?:\.\d+)?)deg/);
    if (degMatch) {
      angle = Number(degMatch[1]);
    } else if (/to\s+top\b/.test(inner)) angle = 0;
    else if (/to\s+right\b/.test(inner)) angle = 90;
    else if (/to\s+left\b/.test(inner)) angle = 270;
    else if (/to\s+bottom\b/.test(inner)) angle = 180;
    const stops = (inner.match(/#[0-9a-fA-F]{3,8}/g) || []);
    return { type: 'gradient', angle, stops };
  }

  // Unknown form — treat as solid background fallback.
  return { type: 'none' };
}

// On EAS cloud builds only the gnomchat/ folder is uploaded, so the website
// sources in the parent repo aren't present. In that case skip generation and
// rely on the committed themeTokens.generated.ts + assets/.
if (!existsSync(THEMES_CSS)) {
  console.log('[sync-theme] website sources not found at', THEMES_CSS);
  console.log('[sync-theme] skipping — using committed tokens & assets.');
  process.exit(0);
}

// ── Parse per-theme color tokens from themes.css ────────────────────────────
const themesCss = readFileSync(THEMES_CSS, 'utf8');
const themeTokens = {};

for (const { selector, body } of cssRules(themesCss)) {
  const ids = [...selector.matchAll(/data-theme=['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (ids.length === 0) continue; // skip bare :root default (covered by light selector)
  const vars = parseVars(body);

  for (const id of ids) {
    const token = {};
    for (const [name, value] of Object.entries(vars)) {
      if (name === 'bg-image') {
        token.bgImage = parseBgImage(value);
      } else if (name === 'font-sans') {
        // Any per-theme font override means "use the system font" (e.g. Arial).
        token.fontOverride = true;
      } else {
        token[camel(name)] = value;
      }
    }
    if (!token.bgImage) token.bgImage = { type: 'none' };
    if (token.fontOverride === undefined) token.fontOverride = false;
    themeTokens[id] = token;
  }
}

// ── Parse global tokens (radius/shadow) from globals.css :root ──────────────
const globalsCss = readFileSync(GLOBALS_CSS, 'utf8');
const globalVars = {};
for (const { selector, body } of cssRules(globalsCss)) {
  if (!selector.includes(':root') || /data-theme/.test(selector)) continue;
  Object.assign(globalVars, parseVars(body));
}
const radius = {
  sm: parseInt(globalVars['radius-sm'] || '6', 10),
  md: parseInt(globalVars['radius-md'] || '10', 10),
  lg: parseInt(globalVars['radius-lg'] || '16', 10),
  full: 9999,
};

// ── Parse theme metadata (id/label/description, order) from themes.ts ────────
const themesTs = readFileSync(THEMES_TS, 'utf8');
const themeList = [...themesTs.matchAll(
  /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*description:\s*'([^']+)'/g,
)].map((m) => ({ id: m[1], label: m[2], description: m[3] }));

// ── Copy shared assets ───────────────────────────────────────────────────────
function copyDir(src, out, filter = () => true) {
  if (!existsSync(src)) return [];
  mkdirSync(out, { recursive: true });
  const copied = [];
  for (const file of readdirSync(src)) {
    if (!filter(file)) continue;
    copyFileSync(join(src, file), join(out, file));
    copied.push(file);
  }
  return copied;
}

const fonts = copyDir(FONTS_SRC, FONTS_OUT, (f) => f.endsWith('.ttf'));
const backgrounds = copyDir(BG_SRC, BG_OUT, (f) => /\.(png|jpe?g|webp)$/i.test(f));
mkdirSync(dirname(LOGO_OUT), { recursive: true });
if (existsSync(LOGO_SRC)) copyFileSync(LOGO_SRC, LOGO_OUT);

// ── Emit generated tokens module ─────────────────────────────────────────────
// Static require() map for background images so Metro can bundle them.
const bgRequires = backgrounds
  .map((f) => `  '${f}': require('../../assets/backgrounds/${f}'),`)
  .join('\n');

const banner = `// AUTO-GENERATED by scripts/sync-theme.mjs — DO NOT EDIT BY HAND.
// Source of truth: ../src/styles/themes.css + globals.css + config/themes.ts (website repo).
// Re-run \`npm run sync-theme\` to refresh after changing the website theme.
/* eslint-disable */
`;

const out = `${banner}
export type ThemeId = ${themeList.map((t) => `'${t.id}'`).join(' | ') || 'string'};

export type BgImage =
  | { type: 'none' }
  | { type: 'image'; asset: string }
  | { type: 'gradient'; angle: number; stops: string[] };

export interface ThemeTokens {
  footerColor: string;
  bgPrimary: string;
  bgSecondary: string;
  bgHover: string;
  bgCard: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  accentFg: string;
  border: string;
  borderStrong: string;
  error: string;
  success: string;
  warning: string;
  navbarBg: string;
  chatBg: string;
  msgSelfBg: string;
  msgOtherBg: string;
  bgImage: BgImage;
  /** When true the theme uses the system font instead of Futura PT. */
  fontOverride: boolean;
}

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_TOKENS: Record<ThemeId, ThemeTokens> = ${JSON.stringify(themeTokens, null, 2)} as any;

export const THEME_LIST: ThemeMeta[] = ${JSON.stringify(themeList, null, 2)} as any;

export const DEFAULT_THEME_ID: ThemeId = ${JSON.stringify(themeList[0]?.id || 'forest')} as any;

export const RADIUS = ${JSON.stringify(radius, null, 2)};

// Static require map so Metro bundles the background images.
export const BACKGROUND_IMAGES: Record<string, number> = {
${bgRequires}
};
`;

mkdirSync(dirname(OUT_TOKENS), { recursive: true });
writeFileSync(OUT_TOKENS, out, 'utf8');

console.log('[sync-theme] themes:      ', Object.keys(themeTokens).length);
console.log('[sync-theme] metadata:    ', themeList.length, 'entries');
console.log('[sync-theme] fonts copied: ', fonts.length);
console.log('[sync-theme] backgrounds:  ', backgrounds.join(', ') || '(none)');
console.log('[sync-theme] logo:         ', existsSync(LOGO_OUT) ? 'ok' : 'MISSING');
console.log('[sync-theme] wrote', OUT_TOKENS);
