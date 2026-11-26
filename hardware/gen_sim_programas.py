#!/usr/bin/env python3
"""Esquemáticos de simulación KiCad de los programas (caída libre y Lorenz).

    python hardware/gen_sim_programas.py

Cada módulo es un bloque cuyo modelo SPICE es el circuito completo del módulo
(simulaciones/kicad/modelos.lib: M2_IC, M3_INT, M4_SUM, M6_FILT, AD633). Los bloques se unen con
cables, como se cablean los módulos reales, y el control OP (interruptor IC/OPERAR de M1) es una
fuente que pasa a 12 V cuando empieza el programa. Se abren en KiCad -> Inspeccionar -> Simulador.

Salida: simulaciones/kicad/07_programa_caida_libre_g9.8/, 08_programa_caida_libre_g12/,
09_programa_lorenz/ (esquemático + medidas.json).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from schlib import Design  # noqa: E402
from gen_completos import Hoja, sub, AD633, G, FP, place2  # noqa: E402

SIMDIR = os.path.join(ROOT, "simulaciones", "kicad")


def blocks(d):
    """Símbolos de bloque de cada módulo (pines con los nombres de su serigrafía)."""
    fs = d.functional_symbol
    return {
        "M2": fs("M2_CONDICION_INICIAL", right=[("1", "-Vic", "out")], top=[("2", "+15V", "pwr")],
                 bottom=[("3", "-15V", "pwr")], ref="M",
                 description="M2: potenciometro +/-15 V con seguidor. Sim.Params pos = posicion del cursor"),
        "M3": fs("M3_INTEGRADOR", left=[("1", "X1 (1M)", "in"), ("2", "X10 (100k)", "in"), ("3", "X100A (10k)", "in"),
                                        ("4", "X100B (10k)", "in"), ("5", "X1000 (1k)", "in"), ("6", "SUMIN", "in"),
                                        None, ("7", "COND. INICIAL", "in")],
                 right=[("8", "SALIDA", "out")], top=[("9", "OP", "in"), ("10", "+15V", "pwr")],
                 bottom=[("11", "-15V", "pwr")], ref="M",
                 description="M3: integrador sumador con condicion inicial (C = 1 uF)"),
        "M4": fs("M4_SUMADOR", left=[("1", "X10 (1k)", "in"), ("2", "X1A (10k)", "in"), ("3", "X1B (10k)", "in"),
                                     ("4", "X01A (100k)", "in"), ("5", "X01B (100k)", "in"), ("6", "SUMIN", "in")],
                 right=[("7", "SALIDA", "out")], top=[("8", "+15V", "pwr")], bottom=[("9", "-15V", "pwr")], ref="M",
                 description="M4: sumador inversor, Rf = 10k"),
        "M6": fs("M6_FILTRO", left=[("1", "X_IN", "in"), ("2", "Y_IN", "in")],
                 right=[("3", "BNC X", "out"), ("4", "BNC Y", "out")], ref="M",
                 description="M6: filtros RC 10k / 100 nF hacia el osciloscopio"),
        "M7": fs("M7_MULTIPLICADOR", left=[("1", "X1", "in"), ("2", "X2", "in"), None, ("3", "Y1", "in"),
                                           ("4", "Y2", "in"), None, ("6", "Z", "in")],
                 right=[("7", "W", "out")], top=[("8", "+15V", "pwr")], bottom=[("5", "-15V", "pwr")], ref="M",
                 description="M7: multiplicador AD633, W = (X1-X2)(Y1-Y2)/10 + Z"),
    }


M2P = lambda pos: sub("M2_IC", "1=out 2=vcc 3=vee", f"pos={pos:.5f}")  # noqa: E731
M3P = sub("M3_INT", "1=x1 2=x10 3=x100a 4=x100b 5=x1000 6=sumin 7=icin 8=out 9=op 10=vcc 11=vee")
M4P = sub("M4_SUM", "1=x10 2=x1a 3=x1b 4=x01a 5=x01b 6=sumin 7=out 8=vcc 9=vee")
M6P = sub("M6_FILT", "1=xin 2=yin 3=xout 4=yout")


def pos_for(v):
    """Posición del cursor de M2 para obtener v voltios (OUT = -15 + 30 pos)."""
    return (v + 15) / 30


def rails(s, ref):
    """+15 V / -15 V de un bloque con símbolos de alimentación."""
    for n, nm in s.pins_of(ref):
        pass


def power_pins(s, ref, pins):
    for num, rail in pins:
        s.stub(ref, num, G, power=rail)


def link(s, a, b, x=None):
    """Cable de a a b: horizontal hasta la columna x, vertical y horizontal hasta b."""
    if abs(a[1] - b[1]) < 0.01 and x is None:
        return s.wire(a, b)
    x = x if x is not None else (a[0] + b[0]) / 2
    x = round(x / G) * G
    return s.wire(a, (x, a[1]), (x, b[1]), b)


def m2(h, B, ref, volts, x, y, what):
    h.s.place(ref, B["M2"], f"M2: {what} = {volts:g} V", x, y, props=M2P(pos_for(volts)))
    power_pins(h.s, ref, (("2", "+15V"), ("3", "-15V")))
    return h.s.pin(ref, "1")


def m3(h, B, ref, x, y, name):
    h.s.place(ref, B["M3"], f"M3: {name}", x, y, props=M3P)
    power_pins(h.s, ref, (("10", "+15V"), ("11", "-15V")))
    return {k: h.s.pin(ref, k) for k in ("1", "2", "3", "4", "5", "6", "7", "8", "9")}


def falling(g, folder, title, vy=7.071, vx=7.071, y0=2.0):
    sdir = os.path.join(SIMDIR, folder)
    os.makedirs(sdir, exist_ok=True)
    name = "programa_caida_libre"
    d = Design(sdir, name + "_sim", title=title, rev="A", company="Computadora analogica (Johnson 2016)")
    B = blocks(d)
    h = Hoja(d, name + "_sim.kicad_sch", title, "Fig. 12 del articulo: 3 integradores (M3), constantes con M2, salida por M6", sim=True)
    s = h.s
    h.supplies(17.78, 243.84)
    # constantes (M2), separadas para que los rieles de un bloque no toquen los del siguiente
    g_out = m2(h, B, "B1", -g, 40.64, 45.72, "-g")
    vy_out = m2(h, B, "B2", vy, 40.64, 86.36, "vy0")
    y0_out = m2(h, B, "B3", -y0, 40.64, 127.0, "-y0")
    vx_out = m2(h, B, "B4", -vx, 40.64, 167.64, "-vx")
    x0_out = m2(h, B, "B5", 0.0, 40.64, 208.28, "x0")
    # integradores
    i1 = m3(h, B, "B6", 104.14, 66.04, "INT1  -vy")
    i2 = m3(h, B, "B7", 180.34, 66.04, "INT2  y")
    i3 = m3(h, B, "B8", 104.14, 167.64, "INT3  x")
    link(s, g_out, i1["1"], 66.04)
    link(s, vy_out, i1["7"], 71.12)
    link(s, i1["8"], i2["1"], 144.78)
    s.wire(y0_out, (139.7, y0_out[1]), (139.7, i2["7"][1]), i2["7"])
    link(s, vx_out, i3["1"], 66.04)
    link(s, x0_out, i3["7"], 71.12)
    # filtro y osciloscopio (M6)
    s.place("B9", B["M6"], "M6: filtro de salida", 251.46, 116.84, props=M6P)
    f = {k: s.pin("B9", k) for k in ("1", "2", "3", "4")}
    xo = i3["8"]
    s.wire(xo, (226.06, xo[1]), (226.06, f["2"][1]), f["2"]) if False else None
    s.wire(xo, (223.52, xo[1]), (223.52, f["1"][1]), f["1"])
    yo = i2["8"]
    s.wire(yo, (228.6, yo[1]), (228.6, f["2"][1]), f["2"])
    s.wire(f["3"], (f["3"][0] + 7.62, f["3"][1]))
    s.wire(f["4"], (f["4"][0] + 7.62, f["4"][1]))
    # OP (M1, interruptor IC/OPERAR): una línea a los tres integradores
    op_y = 30.48
    h.source("V3", (91.44, op_y), "PWL", 'pwl="0 0 0.2 0 0.201 12 4 12"', "M1 OP: IC -> OPERAR en t = 0.2 s")
    for k in (i1, i2):
        s.wire(k["9"], (k["9"][0], op_y))
    s.wire((91.44, op_y), (i2["9"][0], op_y))
    s.wire((152.4, op_y), (152.4, 134.62), (i3["9"][0], 134.62), i3["9"])
    h.tp("TP1", "TP1 X (BNC X)", (f["3"][0] + 5.08, f["3"][1]), what="Posición horizontal x (1 V = 1 m)",
         expect=f"Recta: x = {vx} t")
    h.tp("TP2", "TP2 Y (BNC Y)", (f["4"][0] + 5.08, f["4"][1]), up=False, what="Altura y (1 V = 1 m)",
         expect=f"Parábola: y = {y0} + {vy} t - {g}/2 t², máximo {y0 + vy ** 2 / (2 * g):.3f} m")
    h.tp("TP3", "TP3 -vy", (i1["8"][0] + 5.08, i1["8"][1]), what="Salida de INT1 = -vy",
         expect=f"Empieza en -{vy} V y sube {g} V/s")
    h.tp("TP4", "TP4 OP", (152.4, 101.6), up="right", what="Control OP (interruptor de M1)",
         expect="0 V (IC) y 12 V desde t = 0.2 s (OPERAR)")
    s.note(f"Programa caida libre, g = {g} m/s^2:  y'' = -g,  x'' = 0.\n"
           "INT1 integra -g (entrada 1M, k = 1/s) y da -vy; INT2 integra -vy y da y; INT3 integra -vx y da x.\n"
           "Osciloscopio en modo X-Y: BNC X al canal 1 y BNC Y al canal 2.  1 V = 1 m, tiempo real.", 152.4, 220.98, 1.27)
    T = 2 * vy / g + 0.5
    h.directive(f".tran 2m {0.2 + T:.2f} 0 1m uic", 152.4, 243.84)
    write(d, sdir, name, h, {"titulo": title, "xy": ["TP1", "TP2"], "desde": 0.2, "hasta_suelo": "TP2",
                             "teoria": {"g": g, "vx": vx, "vy": vy, "y0": y0}})


def lorenz():
    folder = "09_programa_lorenz"
    sdir = os.path.join(SIMDIR, folder)
    os.makedirs(sdir, exist_ok=True)
    name = "programa_lorenz"
    title = "Programa: atractor de Lorenz (Fig. 18)"
    d = Design(sdir, name + "_sim", title=title, rev="A", company="Computadora analogica (Johnson 2016)")
    B = blocks(d)
    h = Hoja(d, name + "_sim.kicad_sch", title, "3 integradores (M3), 2 multiplicadores (M7), 1 inversor (M4)", sim=True)
    s = h.s
    h.supplies(17.78, 256.54)
    yi = (60.96, 137.16, 213.36)
    ic = [m2(h, B, f"B{i + 1}", -0.1, 40.64, y + 8.89, f"IC {v}") for i, (y, v) in enumerate(zip(yi, "xyz"))]
    ix = m3(h, B, "B4", 127.0, yi[0], "INT1  -X")
    iy = m3(h, B, "B5", 127.0, yi[1], "INT2  Y")
    iz = m3(h, B, "B6", 127.0, yi[2], "INT3  -Z")
    for o, k in zip(ic, (ix, iy, iz)):
        s.wire(o, k["7"])
    s.place("B7", B["M4"], "M4: inversor  Z", 228.6, yi[2] + 3.81, props=M4P)
    power_pins(s, "B7", (("8", "+15V"), ("9", "-15V")))
    s.place("B8", B["M7"], "M7: W1 = X Z / 10", 228.6, yi[0], props=AD633)
    s.place("B9", B["M7"], "M7: W2 = X Y / 10", 228.6, yi[1], props=AD633)
    for mref in ("B8", "B9"):
        power_pins(s, mref, (("8", "+15V"), ("5", "-15V")))
        for k in ("1", "4", "6"):
            s.stub(mref, k, 5.08, power="GND")
    for k in ("1", "3", "4", "5", "6"):
        s.stub("B7", k, G, power="GND") if k != "2" and False else None
    ma = {k: s.pin("B8", k) for k in ("2", "3", "7")}
    mb = {k: s.pin("B9", k) for k in ("2", "3", "7")}
    inv = {k: s.pin("B7", k) for k in ("2", "7")}
    xn, yv, zn, z = ix["8"], iy["8"], iz["8"], inv["7"]
    # resistencias externas a SUMIN (como en el artículo)
    def ext(ref, val, k):
        sm = k["6"]
        a, b = place2(s, ref, "Device:R", val, sm[0] - 12.7, sm[1], 1, FP["R"], horizontal=True)
        s.wire(b, sm)
        return a
    r1 = ext("R1", "100k", ix)
    r2 = ext("R2", "35.7k", iy)
    r3 = ext("R3", "374k", iz)
    # -X: a X2 de los dos multiplicadores y a R1 (INT1) y R2 (INT2)
    vx_ = 165.1
    s.wire(xn, (vx_, xn[1]))
    s.wire((vx_, 35.56), (vx_, mb["2"][1]), mb["2"])
    s.wire((vx_, ma["2"][1]), ma["2"])
    s.wire((vx_, 35.56), (86.36, 35.56), (86.36, r1[1]), r1)
    s.wire((vx_, 96.52), (83.82, 96.52), (83.82, r2[1]), r2)
    # Y: a Y1 de W2, a X10 de INT1 y a X1 de INT2
    s.wire(yv, mb["3"])
    s.wire((154.94, yv[1]), (154.94, 101.6), (81.28, 101.6), (81.28, ix["2"][1]), ix["2"])
    s.wire((104.14, 101.6), (104.14, iy["1"][1]), iy["1"])
    # -Z: al inversor y por R3 a INT3
    s.wire(zn, (160.02, zn[1]), (205.74, zn[1]), (205.74, inv["2"][1]), inv["2"])
    s.wire((160.02, zn[1]), (160.02, 246.38), (83.82, 246.38), (83.82, r3[1]), r3)
    # Z: a Y1 de W1
    s.wire(z, (251.46, z[1]), (251.46, 86.36), (210.82, 86.36), (210.82, ma["3"][1]), ma["3"])
    # W1 = XZ/10 -> X100A de INT2 ;  W2 = XY/10 -> X100A de INT3
    s.wire(ma["7"], (243.84, ma["7"][1]), (243.84, 111.76), (99.06, 111.76), (99.06, iy["3"][1]), iy["3"])
    s.wire(mb["7"], (246.38, mb["7"][1]), (246.38, 185.42), (99.06, 185.42), (99.06, iz["3"][1]), iz["3"])
    # OP
    op_y = 22.86
    h.source("V3", (63.5, op_y), "PWL", 'pwl="0 0 0.1 0 0.101 12 40 12"', "M1 OP: OPERAR en t = 0.1 s")
    s.wire((63.5, op_y), (ix["9"][0], op_y), ix["9"])
    for k in (iy, iz):
        yy = k["9"][1] - 5.08
        s.wire((66.04, op_y), (66.04, yy), (k["9"][0], yy), k["9"])
    h.tp("TP1", "TP1 -X", (vx_, 76.2), up="right", what="Salida de INT1 = -X (x/10)",
         expect="Oscila de forma caótica, saltando entre los dos lóbulos (unos ±2 V)")
    h.tp("TP2", "TP2 Y", (190.5, yv[1]), what="Salida de INT2 = Y (y/10)", expect="Caótica, unos ±2.7 V")
    h.tp("TP3", "TP3 Z", (251.46, 160.02), up="right", what="Salida del inversor = Z (z/10)",
         expect="Siempre positiva, entre 0.5 y 4.8 V")
    s.note("Lorenz escalado (X = x/10, Y = y/10, Z = z/10, C = 1 uF):\n"
           "dX/dt = 10 (Y - X)          INT1: Y por 100k y -X por 100k\n"
           "dY/dt = 28 X - Y - 10 X Z   INT2: -X por 35.7k, Y por 1M, W1 = XZ/10 por 10k\n"
           "dZ/dt = -8/3 Z + 10 X Y      INT3: -Z por 374k, W2 = XY/10 por 10k\n"
           "Osciloscopio X-Y: X (con -X invertido) contra Z.", 154.94, 256.54, 1.27)
    h.directive(".tran 2m 30 0 2m uic", 154.94, 284.48)
    write(d, sdir, name, h, {"titulo": title, "xy": ["TP1", "TP3"], "invertir": ["TP1"], "desde": 0.1})


def write(d, sdir, name, h, extra):
    d.write(force=True, strict=False, native_check=False)
    pro = os.path.join(sdir, name + "_sim.kicad_pro")
    if not os.path.exists(pro):
        json.dump({"meta": {"filename": name + "_sim.kicad_pro", "version": 3}}, open(pro, "w"), indent=2)
    med = {"id": None, "modulo": None, "esquematico": name + "_sim.kicad_sch", "puntos": h.tps, **extra}
    med["id"] = {"07": "prog_caida_libre", "08": "prog_caida_libre_g12", "09": "prog_lorenz"}[os.path.basename(sdir)[:2]]
    json.dump(med, open(os.path.join(sdir, "medidas.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("  ok", os.path.basename(sdir), len(h.tps), "puntos de prueba")


if __name__ == "__main__":
    falling(9.8, "07_programa_caida_libre_g9.8", "Programa: caida libre, g = 9.8 m/s^2 (Fig. 13)")
    falling(12.0, "08_programa_caida_libre_g12", "Programa: caida libre, g = 12 m/s^2 (Fig. 15)")
    lorenz()
