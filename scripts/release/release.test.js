import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTag } from "./next-version.mjs";
import { updateVersions } from "./update-versions.mjs";

const next = (tags, opts) => nextTag({ tags, prefix: "web-v", ...opts });

test("first release bumps from the start version", () => {
  assert.equal(next(["v0.7.1", "v2.5.0"], { bump: "patch", stage: "alpha", start: "0.7.1" }).tag, "web-v0.7.2-alpha.1");
  assert.equal(next([], { bump: "minor", stage: "production", start: "0.7.1" }).tag, "web-v0.8.0");
  assert.equal(nextTag({ tags: [], prefix: "android-v", bump: "patch", stage: "alpha", start: "1.0.0" }).tag, "android-v1.0.1-alpha.1");
});

test("existing tags win over the start version", () => {
  const r = next(["web-v0.8.0"], { bump: "patch", stage: "production", start: "0.7.1" });
  assert.deepEqual(r, { tag: "web-v0.8.1", version: "0.8.1", previous: "web-v0.8.0", prerelease: false });
});

test("keep promotes the same version through the stages", () => {
  const tags = ["web-v0.8.1-alpha.1", "web-v0.8.1-alpha.2"];
  assert.equal(next(tags, { bump: "keep", stage: "alpha" }).tag, "web-v0.8.1-alpha.3");
  assert.equal(next(tags, { bump: "keep", stage: "beta" }).tag, "web-v0.8.1-beta.1");
  assert.equal(next([...tags, "web-v0.8.1-beta.1"], { bump: "keep", stage: "production" }).tag, "web-v0.8.1");
});

test("refuses invalid moves", () => {
  assert.throws(() => next([], { bump: "keep", stage: "alpha" }), /no version to keep/);
  assert.throws(() => next(["web-v0.8.1-beta.1"], { bump: "keep", stage: "alpha" }), /cannot go back to alpha/);
  assert.throws(() => next(["web-v0.8.1"], { bump: "keep", stage: "beta" }), /already released to production/);
  assert.throws(() => next([], { bump: "patch", stage: "alpha", start: "latest" }), /not major.minor.patch/);
});

test("records the shipped version and stage per app", () => {
  const before = { android: { version: "1.0.0" } };
  const after = updateVersions(before, { app: "web", tag: "web-v0.8.0-beta.2", version: "0.8.0-beta.2", date: "d" });
  assert.deepEqual(after.web, { version: "0.8.0-beta.2", tag: "web-v0.8.0-beta.2", stage: "beta", date: "d" });
  assert.equal(after.android.version, "1.0.0");
  assert.throws(() => updateVersions({}, { app: "ios", tag: "", version: "1.0.0" }), /Unknown app/);
});
