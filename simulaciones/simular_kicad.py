#!/usr/bin/env python3
"""Ejecuta las simulaciones hechas en KiCad (simulaciones/kicad/*/ *_sim.kicad_sch).

    python simulaciones/simular_kicad.py [carpeta ...]

Los circuitos están dibujados en KiCad: este script no define ningún circuito. Hace lo mismo
que el botón «Ejecutar» del simulador de KiCad, pero sin abrir KiCad, para sacar las imágenes:
  1. kicad-cli exporta el netlist SPICE del esquemático (con sus modelos y su directiva .tran);
  2. el ngspice que trae KiCad lo simula;
  3. guarda la tensión en cada punto de prueba TPn del esquemático.

Resultado, en cada carpeta: circuito.cir (el netlist exportado por KiCad), datos.csv y grafica.png;
para la web: web/assets/sim/kicad/<id>.json y web/assets/<id>/sim/ (esquemático de la simulación y
un recorte de la zona de cada punto de prueba).
"""
import csv
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from ngspice import run, log  # noqa: E402

KDIR = os.path.join(HERE, "kicad")
WEB = os.path.join(ROOT, "web", "assets")
CLI = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "KiCad", "10.0", "bin", "kicad-cli.exe")
if not os.path.exists(CLI):
    CLI = shutil.which("kicad-cli") or "kicad-cli"


def cli(*args, cwd=None):
    """kicad-cli desde la carpeta del esquemático: así resuelve ../modelos.lib igual que KiCad."""
    r = subprocess.run([CLI, *args], capture_output=True, text=True, cwd=cwd)
    if r.returncode:
        raise RuntimeError(" ".join(args) + "\n" + r.stdout + r.stderr)


def tp_nets(sch):
    """{TPn: nombre de la red} con el netlist del propio KiCad."""
    tmp = os.path.join(tempfile.gettempdir(), "tp_net.xml")
    cli("sch", "export", "netlist", "--format", "kicadxml", "-o", tmp, sch)
    out = {}
    for n in ET.parse(tmp).getroot().iter("net"):
        for node in n.iter("node"):
            if node.get("ref", "").startswith("TP"):
                out[node.get("ref")] = n.get("name")
    return out


def spice_name(net, deck):
    """Nombre del nodo en el netlist SPICE de KiCad para una red del esquemático."""
    nodes = set(re.findall(r"\S+", "\n".join(l for l in deck.splitlines() if l and l[0] not in ".*")))
    base = net.lstrip("/")
    for cand in (base, re.sub(r"[()\s]", "_", base), re.sub(r"[^\w+\-.]", "_", base)):
        if cand in nodes:
            return cand
    raise KeyError(f"no encuentro el nodo de la red {net!r} en el netlist")


def tp_positions(sch):
    """Posición (mm de la hoja) de cada TP en el archivo .kicad_sch."""
    txt = open(sch, encoding="utf-8").read()
    pos = {}
    for m in re.finditer(r'\(lib_id "Connector:TestPoint"\)\s*\(at ([-\d.]+) ([-\d.]+)', txt):
        rest = txt[m.end():m.end() + 4000]
        r = re.search(r'\(property "Reference" "([^"]+)"', rest)
        pos[r.group(1)] = (float(m.group(1)), float(m.group(2)))
    return pos


def svg_crop(svg, x, y, w, h, out):
    t = open(svg, encoding="utf-8").read()
    t = re.sub(r'viewBox="[^"]+"', f'viewBox="{x:.2f} {y:.2f} {w:.2f} {h:.2f}"', t, count=1)
    t = re.sub(r'width="[^"]+"', f'width="{w:.1f}mm"', t, count=1)
    t = re.sub(r'height="[^"]+"', f'height="{h:.1f}mm"', t, count=1)
    open(out, "w", encoding="utf-8").write(t)


def drawing_box(sch):
    """Rectángulo que ocupa el dibujo (sin el cajetín), a partir de cables y símbolos."""
    txt = open(sch, encoding="utf-8").read()
    xs, ys = [], []
    for m in re.finditer(r"\(xy ([-\d.]+) ([-\d.]+)\)", txt):
        xs.append(float(m.group(1))); ys.append(float(m.group(2)))
    for m in re.finditer(r'\(symbol\s*\(lib_id "[^"]+"\)\s*\(at ([-\d.]+) ([-\d.]+)', txt):
        xs.append(float(m.group(1))); ys.append(float(m.group(2)))
    for m in re.finditer(r'\(text "[^"]*"\s*(?:\(exclude_from_sim \w+\)\s*)?\(at ([-\d.]+) ([-\d.]+)', txt):
        xs.append(float(m.group(1)) + 60); ys.append(float(m.group(2)) + 8)
    return min(xs) - 14, min(ys) - 14, max(xs) + 14, max(ys) + 10


