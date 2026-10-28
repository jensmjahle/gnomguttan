#!/usr/bin/env node
// Computes the next release tag from the existing git tags.
//
//   node scripts/release/next-version.mjs --prefix web-v --start 0.7.1 --bump patch --stage alpha
//
// Prints a JSON object: { tag, version, previous, prerelease }.
//
// bump:  major | minor | patch bumps the latest version; keep reuses it, so the
//        same code can be promoted alpha -> beta -> production.
// stage: alpha | beta | production. Prerelease numbers continue from the
//        highest existing tag for that version and stage.
// start: the version to bump from while the app has no tags of its own yet.
//        The web app continues from its last v* release (0.7.1; the old v*
//        line also has a stray v2.5.0 tag, so it isn't read as history), and
//        GnomChat from 1.0.0, the version it already ships as on Google Play.

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STAGES = ["alpha", "beta", "production"];
const BUMPS = ["major", "minor", "patch", "keep"];
// release-android.yml packs the prerelease number into two digits of the
// Play Store versionCode (alpha = 100 + n, beta = 200 + n).
const MAX_PRERELEASE = 99;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseTag(tag, prefix) {
  const re = new RegExp(`^${escape(prefix)}(\\d+)\\.(\\d+)\\.(\\d+)(?:-(alpha|beta)\\.(\\d+))?$`);
  const m = tag.match(re);
  if (!m) return null;
  return {
    tag,
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    stage: m[4] ?? "production",
    n: m[5] ? Number(m[5]) : 0,
  };
}

export function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  }
  const rank = STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
  return rank !== 0 ? rank : a.n - b.n;
}

const sameCore = (a, core) => a.core.every((v, i) => v === core[i]);

export function nextTag({ tags, prefix, bump, stage, start }) {
  if (!BUMPS.includes(bump)) throw new Error(`Unknown bump "${bump}".`);
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage "${stage}".`);

  const parsed = tags.map((t) => parseTag(t, prefix)).filter(Boolean).sort(compare);
  const latest = parsed.at(-1) ?? null;
  const startCore = start ? parseTag(start, "")?.core : [0, 0, 0];
  if (!startCore) throw new Error(`Start version "${start}" is not major.minor.patch.`);
  const [major, minor, patch] = latest?.core ?? startCore;

  let core;
  if (bump === "major") core = [major + 1, 0, 0];
  else if (bump === "minor") core = [major, minor + 1, 0];
  else if (bump === "patch") core = [major, minor, patch + 1];
  else {
    if (!latest) throw new Error(`No ${prefix}* tags yet, so there is no version to keep. Pick major, minor or patch.`);
    core = latest.core;
  }

  const atCore = parsed.filter((p) => sameCore(p, core));
  const coreStr = core.join(".");

  if (atCore.some((p) => p.stage === "production")) {
    throw new Error(`${prefix}${coreStr} is already released to production. Pick major, minor or patch.`);
  }

  let version = coreStr;
  if (stage !== "production") {
    if (stage === "alpha" && atCore.some((p) => p.stage === "beta")) {
      throw new Error(`${prefix}${coreStr} is already in beta and cannot go back to alpha. Use beta, production, or bump the version.`);
    }
    const n = Math.max(0, ...atCore.filter((p) => p.stage === stage).map((p) => p.n)) + 1;
    if (n > MAX_PRERELEASE) throw new Error(`${prefix}${coreStr}-${stage} has reached ${MAX_PRERELEASE} builds. Bump the version.`);
    version = `${coreStr}-${stage}.${n}`;
  }

  const tag = `${prefix}${version}`;
  if (tags.includes(tag)) throw new Error(`Tag ${tag} already exists.`);

  return { tag, version, previous: latest?.tag ?? null, prerelease: stage !== "production" };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected argument "${argv[i]}".`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { prefix = "v", bump = "patch", stage = "production", start } = parseArgs(process.argv.slice(2));
    const tags = execSync("git tag --list", { encoding: "utf8" }).split("\n").filter(Boolean);
    console.log(JSON.stringify(nextTag({ tags, prefix, bump, stage, start })));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
