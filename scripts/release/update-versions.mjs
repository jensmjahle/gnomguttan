#!/usr/bin/env node
// Records the version an app shipped in versions.json on the badges branch, which the README
// version badges read through shields.io. Run by record-version.yml after an
// app's release job succeeded, so a failed build keeps showing the last
// version that shipped:
//
//   APP=web TAG=web-v0.8.0 VERSION=0.8.0 node scripts/release/update-versions.mjs versions.json

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const APPS = ["android", "web"];

export function updateVersions(manifest, { app, tag, version, date }) {
  if (!APPS.includes(app)) throw new Error(`Unknown app "${app}". Expected one of: ${APPS.join(", ")}.`);
  const stage = version.match(/-(alpha|beta)\./)?.[1] ?? "production";
  return { ...manifest, [app]: { version, tag, stage, date } };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? ".github/versions.json";
  const { APP, TAG, VERSION } = process.env;
  if (!APP || !TAG || !VERSION) {
    console.error("APP, TAG and VERSION are required.");
    process.exit(1);
  }

  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {}

  const updated = updateVersions(manifest, { app: APP, tag: TAG, version: VERSION, date: new Date().toISOString() });
  writeFileSync(path, JSON.stringify(updated, null, 2) + "\n");
  console.log(JSON.stringify(updated, null, 2));
}
