import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, loadModel } from "./load-model.mjs";

const M = loadModel();
// Objects built inside the vm context have a different Object prototype;
// round-trip them through JSON before deep comparisons.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("app names: plain, reverse-DNS, web apps, known names", () => {
  assert.equal(M.appName({ class: "chromium" }), "Chromium");
  assert.equal(M.appName({ class: "foot" }), "Foot");
  assert.equal(M.appName({ class: "org.gnome.Nautilus" }), "Nautilus");
  assert.equal(M.appName({ class: "chrome-web.whatsapp.com__-Default" }), "WhatsApp");
  assert.equal(M.appName({ class: "chrome-app.example.org__-Default" }), "Example");
  assert.equal(M.appName({ class: "brave-browser" }), "Brave");
  assert.equal(M.appName({ class: "com.mitchellh.ghostty" }), "Ghostty");
});

test("app names: fall back to initialClass, then title, then 'Window'", () => {
  assert.equal(M.appName({ class: "", initialClass: "kitty" }), "Kitty");
  assert.equal(M.appName({ class: "", title: "Some dialog" }), "Some dialog");
  assert.equal(M.appName({}), "Window");
});

test("app names: Steam games use the window title", () => {
  assert.equal(M.appName({ class: "steam_app_123", title: "Cool Game" }), "Cool Game");
  assert.equal(M.appName({ class: "steam_app_123", title: "" }), "Steam game");
});

test("summary groups repeated apps and keeps it short", () => {
  assert.equal(M.summarize([]), "");
  assert.equal(M.summarize([{ name: "Foot", count: 2 }]), "Foot ×2");
  assert.equal(
    M.summarize([{ name: "A", count: 1 }, { name: "B", count: 1 }, { name: "C", count: 1 }, { name: "D", count: 1 }, { name: "E", count: 1 }]),
    "A, B, C +2",
  );
});

test("groupApps counts by name, most windows first, then first seen", () => {
  const apps = M.groupApps([{ class: "chromium" }, { class: "foot" }, { class: "foot" }, { class: "spotify" }]);
  assert.deepEqual(plain(apps), [
    { name: "Foot", count: 2 },
    { name: "Chromium", count: 1 },
    { name: "Spotify", count: 1 },
  ]);
});

test("model: monitors left to right, focused one marked", () => {
  const model = plain(M.buildModel(fixture("desk")));
  assert.deepEqual(model.monitors.map((m) => m.name), ["eDP-2", "HDMI-A-1"]);
  assert.equal(model.focusedMonitor, "eDP-2");
  assert.equal(model.monitors[0].focused, true);
  assert.equal(model.monitors[0].activeWorkspace, 1);
  assert.equal(model.monitors[1].activeWorkspace, 2);
  assert.equal(model.monitors[1].label, "Dell Inc. DELL P2319H");
});

test("model: workspaces per monitor, sorted, special workspaces hidden", () => {
  const model = plain(M.buildModel(fixture("desk")));
  assert.deepEqual(model.monitors[0].workspaces.map((w) => w.id), [1, 3]);
  assert.deepEqual(model.monitors[1].workspaces.map((w) => w.id), [2, 4]);
});

test("model: each workspace has its apps and summary; unmapped windows ignored", () => {
  const model = plain(M.buildModel(fixture("desk")));
  const ws = Object.fromEntries(model.monitors.flatMap((m) => m.workspaces).map((w) => [w.id, w]));
  assert.equal(ws[1].summary, "WhatsApp");
  assert.equal(ws[2].summary, "Foot ×2");
  assert.equal(ws[3].windows, 1);
  assert.equal(ws[4].summary, "Nautilus, Spotify");
  assert.equal(ws[1].active, true);
  assert.equal(ws[3].active, false);
});

test("model: active workspace shows even when Hyprland lists no window for it", () => {
  const data = fixture("desk");
  data.monitors.find((m) => m.name === "HDMI-A-1").activeWorkspace = { id: 7, name: "7" };
  const hdmi = plain(M.buildModel(data)).monitors.find((m) => m.name === "HDMI-A-1");
  const seven = hdmi.workspaces.find((w) => w.id === 7);
  assert.ok(seven);
  assert.equal(seven.active, true);
  assert.equal(seven.windows, 0);
  assert.equal(seven.summary, "");
});

