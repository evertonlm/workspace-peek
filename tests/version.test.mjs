import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("manifest version matches the newest released CHANGELOG entry", () => {
  const manifest = JSON.parse(read("manifest.json")).version;
  const released = read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)/m);
  assert.ok(released, "CHANGELOG has no released version heading");
  assert.equal(manifest, released[1]);
});
