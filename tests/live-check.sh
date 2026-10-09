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
  current=$(hyprctl activeworkspace -j | jq -r .id)
  target=$(( current == 9 ? 8 : 9 ))
  hyprctl dispatch "hl.dsp.focus({ workspace = \"$target\" })" >/dev/null; sleep 0.4
  check "flash on workspace switch" flash "$(state)"
  hyprctl dispatch "hl.dsp.focus({ workspace = \"$current\" })" >/dev/null; sleep 1.2
fi

[[ $fails -eq 0 ]] && echo "all live checks passed" || { echo "$fails live check(s) failed"; exit 1; }
