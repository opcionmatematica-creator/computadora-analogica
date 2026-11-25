#!/usr/bin/env bash
# Render 3D (Blender Cycles) de cada placa: web/assets/<modulo>/render.png
# Uso:  bash blender/render_all.sh [muestras]
BL="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.3/blender.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"
S="${1:-64}"
for d in "$ROOT"/web/assets/m*_*/; do
  d="${d%/}"
  [ -f "$d/placa.glb" ] || continue
  LC_ALL=C LANG=C "$BL" -b -P "$ROOT/blender/blender_panel.py" -- "$d/placa.glb" "$d/render.png" \
      --studio --res 1200 --samples "$S" --az 28 --el 40 2>&1 | grep -E "WROTE|Error" | tail -2
done
