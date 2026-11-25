"""Utilidades comunes de las simulaciones: guardar cada simulación en su carpeta.

Cada simulación queda en  simulaciones/<grupo>/<NN_nombre>/
    circuito.cir   netlist ngspice (se puede abrir y correr en ngspice o en KiCad)
    datos.csv      los datos de las curvas
    grafica.png    la gráfica
    info.txt       qué muestra y la conclusión numérica
y además en web/assets/sim/<id>.json para la aplicación.
"""
import csv
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web", "assets", "sim")
os.makedirs(WEB, exist_ok=True)

# Modelos SPICE compartidos (macromodelos y transistores de uso común)
MODELS = """
* LF412 (macro-modelo): Aol 2e5, GBW ~3 MHz, salida limitada a +/-13.5 V
.subckt LF412 inp inn out
Rin inp inn 1e12
E1 n1 0 inp inn 2e5
R1 n1 n2 1k
C1 n2 0 10.6u
B1 out 0 V = 13.5*tanh(V(n2)/13.5)
.ends
* AD633: W = (X1-X2)(Y1-Y2)/10 + Z, salida limitada a +/-11 V
.subckt AD633 x1 x2 y1 y2 z w
B1 w 0 V = 11*tanh(((V(x1)-V(x2))*(V(y1)-V(y2))/10 + V(z))/11)
.ends
* Rele G5V-2 como conmutadores controlados por OP (umbral 6 V)
.model RELNO SW(Vt=6 Vh=0.5 Ron=0.05 Roff=1e10)
.model RELNC SW(Vt=-6 Vh=0.5 Ron=0.05 Roff=1e10)
* Transistores (modelos SPICE publicados por los fabricantes)
.model 2N3904 NPN(Is=6.734f Xti=3 Eg=1.11 Vaf=74.03 Bf=416.4 Ne=1.259 Ise=6.734f Ikf=66.78m Xtb=1.5
+ Br=.7371 Nc=2 Isc=0 Ikr=0 Rc=1 Cjc=3.638p Mjc=.3085 Vjc=.75 Fc=.5 Cje=4.493p Mje=.2593 Vje=.75
+ Tr=239.5n Tf=301.2p Itf=.4 Vtf=4 Xtf=2 Rb=10)
.model 2N3906 PNP(Is=1.41f Xti=3 Eg=1.11 Vaf=18.7 Bf=180.7 Ne=1.5 Ise=0 Ikf=80m Xtb=1.5 Br=4.977
+ Nc=2 Isc=0 Ikr=0 Rc=2.5 Cjc=9.728p Mjc=.5776 Vjc=.75 Fc=.5 Cje=8.063p Mje=.3677 Vje=.75 Tr=33.42n
+ Tf=179.3p Itf=.4 Vtf=4 Xtf=6 Rb=10)
.model BD139 NPN(Is=2.3985E-13 Bf=244.9 Vaf=100 Ikf=1.0 Ise=1.0E-14 Ne=1.5 Br=7.0 Rb=0.5 Rc=0.15 Re=0.1
+ Cje=1.4E-10 Cjc=4.0E-11 Tf=1.0E-9 Tr=2.0E-7)
.model BD140 PNP(Is=2.3985E-13 Bf=150 Vaf=100 Ikf=1.0 Ise=1.0E-14 Ne=1.5 Br=7.0 Rb=0.5 Rc=0.15 Re=0.1
+ Cje=1.4E-10 Cjc=4.0E-11 Tf=1.0E-9 Tr=2.0E-7)
.model LEDR D(Is=1e-19 N=1.7 Rs=5 Cjo=30p)
.model LEDG D(Is=1e-21 N=1.8 Rs=5 Cjo=30p)
.model 1N4148 D(Is=2.52n Rs=.568 N=1.752 Cjo=4p M=.4 Tt=20n)
.model 1N4007 D(Is=7.02767n Rs=0.0341512 N=1.80803 Cjo=1e-11 M=0.3 Tt=1e-6)
"""


def r4(a):
    return [round(float(v), 5) for v in a]


def resample(t, y, n=600, t0=None, t1=None):
    t0 = t[0] if t0 is None else t0
    t1 = t[-1] if t1 is None else t1
    tt = np.linspace(t0, t1, n)
    return tt, np.interp(tt, t, y)


def save(group, folder, web_id, deck, data, meta, info=""):
    """Guarda una simulación: carpeta ordenada + JSON para la web."""
    d = os.path.join(HERE, group, folder)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "circuito.cir"), "w", encoding="utf-8").write(deck.strip() + "\n.end\n")
    # CSV
    if "series" in data:
        series = data["series"]
        cols = [(meta.get("xlabel", "x"), data["x"])]
        for s in series:
            if "xs" in s:
                cols.append((s["name"] + " [x]", s["xs"]))
            cols.append((s["name"], s["y"]))
    else:
        cols = [(k, v) for k, v in data.items() if isinstance(v, list)]
    n = max(len(c[1]) for c in cols)
    with open(os.path.join(d, "datos.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([c[0] for c in cols])
        for i in range(n):
            w.writerow([c[1][i] if i < len(c[1]) else "" for c in cols])
    # gráfica
    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=120)
    if "series" in data:
        for s in data["series"]:
            ax.plot(s.get("xs", data["x"]), s["y"], label=s["name"], lw=1.6, ls="--" if "xs" in s else "-")
        if data.get("logx"):
            ax.set_xscale("log")
        if data.get("xy"):
            ax.set_aspect("equal", adjustable="datalim")
        ax.legend(fontsize=8)
    else:
        ax.plot(data["X"], data["Z"], lw=0.5)
        ax.set_aspect("equal", adjustable="datalim")
    ax.set_xlabel(meta.get("xlabel", ""))
    ax.set_ylabel(meta.get("ylabel", ""))
    ax.set_title(meta.get("title", ""), fontsize=10)
    ax.grid(alpha=.3)
    fig.tight_layout()
    fig.savefig(os.path.join(d, "grafica.png"))
    plt.close(fig)
    open(os.path.join(d, "info.txt"), "w", encoding="utf-8").write(
        f"{meta.get('title', '')}\n\n{meta.get('note', '')}\n\n{info}\n")
    meta = dict(meta, carpeta=f"simulaciones/{group}/{folder}")
    json.dump({"meta": meta, "data": data}, open(os.path.join(WEB, web_id + ".json"), "w"))
