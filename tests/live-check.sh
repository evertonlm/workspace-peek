#!/usr/bin/env bash
# Live check against a running Omarchy session (not run in CI).
# Needs the plugin installed and enabled. Pass --switch to also test the
# flash on workspace switch (briefly changes the focused workspace).
set -uo pipefail

ID=evertonlm.workspace-peek
state() { omarchy-shell shell call "$ID" state x; }
fails=0
check() { # name expected actual
  if [[ "$3" == "$2" ]]; then echo "ok   $1"; else echo "FAIL $1: expected '$2', got '$3'"; fails=$((fails + 1)); fi
}

omarchy-shell shell hide "$ID" >/dev/null; sleep 0.2
check "starts closed" closed "$(state)"

omarchy-shell shell summon "$ID" '{"mode":"peek"}' >/dev/null; sleep 0.4
check "peek opens" peek "$(state)"

omarchy-shell shell summon "$ID" '{"mode":"flash"}' >/dev/null; sleep 0.2
check "flash does not interrupt peek" peek "$(state)"

omarchy-shell shell hide "$ID" >/dev/null; sleep 0.2
check "hide closes" closed "$(state)"

omarchy-shell shell summon "$ID" '{"mode":"peek"}' >/dev/null; omarchy-shell shell hide "$ID" >/dev/null; sleep 0.6
check "fast press+release stays closed" closed "$(state)"

omarchy-shell shell summon "$ID" '{"mode":"flash","duration":300}' >/dev/null; sleep 0.15
check "flash opens" flash "$(state)"
sleep 0.5
check "flash hides itself" closed "$(state)"

if [[ "${1:-}" == "--switch" ]]; then
  settings="$HOME/.config/workspace-peek/settings.json"
  flash_is() { jq -r 'if .flashOnSwitch == false then "off" else "on" end' "$settings" 2>/dev/null || echo on; }
  set_flash() { [[ $(flash_is) == "$1" ]] || omarchy-shell shell call "$ID" toggleFlash x >/dev/null; sleep 0.5; }
  original=$(flash_is)
  current=$(hyprctl activeworkspace -j | jq -r .id)
  target=$(( current == 9 ? 8 : 9 ))
  switch_to() { hyprctl dispatch "hl.dsp.focus({ workspace = \"$1\" })" >/dev/null; }

  set_flash on
  switch_to "$target"; sleep 0.4
  check "flash on workspace switch" flash "$(state)"
  switch_to "$current"; sleep 1.2

  set_flash off
  switch_to "$target"; sleep 0.4
  check "no flash when turned off" closed "$(state)"
  switch_to "$current"; sleep 0.3

  set_flash "$original"
fi

[[ $fails -eq 0 ]] && echo "all live checks passed" || { echo "$fails live check(s) failed"; exit 1; }
