#!/usr/bin/env python3
"""Simula con ngspice (el de KiCad) cada módulo y los programas del artículo.

Salida (ver comun.py):
    simulaciones/computadora_analogica/<NN_nombre>/  circuito.cir, datos.csv, grafica.png, info.txt
    web/assets/sim/<nombre>.json                     curvas para la web
    web/assets/sim/resumen.json                      medidas clave (verificación)

    python simulaciones/computadora_analogica.py
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ngspice import run  # noqa: E402
import comun  # noqa: E402
from comun import r4, resample  # noqa: E402

COMMON = comun.MODELS
OUT = comun.WEB
FOLDERS = {  # id de la web -> carpeta ordenada
    "m2_condicion_inicial": "01_M2_condicion_inicial",
    "m3_integrador": "02_M3_integrador",
    "m4_sumador": "03_M4_sumador",
    "m5_coeficientes": "04_M5_coeficientes",
    "m6_filtro_salida": "05_M6_filtro_salida",
    "m7_multiplicador": "06_M7_multiplicador",
    "prog_caida_libre": "07_programa_caida_libre_g9.8",
    "prog_caida_libre_g12": "08_programa_caida_libre_g12",
    "prog_lorenz": "09_programa_lorenz",
}


def save(name, deck, data, meta):
    comun.save("computadora_analogica", FOLDERS[name], name, deck, data, meta)


def integrator(name, inputs, ic_in, cap="1u", op="op"):
    """Módulo M3: entradas [(nodo, R)], IC_IN, salida <name>.
    En reposo (OP=0): ICN->INV y entradas a GND (carga Vout=-Vic).
    OP=12 V: ICN->GND, entradas->INV (integra)."""
    s = [f"* --- integrador {name} ---"]
    for i, (node, r) in enumerate(inputs):
        s.append(f"R{name}i{i} {node} {name}_sum {r}")
    s += [
        f"R{name}6 {ic_in} {name}_icn 10k",
        f"R{name}7 {name}_icn {name} 10k",
        f"S{name}a {name}_icn {name}_inv 0 {op} RELNC",     # NC1: ICN-INV  (IC)
        f"S{name}b {name}_icn 0 {op} 0 RELNO",              # NO1: ICN-GND  (OP)
        f"S{name}c {name}_sum 0 0 {op} RELNC",              # NC2: SUM-GND  (IC)
        f"S{name}d {name}_sum {name}_inv {op} 0 RELNO",     # NO2: SUM-INV  (OP)
        f"C{name} {name}_inv {name} {cap}",
        f"X{name} 0 {name}_inv {name} LF412",
    ]
    return "\n".join(s)


def summer(name, inputs, rf="10k"):
    s = [f"* --- sumador {name} ---"]
    for i, (node, r) in enumerate(inputs):
        s.append(f"R{name}i{i} {node} {name}_inv {r}")
    s += [f"R{name}f {name}_inv {name} {rf}", f"X{name} 0 {name}_inv {name} LF412"]
    return "\n".join(s)


results = {}

# ---------------------------------------------------------------- M2 seguidor
deck = f"""M2 condicion inicial: potenciometro + seguidor
{COMMON}
Vp p15 0 15
Vn n15 0 -15
Vpos pos 0 0.5
B1 wiper 0 V = -15 + 30*V(pos)
Rload ic_out 0 10k
X1 wiper ic_out ic_out LF412
.dc Vpos 0 1 0.01
"""
v = run(deck, ["v(pos)", "v(ic_out)"])
save("m2_condicion_inicial", deck,
     {"x": r4(v["v(pos)"] * 100), "series": [{"name": "IC_OUT (V)", "y": r4(v["v(ic_out)"])}]},
     {"title": "Salida del seguidor vs. posición del potenciómetro", "xlabel": "posición del cursor (%)",
      "ylabel": "V", "note": "El LF412 satura a ±13.5 V: el rango útil de condición inicial es ±13 V."})
results["m2_ic_range"] = [float(v["v(ic_out)"].min()), float(v["v(ic_out)"].max())]

# ---------------------------------------------------------------- M3 integrador
deck = f"""M3 integrador: entrada 1 V por 1M (k=1/s), Vic = -2 V, OPERAR en t=0.5 s
{COMMON}
Vin vin 0 1
Vic icin 0 2
Vop op 0 PWL(0 0 0.5 0 0.501 12 3 12)
{integrator("out", [("vin", "1Meg")], "icin")}
.tran 2m 3 0 1m uic
"""
v = run(deck, ["time", "v(out)", "v(op)"])
t, y = resample(v["time"], v["v(out)"])
_, op = resample(v["time"], v["v(op)"])
save("m3_integrador", deck,
     {"x": r4(t), "series": [{"name": "OUT (V)", "y": r4(y)}, {"name": "OP relé (V)", "y": r4(op)}]},
     {"title": "Integrador: IC = -2 V, luego integra 1 V por la entrada de 1 MΩ",
      "xlabel": "tiempo (s)", "ylabel": "V",
      "note": "Rampa de -1 V/s hasta saturar en -13.5 V (eso es la 'línea' de la Fig. 13)."})
i1 = np.searchsorted(v["time"], 0.49)
i2 = np.searchsorted(v["time"], 1.5)
results["m3_ic_level"] = float(v["v(out)"][i1])
results["m3_slope_V_per_s"] = float((v["v(out)"][i2] - v["v(out)"][np.searchsorted(v["time"], 1.0)]) / 0.5)

# ---------------------------------------------------------------- M4 sumador
deck = f"""M4 sumador: -(V1 + V2) con 10k/10k, V1 = seno 2 V 1 Hz, V2 = 1 V
{COMMON}
V1 a 0 SIN(0 2 1)
V2 b 0 1
{summer("out", [("a", "10k"), ("b", "10k")])}
.tran 2m 2
"""
v = run(deck, ["time", "v(a)", "v(b)", "v(out)"])
t, a = resample(v["time"], v["v(a)"])
_, b = resample(v["time"], v["v(b)"])
_, y = resample(v["time"], v["v(out)"])
save("m4_sumador", deck,
     {"x": r4(t), "series": [{"name": "V1 (V)", "y": r4(a)}, {"name": "V2 (V)", "y": r4(b)},
                             {"name": "OUT = -(V1+V2)", "y": r4(y)}]},
     {"title": "Sumador inversor: OUT = -(V1 + V2)", "xlabel": "tiempo (s)", "ylabel": "V", "note": ""})
results["m4_err_mV"] = float(np.max(np.abs(y + a + b)) * 1000)

# ---------------------------------------------------------------- M5 coeficiente
deck = f"""M5 coeficiente: entrada +10 V, potenciometro 10k, buffer
{COMMON}
Vin cin 0 10
Vpos pos 0 0.5
B1 wip 0 V = V(cin)*V(pos)
X1 wip cout cout LF412
Rl cout 0 1k
.dc Vpos 0 1 0.01
"""
v = run(deck, ["v(pos)", "v(cout)"])
save("m5_coeficientes", deck,
     {"x": r4(v["v(pos)"]), "series": [{"name": "COUT (V) con CIN = 10 V", "y": r4(v["v(cout)"])}]},
     {"title": "Coeficiente a·Vin (0 ≤ a ≤ 1), salida con buffer", "xlabel": "a (posición)", "ylabel": "V",
      "note": "El buffer permite cargar la salida con 1 kΩ sin alterar el coeficiente."})

# ---------------------------------------------------------------- M6 filtro
deck = """M6 filtro RC 10k / 100nF
Vin x_in 0 AC 1
R1 x_in x_out 10k
C1 x_out 0 100n
.ac dec 50 1 100k
"""
v = run(deck, ["frequency", "v(x_out)"])
f = np.real(v["frequency"])
mag = 20 * np.log10(np.abs(v["v(x_out)"]))
save("m6_filtro_salida", deck,
     {"x": r4(f), "logx": True, "series": [{"name": "|H| (dB)", "y": r4(mag)}]},
     {"title": "Respuesta del filtro paso bajo (fc = 159 Hz)", "xlabel": "frecuencia (Hz)",
      "ylabel": "dB", "note": "-3 dB a 159 Hz; a 1 Hz (soluciones típicas) la atenuación es 0.0002 dB."})
results["m6_fc_Hz"] = float(f[np.argmin(np.abs(mag + 3.0103))])

# ---------------------------------------------------------------- M7 multiplicador
deck = f"""M7 multiplicador: X = 5 sin(2 pi 1 t), Y = 8 V -> W = 4 sin
{COMMON}
Vx x 0 SIN(0 5 1)
Vy y 0 SIN(0 8 3)
X1 x 0 y 0 0 w AD633
.tran 2m 1
"""
v = run(deck, ["time", "v(x)", "v(y)", "v(w)"])
t, x = resample(v["time"], v["v(x)"])
_, yy = resample(v["time"], v["v(y)"])
_, w = resample(v["time"], v["v(w)"])
save("m7_multiplicador", deck,
     {"x": r4(t), "series": [{"name": "X (V)", "y": r4(x)}, {"name": "Y (V)", "y": r4(yy)},
                             {"name": "W = XY/10", "y": r4(w)}]},
     {"title": "AD633: W = X·Y / 10", "xlabel": "tiempo (s)", "ylabel": "V", "note": ""})

# ---------------------------------------------------------------- Programa 1: caída libre
def falling(g=9.8, vx=7.071, vy=7.071, y0=2.0, T=1.8):
    return f"""Programa caida libre (Fig. 12) con modulos M3, M2 y M5
{COMMON}
* coeficientes (M5) y condiciones iniciales (M2)
Vg gneg 0 {-g}
Vvx vxneg 0 {-vx}
Vicvy icvy 0 {vy}
Vicy icy 0 {-y0}
Vicx icx 0 0
Vop op 0 PWL(0 0 0.2 0 0.201 12 {T + 1} 12)
* INT1: -vy = -(vy0 - g t)      entrada -g por 1M
{integrator("vyn", [("gneg", "1Meg")], "icvy")}
* INT2: y = y0 + int(vy)          entrada -vy por 1M
{integrator("ypos", [("vyn", "1Meg")], "icy")}
* INT3: x = int(vx)               entrada -vx por 1M
{integrator("xpos", [("vxneg", "1Meg")], "icx")}
* filtros de salida (M6)
Rfx xpos xs 10k
Cfx xs 0 100n
Rfy ypos ys 10k
Cfy ys 0 100n
.tran 2m {T + 0.2} 0 1m uic
"""


def falling_run(name, g, vy, T, title):
    deck = falling(g=g, vy=vy, T=T)
    v = run(deck, ["time", "v(xs)", "v(ys)"])
    m = v["time"] >= 0.2
    t = v["time"][m] - 0.2
    x, y = v["v(xs)"][m], v["v(ys)"][m]
    keep = np.concatenate([[True], (y[1:] >= -0.05)])   # hasta tocar el suelo
    hit = np.argmax(y < 0) if np.any(y < 0) else len(y)
    t, x, y = t[:hit], x[:hit], y[:hit]
    tt, xx = resample(t, x, 400)
    _, yy = resample(t, y, 400)
    xa = 7.071 * tt
    ya = -g / 2 * tt ** 2 + vy * tt + 2
    save(name, deck,
         {"x": r4(xx), "xy": True, "series": [{"name": "ngspice (circuito)", "y": r4(yy)},
                                              {"name": "solución analítica", "y": r4(ya), "xs": r4(xa)}]},
         {"title": title, "xlabel": "X = posición horizontal (V = m)", "ylabel": "Y = altura (V = m)",
          "note": "Modo X-Y del osciloscopio. 1 V = 1 m, tiempo real (1 MΩ · 1 µF = 1 s)."})
    return float(y.max()), float(x[-1]), float(t[-1])


hmax, rng, tf = falling_run("prog_caida_libre", 9.8, 7.071, 1.8,
                            "Caída libre, g = 9.8 m/s² (Fig. 13 del artículo)")
results["caida_libre"] = {"Hmax_sim": hmax, "Hmax_teo": 2 + 7.071 ** 2 / (2 * 9.8),
                          "alcance_sim": rng, "t_vuelo_sim": tf}
hmax, rng, tf = falling_run("prog_caida_libre_g12", 12.0, 7.071, 1.6,
                            "Caída libre, g = 12 m/s² (Fig. 15 del artículo)")
results["caida_libre_g12"] = {"Hmax_sim": hmax, "Hmax_teo": 2 + 7.071 ** 2 / 24, "alcance_sim": rng}

# ---------------------------------------------------------------- Programa 2: Lorenz
deck = f"""Lorenz (Fig. 18): variables escaladas X=x/10, Y=y/10, Z=z/10
{COMMON}
Vop op 0 PWL(0 0 0.1 0 0.101 12 40 12)
Vicx icx 0 -0.1
Vicy icy 0 -0.1
Vicz icz 0 -0.1
* INT1 -> XN = -X :  entradas Y (100k) y XN (100k)        dX/dt = 10(Y - X)
{integrator("xn", [("y", "100k"), ("xn", "100k")], "icx")}
* INT2 -> Y : entradas XN (35.7k), Y (1M), W1 = XZ/10 (10k)  dY/dt = 28X - Y - 10XZ
{integrator("y", [("xn", "35.7k"), ("y", "1Meg"), ("w1", "10k")], "icy")}
* INT3 -> ZN = -Z : entradas ZN (374k), W2 = XY/10 (10k)   dZ/dt = -8/3 Z + 10XY
{integrator("zn", [("zn", "374k"), ("w2", "10k")], "icz")}
* inversor (M4): Z = -ZN
{summer("z", [("zn", "10k")])}
* multiplicadores (M7): W1 = (0 - XN) * Z / 10 = XZ/10 ; W2 = (0 - XN) * Y / 10 = XY/10
XM1 0 xn z 0 0 w1 AD633
XM2 0 xn y 0 0 w2 AD633
.tran 2m 30 0 2m uic
"""
v = run(deck, ["time", "v(xn)", "v(y)", "v(z)"])
m = v["time"] > 0.1
t = v["time"][m] - 0.1
X, Y, Z = -v["v(xn)"][m], v["v(y)"][m], v["v(z)"][m]
tt, Xr = resample(t, X, 6000)
_, Yr = resample(t, Y, 6000)
_, Zr = resample(t, Z, 6000)
save("prog_lorenz", deck,
     {"t": r4(tt), "X": r4(Xr), "Y": r4(Yr), "Z": r4(Zr)},
     {"title": "Atractor de Lorenz en el circuito (Fig. 18)", "xlabel": "X (x/10)", "ylabel": "Z (z/10)",
      "note": "3 integradores + 2 multiplicadores AD633 + 1 inversor. Resistencias del artículo: "
              "100k, 35.7k, 1M, 10k, 374k con C = 1 µF."})
results["lorenz"] = {"X_rango": [float(X.min()), float(X.max())], "Z_rango": [float(Z.min()), float(Z.max())]}

json.dump(results, open(os.path.join(OUT, "resumen.json"), "w"), indent=1)
print(json.dumps(results, indent=1))
