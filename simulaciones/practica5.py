#!/usr/bin/env python3
"""Simulaciones ngspice de la Práctica 5 (aplicaciones de los transistores).

    python simulaciones/practica5.py

Salida: simulaciones/practica5/<NN_nombre>/ (circuito.cir, datos.csv, grafica.png, info.txt),
web/assets/sim/p5_*.json y web/assets/sim/p5_resumen.json (las respuestas numéricas).
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ngspice import run  # noqa: E402
import comun  # noqa: E402
from comun import r4, resample, MODELS  # noqa: E402

G = "practica5"
R = {}


def freq_of(t, v, t0):
    """Frecuencia por cruces ascendentes del valor medio (después de t0)."""
    m = t >= t0
    t, v = t[m], v[m]
    if len(t) < 10 or np.ptp(v) < 0.2:
        return 0.0, float(np.ptp(v)) if len(v) else 0.0
    mid = (v.max() + v.min()) / 2
    up = np.where((v[:-1] < mid) & (v[1:] >= mid))[0]
    if len(up) < 3:
        return 0.0, float(np.ptp(v))
    tc = t[up] + (mid - v[up]) / (v[up + 1] - v[up]) * (t[up + 1] - t[up])
    return float(1 / np.mean(np.diff(tc[1:]))), float(np.ptp(v))


# =========================================================== 1. astable
def astable(rb="10k", c="10u", rc="1k", T="1", step="0.5m"):
    return f"""Multivibrador astable (Figura 1)
{MODELS}
V10 vcc 0 5
R10 vcc l8 {rc}
D8 l8 cq5 LEDR
R12 vcc l9 {rc}
D9 l9 cq6 LEDR
R9 vcc bq6 {rb}
R11 vcc bq5 {rb}
C5 cq5 bq6 {c}
C6 cq6 bq5 {c}
Q5 cq5 bq5 0 2N3904
Q6 cq6 bq6 0 2N3904
* pequeña asimetría inicial para arrancar la oscilación
.ic v(bq5)=0.7 v(bq6)=0
.tran {step} {T} 0 {step} uic
"""


deck = astable()
v = run(deck, ["time", "v(cq5)", "v(cq6)", "v(bq5)"])
t = v["time"]
f0, amp = freq_of(t, v["v(cq5)"], 0.3)
tt, a = resample(t, v["v(cq5)"], 800, 0.3, 0.8)
_, b = resample(t, v["v(cq6)"], 800, 0.3, 0.8)
_, bb = resample(t, v["v(bq5)"], 800, 0.3, 0.8)
comun.save(G, "01_astable_formas_de_onda", "p5_1_ondas", deck,
           {"x": r4(tt - 0.3), "series": [{"name": "colector Q5", "y": r4(a)}, {"name": "colector Q6", "y": r4(b)},
                                          {"name": "base Q5", "y": r4(bb)}]},
           {"title": f"Astable (Figura 1): f = {f0:.2f} Hz", "xlabel": "tiempo (s)", "ylabel": "V",
            "note": "La base baja a unos -4 V cuando el otro transistor se satura (el condensador "
                    "transfiere el salto del colector) y sube por R9/R11 hasta 0.65 V: ahí conmuta."},
           info=f"Frecuencia simulada {f0:.3f} Hz; teórica 1/(1.386 R C) = {1/(1.386*10e3*10e-6):.3f} Hz")
R["astable_f_fig1"] = f0
R["astable_f_teo"] = 1 / (1.386 * 10e3 * 10e-6)

# período variable: RV en serie con R9/R11
rows = []
for rv in [0, 10e3, 20e3, 30e3, 40e3, 50e3]:
    rb = 10e3 + rv
    v = run(astable(rb=f"{rb}", T=f"{max(1.5, 4 * 1.386 * rb * 10e-6)}"), ["time", "v(cq5)"])
    f, _ = freq_of(v["time"], v["v(cq5)"], 1.5 * 1.386 * rb * 10e-6)
    rows.append((rv, f, 1 / (1.386 * rb * 10e-6)))
comun.save(G, "02_astable_periodo_variable", "p5_1_periodo", astable(rb="{10k+RV}"),
           {"x": [r[0] / 1e3 for r in rows], "series": [{"name": "ngspice (Hz)", "y": r4([r[1] for r in rows])},
                                                        {"name": "0.72 / (RB·C)", "y": r4([r[2] for r in rows])}]},
           {"title": "Variación del período con RV1 = RV2", "xlabel": "RV (kΩ)", "ylabel": "frecuencia (Hz)",
            "note": "Con RV de 0 a 50 kΩ la frecuencia va de 7.2 Hz a 1.2 Hz."})
R["astable_rango_f"] = [rows[-1][1], rows[0][1]]

# frecuencia máxima: barrido de C con RB = 10k, RC = 1k
rows = []
for c in [10e-6, 1e-6, 100e-9, 10e-9, 1e-9, 220e-12, 47e-12]:
    period = 1.386 * 10e3 * c
    T = max(12 * period, 20e-6)
    st = period / 200
    v = run(astable(c=f"{c}", T=f"{T}", step=f"{st}"), ["time", "v(cq5)"])
    f, amp = freq_of(v["time"], v["v(cq5)"], T * 0.4)
    rows.append((c, f, 1 / period, amp))
comun.save(G, "03_astable_frecuencia_maxima", "p5_1_fmax", astable(c="{C}"),
           {"x": [r[1 - 1] for r in rows], "logx": True,
            "series": [{"name": "f ngspice (Hz)", "y": r4([r[1] for r in rows])},
                       {"name": "f teórica 0.72/(RC)", "y": r4([r[2] for r in rows])}]},
           {"title": "Frecuencia frente a C (RB = 10 kΩ, RC = 1 kΩ)", "xlabel": "C (F)", "ylabel": "Hz",
            "note": "Mientras f sigue a 0.72/(RC) el circuito es un astable correcto; donde se separa, "
                    "mandan la recarga por RC y los tiempos de conmutación del 2N3904."},
           info="\n".join(f"C={c:.0e}  f_sim={f:.1f}  f_teo={ft:.1f}  amplitud={a:.2f} V" for c, f, ft, a in rows))
R["astable_barrido_C"] = [{"C": c, "f_sim": f, "f_teo": ft, "amplitud": a} for c, f, ft, a in rows]

# =========================================================== 2. sensor + buzzer
def buzzer(r3="1k", r4_="15k"):
    return f"""Circuito con sensor y buzzer (Figura 2)
{MODELS}
V1 vcc 0 5
V2 sensor 0 0
R2 vcc vref 2.2k
R1 vref 0 2.2k
R3 vcc cu1 {r3}
R4 vcc cu2 {r4_}
QU1 cu1 vref cola 2N3904
QU2 cu2 bu2 cola 2N3904
R5 cola 0 1k
R6 sensor bu2 1k
R7 cu2 bu3 200
QU3 buz bu3 vcc 2N3906
D1 0 buz 1N4007
L1 buz lb 100u
R8 lb isen 24
VSEN isen 0 0
.dc V2 0 5 0.01
"""


cases = [("R3 < R4 (1k, 15k: Figura 2)", "1k", "15k"), ("R3 = R4 (15k, 15k)", "15k", "15k"),
         ("R3 > R4 (47k, 15k)", "47k", "15k")]
series, thresholds = [], {}
for name, r3, r4v in cases:
    v = run(buzzer(r3, r4v), ["v(sensor)", "i(vsen)", "v(cu2)", "v(cola)"])
    x, i = v["v(sensor)"], v["i(vsen)"] * 1000
    series.append({"name": name, "y": r4(i)})
    imax = i.max()
    lo = float(x[np.argmax(i > 0.1 * imax)]) if imax > 1 else None
    hi = float(x[np.argmax(i > 0.9 * imax)]) if imax > 1 else None
    thresholds[name] = {"I_max_mA": float(imax), "V_10%": lo, "V_90%": hi}
comun.save(G, "04_sensor_buzzer_R3_vs_R4", "p5_2_umbral", buzzer(),
           {"x": r4(x), "series": series},
           {"title": "Corriente del buzzer frente al voltaje del sensor", "xlabel": "V sensor (V)",
            "ylabel": "I buzzer (mA)",
            "note": "La etapa 2 se activa cuando el sensor supera la referencia de 2.5 V (R1 = R2)."},
           info=json.dumps(thresholds, indent=1))
R["buzzer_umbrales"] = thresholds

# tabla de voltajes, corrientes y potencias críticas (Figura 2) a sensor = 0 V y 5 V
crit = {}
for vs in (0.0, 2.5, 5.0):
    dk = buzzer().replace("V2 sensor 0 0", f"V2 sensor 0 {vs}").replace(".dc V2 0 5 0.01", ".op")
    dk = dk.replace("R5 cola 0 1k", "R5 cola r5 1k\nVR5 r5 0 0").replace("R7 cu2 bu3 200", "R7 cu2 b3 200\nVB3 b3 bu3 0")
    dk = dk.replace("R3 vcc cu1 1k", "R3 vcc c1 1k\nVR3 c1 cu1 0").replace("R4 vcc cu2 15k", "R4 vcc c2 15k\nVR4 c2 cu2 0")
    names = ["v(vref)", "v(cola)", "v(cu1)", "v(cu2)", "v(bu3)", "v(buz)", "v(bu2)", "i(vsen)", "i(vr5)", "i(vb3)", "i(vr3)", "i(vr4)"]
    o = run(dk, names)
    g = {k: float(o[k][0]) for k in names}
    ib3 = -g["i(vb3)"]                      # corriente que sale de la base del PNP
    ibuz = g["i(vsen)"]
    crit[f"{vs:.1f} V"] = {
        "V_ref (V)": g["v(vref)"], "V_emisores (V)": g["v(cola)"], "V_C_U2 (V)": g["v(cu2)"],
        "V_buzzer (V)": g["v(buz)"], "I_R5 cola (mA)": g["i(vr5)"] * 1e3,
        "I_C_U1 (mA)": g["i(vr3)"] * 1e3, "I_C_U2 (mA)": g["i(vr4)"] * 1e3 + max(ib3, 0) * 1e3,
        "I_B_U3 (mA)": ib3 * 1e3, "I_buzzer (mA)": ibuz * 1e3,
        "P_U3 (mW)": (5 - g["v(buz)"]) * ibuz * 1e3, "P_buzzer R8 (mW)": ibuz ** 2 * 24 * 1e3,
        "P_R7 (mW)": ib3 ** 2 * 200 * 1e3, "P_R5 (mW)": g["i(vr5)"] ** 2 * 1e3 * 1e3,
    }
R["buzzer_tabla"] = crit

# =========================================================== 3. fuente de corriente
def csource(rs, load="R", vcc=12):
    ld = "RL vcc cq1 {RLV}" if load == "R" else "DL vcc cq1 LEDR"
    return f"""Fuente de corriente constante (Figura 3)
{MODELS}
.param RLV=220
VCC vcc 0 {vcc}
{ld}
R1 vcc bq1 10k
Q1 cq1 bq1 sense 2N3904
Q2 bq1 bq2 0 2N3904
R2 sense bq2 1k
RS sense ms {rs}
VM ms 0 0
"""


series, table = [], {}
loads = [100, 220, 330, 470, 680]
for target, rs in (("10 mA", 68), ("20 mA", 33)):
    xs, ys = [], []
    for rl in list(range(50, 1001, 25)):
        o = run(csource(rs) .replace(".param RLV=220", f".param RLV={rl}") + ".op\n", ["i(vm)", "v(vcc)", "v(cq1)"])
        xs.append(rl); ys.append(float(o["i(vm)"][0]) * 1e3)
    series.append({"name": f"I con Rsense = {rs} Ω ({target})", "y": r4(ys)})
    rows = []
    for rl in loads:
        o = run(csource(rs).replace(".param RLV=220", f".param RLV={rl}") + ".op\n", ["i(vm)", "v(cq1)"])
        i = float(o["i(vm)"][0])
        vrl = 12 - float(o["v(cq1)"][0])
        rows.append({"Rload": rl, "I (mA)": i * 1e3, "V_Rload (V)": vrl, "V/I (Ω)": vrl / i})
    o = run(csource(rs, load="LED") + ".op\n", ["i(vm)", "v(cq1)"])
    table[target] = {"Rsense": rs, "I_teorica (mA)": 0.65 / rs * 1e3, "filas": rows,
                     "LED": {"I (mA)": float(o["i(vm)"][0]) * 1e3, "V_LED (V)": 12 - float(o["v(cq1)"][0])},
                     "Rload_max (Ω)": (12 - 0.65 - 0.3) / (0.65 / rs)}
comun.save(G, "05_fuente_corriente_vs_Rload", "p5_3_carga", csource(68),
           {"x": xs, "series": series},
           {"title": "Corriente en Rload (Vcc = 12 V)", "xlabel": "Rload (Ω)", "ylabel": "I (mA)",
            "note": "La corriente es constante mientras Q1 no se satura. Por encima de "
                    "Rload_max = (Vcc − Vsense − VCEsat)/I la fuente pierde regulación y vuelve a cumplirse V = I·R con I menor."},
           info=json.dumps(table, indent=1))
R["fuente_corriente"] = table

# estabilidad frente a Vcc
series = []
for target, rs in (("10 mA", 68), ("20 mA", 33)):
    ys = []
    vs = np.arange(3, 15.01, 0.25)
    for vcc in vs:
        o = run(csource(rs, vcc=vcc) + ".op\n", ["i(vm)"])
        ys.append(float(o["i(vm)"][0]) * 1e3)
    series.append({"name": f"{target} (Rload = 220 Ω)", "y": r4(ys)})
comun.save(G, "06_fuente_corriente_vs_Vcc", "p5_3_vcc", csource(68),
           {"x": r4(vs), "series": series},
           {"title": "Estabilidad de la corriente frente a la tensión de alimentación", "xlabel": "Vcc (V)",
            "ylabel": "I (mA)", "note": "Una vez hay compliancia suficiente, la corriente casi no cambia con Vcc."})

# =========================================================== 4. puente H
def hbridge(pwl_a, pwl_b, T="60m"):
    return f"""Puente H (diseño de referencia, Vm = 9 V, motor 15 ohm + 2 mH)
{MODELS}
VM vm 0 9
VIA ina 0 PWL({pwl_a})
VIB inb 0 PWL({pwl_b})
* medio puente A
Q1 ma b1 vm BD140
R5 vm b1x 1k
VIB1 b1x b1 0
R3 b1x c5 180
Q5 c5 b5 bl_b 2N3904
R1 ina b5x 820
VIB5 b5x b5 0
Q3 ma bl_a 0 BD139
R7 bl_a 0 1k
D1 ma vm 1N4007
D3 0 ma 1N4007
* medio puente B
Q2 mb b2 vm BD140
R6 vm b2x 1k
VIB2 b2x b2 0
R4 b2x c6 180
Q6 c6 b6 bl_a 2N3904
R2 inb b6 820
Q4 mbx bl_b 0 BD139
VIC4 mb mbx 0
R8 bl_b 0 1k
D2 mb vm 1N4007
D4 0 mb 1N4007
* motor
RMOT ma mm 15
LMOT mm mmi 2m
VIMOT mmi mb 0
.tran 20u {T} 0 20u
"""


A = "0 5 20m 5 20.01m 0 60m 0"
B = "0 0 30m 0 30.01m 5 50m 5 50.01m 0 60m 0"
deck = hbridge(A, B)
v = run(deck, ["time", "v(ma)", "v(mb)", "i(vimot)", "i(vm)", "v(ina)", "v(inb)", "i(vib1)", "i(vib5)", "i(vic4)", "v(b5)"])
t = v["time"]
tt, im = resample(t, v["i(vimot)"] * 1e3, 1200)
_, vmab = resample(t, v["v(ma)"] - v["v(mb)"], 1200)
_, ia = resample(t, v["v(ina)"], 1200)
_, ib = resample(t, v["v(inb)"], 1200)
comun.save(G, "07_puente_h_giro", "p5_4_giro", deck,
           {"x": r4(tt * 1e3), "series": [{"name": "I motor (mA)", "y": r4(im)}, {"name": "V motor (V) ×100", "y": r4(vmab * 100)},
                                          {"name": "IN_A ×100", "y": r4(ia * 100)}, {"name": "IN_B ×100", "y": r4(ib * 100)}]},
           {"title": "Puente H: giro A (0-20 ms), libre, giro B (30-50 ms)", "xlabel": "tiempo (ms)", "ylabel": "mA / escalado",
            "note": "La corriente invierte su signo al invertir el giro; D1-D4 conducen la corriente de la "
                    "bobina del motor al apagar (los picos breves tras 20 y 50 ms)."})
k = np.searchsorted(t, 0.015)
R["puente_h"] = {"I_motor_A (mA)": float(v["i(vimot)"][k] * 1e3), "IB1 (mA)": float(-v["i(vib1)"][k] * 1e3),
                 "IB5 (mA)": float(v["i(vib5)"][k] * 1e3), "IC4 (mA)": float(v["i(vic4)"][k] * 1e3),
                 "VB5 (V)": float(v["v(b5)"][k]),
                 "I_motor_B (mA)": float(v["i(vimot)"][np.searchsorted(t, 0.045)] * 1e3),
                 "I_fuente (mA)": float(-v["i(vm)"][k] * 1e3)}

# estado prohibido A = B = 1 (solo para mostrar por qué no se debe hacer)
deck = hbridge("0 0 5m 0 5.01m 5 10m 5 10.01m 0 15m 0", "0 0 5m 0 5.01m 5 10m 5 10.01m 0 15m 0", T="15m")
v = run(deck, ["time", "i(vm)", "i(vimot)"])
tt, isup = resample(v["time"], -v["i(vm)"], 600)
comun.save(G, "08_puente_h_estado_prohibido", "p5_4_prohibido", deck,
           {"x": r4(tt * 1e3), "series": [{"name": "I de la fuente (A)", "y": r4(isup)}]},
           {"title": "Estado prohibido IN_A = IN_B = 1 (5-10 ms): corto a través del puente",
            "xlabel": "tiempo (ms)", "ylabel": "A",
            "note": "Las cuatro llaves conducen y la fuente queda en corto por Q1-Q3 y Q2-Q4: la corriente "
                    "la limita solo la beta de los transistores. Con una fuente sin límite se queman."})
R["puente_h"]["I_corto_prohibido (A)"] = float(isup.max())

json.dump(R, open(os.path.join(comun.WEB, "p5_resumen.json"), "w"), indent=1)
print(json.dumps(R, indent=1)[:6000])
