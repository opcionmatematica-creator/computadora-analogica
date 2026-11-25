#!/usr/bin/env python3
"""Exporta de cada proyecto KiCad un netlist compacto para el montaje en protoboard:
    web/assets/<proyecto>/netlist.json = {"parts": [{ref, value, fp, lib, pins: {num: net}}]}
Las conexiones salen del netlist del propio KiCad (kicad-cli), no de una copia a mano.

    python hardware/export_proto.py
"""
import glob
import json
import os
import subprocess
import tempfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CLI = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "KiCad", "10.0", "bin", "kicad-cli.exe")


def export(pdir):
    name = os.path.basename(pdir)
    sch = os.path.join(pdir, name + ".kicad_sch")
    tmp = os.path.join(tempfile.gettempdir(), name + "_net.xml")
    subprocess.run([CLI, "sch", "export", "netlist", "--format", "kicadxml", "-o", tmp, sch],
                   check=True, capture_output=True)
    root = ET.parse(tmp).getroot()
    parts = {}
    for c in root.iter("comp"):
        ref = c.get("ref")
        if ref.startswith("#"):
            continue
        lib = c.find("libsource")
        parts[ref] = {"ref": ref, "value": c.findtext("value"), "fp": (c.findtext("footprint") or "").split(":")[-1],
                      "lib": f"{lib.get('lib')}:{lib.get('part')}" if lib is not None else "", "pins": {}}
    for n in root.iter("net"):
        nm = n.get("name").lstrip("/")
        for node in n.iter("node"):
            r = node.get("ref")
            if r in parts:
                parts[r]["pins"][node.get("pin")] = nm
    out = os.path.join(ROOT, "web", "assets", name)
    os.makedirs(out, exist_ok=True)
    json.dump({"parts": sorted(parts.values(), key=lambda p: p["ref"])}, open(os.path.join(out, "netlist.json"), "w"), indent=0)
    print("  ok", name, len(parts), "piezas")


if __name__ == "__main__":
    for p in sorted(glob.glob(os.path.join(HERE, "m*_*")) + glob.glob(os.path.join(HERE, "practica5", "p5_*"))):
        if os.path.isdir(p):
            export(p)