def simulate(folder):
    med = json.load(open(os.path.join(folder, "medidas.json"), encoding="utf-8"))
    sch = os.path.join(folder, med["esquematico"])
    wid = med.get("id") or med["modulo"]
    cir = os.path.join(folder, "circuito.cir")
    cli("sch", "export", "netlist", "--format", "spice", "-o", cir, sch, cwd=folder)
    deck = open(cir, encoding="utf-8").read()
    nets = tp_nets(sch)
    tps = med["puntos"]
    nodes = {p["ref"]: spice_name(nets[p["ref"]], deck) for p in tps}
    an = re.search(r"^\.(tran|ac|dc)\b", deck, re.M | re.I).group(1).lower()
    xvec = {"tran": "time", "ac": "frequency", "dc": "v-sweep"}[an]
    body = "\n".join(l for l in deck.splitlines() if l.strip().lower() != ".end")
    vecs = [xvec] + [f"v({nodes[p['ref']]})" for p in tps]
    try:
        v = run(body, vecs)
    except RuntimeError:
        print(log()[-3000:])
        raise
    x = np.real(v[xvec])
    n = 1500 if not med.get("xy") else (6000 if "lorenz" in wid else 800)
    t0 = med.get("desde", x[0])
    t1 = x[-1]
    if med.get("hasta_suelo"):          # caída libre: hasta que la altura vuelve a 0
        ref = next(p for p in tps if p["ref"] == med["hasta_suelo"])
        yg = np.real(v[f"v({nodes[ref['ref']]})"])
        below = np.where((x > t0 + 0.05) & (yg < 0))[0]
        if len(below):
            t1 = float(x[below[0]])
    xx = np.linspace(t0, t1, n)
    series = []
    for p in tps:
        y = np.real(v[f"v({nodes[p['ref']]})"])
        yy = np.interp(xx, x, y)
        series.append({**p, "nodo": nets[p["ref"]], "y": [round(float(a), 5) for a in yy],
                       "min": float(yy.min()), "max": float(yy.max()), "final": float(yy[-1])})
    # carpeta: datos.csv y grafica.png
    with open(os.path.join(folder, "datos.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["tiempo (s)"] + [s["nombre"] for s in series])
        for i in range(n):
            w.writerow([round(float(xx[i]), 6)] + [s["y"][i] for s in series])
    k = len(series) if not med.get("xy") else 1
    fig, axs = plt.subplots(k + (1 if med.get("xy") else 0), 1, figsize=(8, 2.1 * max(k, 2)), dpi=110, squeeze=False)
    if med.get("xy"):
        a, b = med["xy"]
        sa = next(s for s in series if s["ref"] == a); sb = next(s for s in series if s["ref"] == b)
        sgn = lambda s_: -1 if s_["ref"] in med.get("invertir", []) else 1  # noqa: E731
        axs[0][0].plot(sgn(sa) * np.array(sa["y"]), sgn(sb) * np.array(sb["y"]), lw=0.6)
        axs[0][0].set_xlabel(sa["nombre"]); axs[0][0].set_ylabel(sb["nombre"])
        axs[1][0].plot(xx, sa["y"], lw=0.8, label=sa["nombre"]); axs[1][0].plot(xx, sb["y"], lw=0.8, label=sb["nombre"])
        axs[1][0].legend(fontsize=7); axs[1][0].set_xlabel("tiempo (s)")
    else:
        for ax, s in zip(axs[:, 0], series):
            ax.plot(xx, s["y"], lw=1.2)
            ax.set_ylabel("V"); ax.set_title(f'{s["nombre"]}: {s["que"]}', fontsize=8, loc="left")
            ax.grid(alpha=.3)
        axs[-1][0].set_xlabel("tiempo (s)")
    fig.tight_layout(); fig.savefig(os.path.join(folder, "grafica.png")); plt.close(fig)
    # imágenes para la web: esquemático de la simulación y un recorte por punto de prueba
    out = os.path.join(WEB, wid, "sim")
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(tempfile.gettempdir(), "simsvg")
    shutil.rmtree(tmp, ignore_errors=True)
    cli("sch", "export", "svg", "-o", tmp, sch)
    svg = glob.glob(os.path.join(tmp, "*.svg"))[0]
    x0, y0, x1, y1 = drawing_box(sch)
    svg_crop(svg, x0, y0, x1 - x0, y1 - y0, os.path.join(out, "esquematico_sim.svg"))
    pos = tp_positions(sch)
    for s in series:
        px, py = pos[s["ref"]]
        svg_crop(svg, px - 45, py - 30, 90, 56, os.path.join(out, s["ref"] + ".svg"))
        s["recorte"] = f"assets/{wid}/sim/{s['ref']}.svg"
    rel = os.path.relpath(folder, ROOT).replace("\\", "/")
    data = {"id": wid, "titulo": med.get("titulo", ""), "analisis": an, "carpeta": rel,
            "esquematico": f"{rel}/{med['esquematico']}", "imagen": f"assets/{wid}/sim/esquematico_sim.svg",
            "x": [round(float(a), 6) for a in xx], "xlabel": "tiempo (s)", "xy": med.get("xy"), "invertir": med.get("invertir", []),
            "teoria": med.get("teoria"), "puntos": series}
    os.makedirs(os.path.join(WEB, "sim", "kicad"), exist_ok=True)
    json.dump(data, open(os.path.join(WEB, "sim", "kicad", wid + ".json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"  ok {os.path.basename(folder):32s} " + "  ".join(
        f'{s["ref"]}: {s["min"]:+.3f}..{s["max"]:+.3f} V' for s in series))
    return data


if __name__ == "__main__":
    sel = [a for a in sys.argv[1:] if not a.startswith("-")]
    resumen = {}
    for f in sorted(glob.glob(os.path.join(KDIR, "*", "medidas.json"))):
        folder = os.path.dirname(f)
        if sel and not any(s in os.path.basename(folder) for s in sel):
            continue
        d = simulate(folder)
        resumen[d["id"]] = {s["ref"]: {"min": s["min"], "max": s["max"], "final": s["final"]} for s in d["puntos"]}
    path = os.path.join(WEB, "sim", "kicad", "resumen.json")
    old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    old.update(resumen)
    json.dump(old, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
