# Changelog

## Unreleased

- `toggleFlash` command turns the flash on workspace switch on or off, saves it
  to `settings.json` and shows the new state on screen. Suggested key:
  `SUPER + SHIFT + Z`.

## 0.1.0 — 2026-10-09

First release.

- Hold a key (SUPER + Z suggested) to see a card on every monitor with its
  workspace number and each workspace's apps; let go of SUPER or Z in any
  order, or press Esc, to hide it.
- Flash the workspace number when switching workspaces (can be turned off).
- Click a workspace in the card to go there.
- Unit tests for the logic (node:test) in CI, plus a live check script.