test("model: named workspaces keep their name as label", () => {
  const data = fixture("desk");
  data.workspaces.push({ id: 11, name: "music", monitor: "eDP-2", windows: 0 });
  const edp = plain(M.buildModel(data)).monitors[0];
  assert.equal(edp.workspaces.find((w) => w.id === 11).label, "music");
  assert.equal(edp.workspaces.find((w) => w.id === 1).label, "1");
});

test("model: tolerates empty or broken input", () => {
  assert.deepEqual(plain(M.buildModel({})), { focusedMonitor: "", monitors: [] });
  assert.deepEqual(plain(M.buildModel(null)), { focusedMonitor: "", monitors: [] });
});

test("payload: peek by default, flash on request, sane durations", () => {
  assert.deepEqual(plain(M.parsePayload("")), { mode: "peek", duration: 10000 });
  assert.deepEqual(plain(M.parsePayload('{"mode":"flash"}')), { mode: "flash", duration: 900 });
  assert.deepEqual(plain(M.parsePayload('{"mode":"flash","duration":1500}')), { mode: "flash", duration: 1500 });
  assert.deepEqual(plain(M.parsePayload('{"mode":"weird","duration":-5}')), { mode: "peek", duration: 10000 });
  assert.deepEqual(plain(M.parsePayload("{not json")), { mode: "peek", duration: 10000 });
});

test("dispatch command focuses a workspace by id", () => {
  assert.equal(M.focusCommand(3), 'hyprctl dispatch \'hl.dsp.focus({ workspace = "3" })\'');
  assert.equal(M.focusCommand("3; rm -rf ~"), "");
});

test("settings: defaults, overrides and bad values", () => {
  assert.deepEqual(plain(M.parseSettings("")), { flashOnSwitch: true, flashDuration: 900 });
  assert.deepEqual(plain(M.parseSettings('{"flashOnSwitch": false}')), { flashOnSwitch: false, flashDuration: 900 });
  assert.deepEqual(plain(M.parseSettings('{"flashDuration": 1500}')), { flashOnSwitch: true, flashDuration: 1500 });
  assert.deepEqual(plain(M.parseSettings('{"flashOnSwitch": "no", "flashDuration": 0}')), { flashOnSwitch: true, flashDuration: 900 });
  assert.deepEqual(plain(M.parseSettings("{oops")), { flashOnSwitch: true, flashDuration: 900 });
});

test("keys: releasing SUPER or Z, or pressing Escape, closes the peek", () => {
  const K = { escape: 0x01000000, meta: 0x01000022, superL: 0x01000053, superR: 0x01000054, z: 0x5a, a: 0x41 };
  assert.equal(M.closesPeek(K.superL, "release"), true);
  assert.equal(M.closesPeek(K.superR, "release"), true);
  assert.equal(M.closesPeek(K.meta, "release"), true);
  assert.equal(M.closesPeek(K.z, "release"), true);
  assert.equal(M.closesPeek(K.escape, "press"), true);
  assert.equal(M.closesPeek(K.a, "release"), false);
  assert.equal(M.closesPeek(K.z, "press"), false);      // auto-repeat of the held Z must not close it
  assert.equal(M.closesPeek(K.superL, "press"), false);
});

test("settings: toggling the flash keeps other settings and writes valid JSON", () => {
  const off = M.toggleFlash(M.parseSettings('{"flashDuration": 1500}'));
  assert.deepEqual(plain(off), { flashOnSwitch: false, flashDuration: 1500 });
  assert.deepEqual(plain(M.parseSettings(M.settingsJson(off))), { flashOnSwitch: false, flashDuration: 1500 });
  assert.equal(M.toggleFlash(off).flashOnSwitch, true);
  assert.match(M.settingsJson(off), /\n$/);
});
