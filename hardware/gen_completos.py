#!/usr/bin/env python3
"""Esquemáticos «completos» (todo con cables, sin etiquetas de red) y esquemáticos de simulación KiCad.

    python hardware/gen_completos.py            # todos
    python hardware/gen_completos.py m3 m4      # algunos

Para cada módulo escribe:
    hardware/<modulo>/completo/<modulo>_completo.kicad_sch
        El mismo circuito que hardware/<modulo>/<modulo>.kicad_sch, pero cada conexión es un cable
        dibujado: no hay etiquetas de red que «se conectan después». Se verifica que tenga exactamente
        las mismas conexiones (hardware/<modulo>/nets.json) con el netlist del propio KiCad.
    simulaciones/kicad/<NN_modulo>/<modulo>_sim.kicad_sch      (M2 a M7)
        El mismo dibujo listo para el simulador de KiCad: los conectores se cambian por fuentes de
        prueba (V), cada pieza lleva su modelo SPICE (simulaciones/kicad/modelos.lib), hay puntos de
        prueba TPn donde se mide y la directiva de análisis (.tran) está escrita en la hoja.
        Se abre en KiCad -> Inspeccionar -> Simulador -> Ejecutar.
    simulaciones/kicad/<NN_modulo>/medidas.json  qué se mide en cada TP (lo lee simular_kicad.py y la web)

Los .kicad_sch son GENERADOS: los cambios se hacen aquí.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from schlib import Design, pin_outward  # noqa: E402
import gen_schematics as GS  # noqa: E402
from gen_schematics import FP, HDR, G, OPAMP, place2  # noqa: E402

SIMDIR = os.path.join(ROOT, "simulaciones", "kicad")
LIB = "../modelos.lib"


# --------------------------------------------------------------------------
# modelos SPICE (solo en los esquemáticos de simulación)
# --------------------------------------------------------------------------
def sub(name, pins, params=None):
    p = {"Sim.Library": LIB, "Sim.Name": name, "Sim.Device": "SUBCKT", "Sim.Pins": pins}
    if params:
        p["Sim.Params"] = params
    return p


LF412 = sub("LF412", "1=1 2=2 3=3 4=4 5=5 6=6 7=7 8=8")
AD633 = sub("AD633", "1=1 2=2 3=3 4=4 5=5 6=6 7=7 8=8")
RELAY = sub("G5V2", "1=1 4=4 6=6 8=8 9=9 11=11 13=13 16=16")
D1N4148 = {"Sim.Library": LIB, "Sim.Name": "1N4148", "Sim.Device": "D", "Sim.Pins": "1=K 2=A"}


def pot(pos, r="10k"):
    return sub("POT", "1=1 2=2 3=3", f"r={r} pos={pos}")


def spdt(pos):
    return sub("SPDT_" + pos, "1=1 2=2 3=3")


def cap(c):
    return {"Sim.Device": "C", "Sim.Params": f"c={c}"}


class Hoja:
    """Una hoja con el modo (completo / simulación) y los puntos de prueba."""

    def __init__(self, d, fname, title, comment, sim):
        self.s = d.sheet(fname, title, paper="auto", comment=comment)
        self.sim = sim
        self.tps = []

    def __getattr__(self, k):
        return getattr(self.s, k)

    def m(self, sim_props, props=None):
        """props de la pieza + su modelo SPICE si es la hoja de simulación."""
        p = dict(props or {})
        if self.sim:
            p.update(sim_props)
        return p

    # ---- conectores -------------------------------------------------------
    def header(self, ref, n, x, y, value, mirror=True, lib=None, fp=None):
        """Coloca el conector (solo en el completo) y devuelve las posiciones de sus pines."""
        xx = x + 5.08 if mirror else x - 5.08
        start = -((n - 1) // 2) * G
        pts = [(round(xx, 2), round(y + start + k * G, 2)) for k in range(n)]
        if not self.sim:
            self.s.place(ref, lib or f"Connector_Generic:Conn_01x{n:02d}", value, x, y,
                         mirror="y" if mirror else None, props={"Footprint": fp or HDR(n)})
            for k, p in enumerate(pts, 1):
                q = self.s.pin(ref, k)
                assert abs(q[0] - p[0]) < 0.01 and abs(q[1] - p[1]) < 0.01, (ref, k, q, p)
        return pts

    def rails_pins(self, pts, rails, lengths=(G, 7.62, 12.7)):
        """Pines de alimentación de un conector con su símbolo de riel (solo en el completo)."""
        if self.sim:
            return
        for (x, y), r, L in zip(pts, rails, lengths):
            if r:
                self.s.wire((x, y), (x + L, y))
                self.s.power(r, x + L, y, rot=self.s._power_rot(r, (-1, 0)))

    # ---- banco de prueba (solo simulación) --------------------------------
    def source(self, ref, pt, kind, params, value, ext=0.0):
        """Fuente horizontal con su + en pt (o ext mm más a la izquierda, unida con un cable)
        y el - a GND. Solo en la hoja de simulación."""
        if not self.sim:
            return
        x, y = pt[0] - ext, pt[1]
        if ext:
            self.s.wire((x, y), pt)
        lib = {"DC": "Simulation_SPICE:VDC", "SIN": "Simulation_SPICE:VSIN", "PWL": "Simulation_SPICE:VPWL"}[kind]
        props = {"Sim.Device": "V", "Sim.Type": kind, "Sim.Pins": "1=+ 2=-", "Sim.Params": params}
        for rot in (90, 270):
            self.s.place(ref, lib, value, 0, 0, rot=rot, props=props)
            sym = self.s.symbols[-1]
            p1, p2 = self.s.pin(ref, 1), self.s.pin(ref, 2)
            if p1[0] > p2[0]:
                sym["x"], sym["y"] = x - p1[0], y - p1[1]
                break
            self.s.symbols.pop()
        self.s.stub(ref, 2, G, power="GND")

    def supplies(self, x, y):
        """Fuentes de ±15 V del banco de prueba."""
        if not self.sim:
            return
        for ref, top, bot in (("V1", "+15V", "GND"), ("V2", "GND", "-15V")):
            self.s.place(ref, "Simulation_SPICE:VDC", "15", x, y,
                         props={"Sim.Device": "V", "Sim.Type": "DC", "Sim.Pins": "1=+ 2=-", "Sim.Params": "dc=15"})
            self.s.stub(ref, 1, G, power=top)
            self.s.stub(ref, 2, G, power=bot)
            x += 12.7

    def tp(self, ref, name, pt, up=True, L=G, what="", expect="", xy=None):
        """Punto de prueba en pt (un punto de un cable o de un pin), solo en la simulación."""
        if not self.sim:
            return
        d = {True: (0, -1), False: (0, 1), "up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}[up]
        end = (round(pt[0] + d[0] * L, 2), round(pt[1] + d[1] * L, 2))
        self.s.wire(pt, end)
        pin = self.s.lib.get("Connector:TestPoint").find_pin("1", 1)
        rot = next(r for r in (0, 90, 180, 270) if pin_outward(pin, r) == (-d[0], -d[1]))
        self.s.place(ref, "Connector:TestPoint", name, end[0], end[1], rot=rot, sim=False)
        self.tps.append({"ref": ref, "nombre": name, "que": what, "esperado": expect})

    def model(self, ref, unit, props):
        """Añade el modelo SPICE a una unidad ya colocada (p. ej. por un helper de gen_schematics)."""
        if self.sim:
            for sym in self.s.symbols:
                if sym["ref"] == ref and sym["unit"] == unit and not sym["power"]:
                    sym["props"].update(props)

    def directive(self, text, x, y):
        if self.sim:
            self.s.note(text, x, y, 1.27)


def fan(s, pts, targets, cols):
    """Une pts[i] (salidas hacia la derecha) con targets[i] por la columna cols[i]."""
    for p, t, c in zip(pts, targets, cols):
        if p is None or t is None:
            continue
        if abs(p[1] - t[1]) < 0.01:
            s.wire(p, t)
        else:
            s.wire(p, (c, p[1]), (c, t[1]), t)


# --------------------------------------------------------------------------
# M1  Fuente ±15 V y control IC/OPERAR (solo completo: es lógica de control)
# --------------------------------------------------------------------------
def m1(h):
    s = h
    J1 = h.header("J1", 3, 30.48, 60.96, "+15 / GND / -15", lib="Connector:Screw_Terminal_01x03", fp=FP["T3"])
    h.rails_pins(J1, ("+15V", "GND", "-15V"))
    place2(s.s, "C1", "Device:C_Polarized", "100uF 25V", 55.88, 58.42, 1, FP["CP"])
    s.stub("C1", 1, G, power="+15V")
    s.stub("C1", 2, G, power="GND")
    place2(s.s, "C2", "Device:C_Polarized", "100uF 25V", 66.04, 58.42, 1, FP["CP"])
    s.stub("C2", 1, G, power="GND")
    s.stub("C2", 2, G, power="-15V")
    s.power("PWR_FLAG", 76.2, 50.8)
    s.wire((76.2, 50.8), (76.2, 53.34))
    s.power("+15V", 76.2, 53.34, rot=180)
    s.power("PWR_FLAG", 83.82, 50.8)
    s.wire((83.82, 50.8), (83.82, 55.88))
    s.gnd(83.82, 55.88)
    s.power("PWR_FLAG", 91.44, 50.8)
    s.wire((91.44, 50.8), (91.44, 55.88))
    s.power("-15V", 91.44, 55.88, rot=180)
    # indicadores
    place2(s.s, "R1", "Device:R", "4.7k", 121.92, 55.88, 1, FP["R"])
    s.stub("R1", 1, G, power="+15V")
    place2(s.s, "D1", "Device:LED", "VERDE +15V", 121.92, 66.04, 2, FP["LED"])
    s.wire(s.pin("R1", 2), s.pin("D1", 2))
    s.stub("D1", 1, G, power="GND")
    place2(s.s, "D2", "Device:LED", "ROJO -15V", 137.16, 55.88, 2, FP["LED"])
    s.stub("D2", 2, G, power="GND")
    place2(s.s, "R2", "Device:R", "4.7k", 137.16, 66.04, 1, FP["R"])
    s.wire(s.pin("D2", 1), s.pin("R2", 1))
    s.stub("R2", 2, G, power="-15V")
    # regulador + interruptor IC/OPERAR
    s.place("U1", "Regulator_Linear:L7812", "L7812", 172.72, 58.42, props={"Footprint": FP["TO220"]})
    vi, vo = s.pin("U1", "IN"), s.pin("U1", "OUT")
    s.stub("U1", "GND", G, power="GND")
    s.wire(vi, (vi[0] - 7.62, vi[1]))
    s.power("+15V", vi[0] - 7.62, vi[1])
    place2(s.s, "C3", "Device:C", "330nF", vi[0] - 5.08, vi[1] + 5.08, 1, FP["C"])
    s.wire(s.pin("C3", 1), (vi[0] - 5.08, vi[1]))
    s.stub("C3", 2, G, power="GND")
    place2(s.s, "C4", "Device:C", "100nF", vo[0] + 5.08, vo[1] + 5.08, 1, FP["C"])
    s.wire(vo, (vo[0] + 12.7, vo[1]))
    s.wire(s.pin("C4", 1), (vo[0] + 5.08, vo[1]))
    s.stub("C4", 2, G, power="GND")
    s.place("SW1", "Switch:SW_SPDT", "IC/OPERAR", vo[0] + 22.86, vo[1] - 2.54, mirror="y",
            props={"Footprint": FP["SW"]})
    a, b, c = s.pin("SW1", 1), s.pin("SW1", 2), s.pin("SW1", 3)
    top, bot = (a, c) if a[1] < c[1] else (c, a)
    s.wire((vo[0] + 12.7, vo[1]), (vo[0] + 12.7, top[1]), top)
    s.stub("SW1", 1 if bot == a else 3, G, power="GND")
    node = (b[0] + 7.62, b[1])
    s.wire(b, node)
    place2(s.s, "R3", "Device:R", "1k", b[0] + 12.7, b[1] + 7.62, 1, FP["R"])
    s.wire(node, (b[0] + 12.7, b[1]), s.pin("R3", 1))
    place2(s.s, "D3", "Device:LED", "AMARILLO OPERAR", b[0] + 12.7, b[1] + 17.78, 2, FP["LED"])
    s.wire(s.pin("R3", 2), s.pin("D3", 2))
    s.stub("D3", 1, G, power="GND")
    s.note("Interruptor arriba = OPERAR: OP = +12 V (los relés de los\n"
           "integradores conmutan). Abajo = IC: OP = 0 V.", 152.4, 93.98, 1.0)
    # salidas del bus: la línea OP va con cable desde el interruptor a cada conector
    trunk = 139.7
    drops = []
    for i, ref in enumerate(("J2", "J3", "J4", "J5")):
        x = 40.64 + i * 30.48
        p = h.header(ref, 4, x, 121.92, "BUS", mirror=False)
        for (px, py), r, L in zip(p[:3], ("+15V", "GND", "-15V"), (G, 7.62, 12.7)):
            s.wire((px, py), (px - L, py))
            s.power(r, px - L, py, rot=s._power_rot(r, (1, 0)))
        p4 = p[3]
        s.wire(p4, (p4[0] - G, p4[1]), (p4[0] - G, trunk))
        drops.append(p4[0] - G)
    s.wire((drops[0], trunk), (node[0], trunk), node)
    s.note("Bus a cada módulo: 1 +15 V, 2 GND, 3 -15 V, 4 OP.", 33.02, 144.78, 1.0)


# --------------------------------------------------------------------------
# M2  Condición inicial
# --------------------------------------------------------------------------
def m2(h):
    s = h
    J1 = h.header("J1", 4, 30.48, 60.96, "BUS")
    h.rails_pins(J1, ("+15V", "GND", "-15V"))
    if not h.sim:
        s.nc("J1", 4)
    GS.pwr_flags(s.s, 45.72, 45.72)
    h.supplies(30.48, 96.52)
    s.place("RV1", "Device:R_Potentiometer", "10k multivuelta", 71.12, 60.96,
            props=h.m(pot(0.7), {"Footprint": FP["TRIM"]}))
    s.stub("RV1", 1, G, power="-15V")
    s.stub("RV1", 3, G, power="+15V")
    w = s.pin("RV1", 2)
    s.place("U1", OPAMP, "LF412", w[0] + 26.67, w[1] + 2.54, unit=1, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    p, m, o = s.pin("U1", 3, 1), s.pin("U1", 2, 1), s.pin("U1", 1, 1)
    s.wire(w, p)
    fb = (o[0] + G, o[1])
    s.wire(o, fb, (fb[0], m[1] + 5.08), (m[0] - G, m[1] + 5.08), (m[0] - G, m[1]), m)
    J2 = h.header("J2", 2, o[0] + 25.4, o[1], "-Vic", mirror=False)
    s.wire(fb, J2[0] if not h.sim else (fb[0] + 12.7, fb[1]))
    if not h.sim:
        s.stub("J2", 2, G, power="GND")
    h.tp("TP1", "TP1 cursor", (w[0] + 7.62, w[1]), what="Cursor del potenciómetro (entrada del seguidor)",
         expect="-15 V + 30 V × posición: con el cursor al 70 % = +6 V")
    h.tp("TP2", "TP2 IC_OUT", (fb[0] + 7.62, fb[1]), what="Salida -Vic del seguidor",
         expect="Igual al cursor (+6 V): el seguidor copia la tensión sin cargar el potenciómetro")
    GS.unused_half(s.s, "U1", 2, w[0] + 26.67, 86.36)
    h.model("U1", 2, LF412)
    s.place("U1", OPAMP, "LF412", 152.4, 60.96, unit=3, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    s.stub("U1", 8, G, power="+15V", unit=3)
    s.stub("U1", 4, G, power="-15V", unit=3)
    GS.decoupling(s.s, ("C1", "C2"), 165.1, 60.96)
    h.directive(".tran 0.1m 20m", 71.12, 106.68)


# --------------------------------------------------------------------------
# M3  Integrador sumador con condición inicial y relé
# --------------------------------------------------------------------------
def m3(h):
    s = h
    J1 = h.header("J1", 4, 25.4, 55.88, "BUS")
    h.rails_pins(J1, ("+15V", "GND", "-15V"))
    GS.pwr_flags(s.s, 45.72, 45.72)
    h.supplies(185.42, 124.46)
    # entradas: J2 -> R1..R5 en filas -> nodo SUMIN
    J2 = h.header("J2", 6, 25.4, 96.52, "ENTRADAS")
    rows = [91.44 + 10.16 * i for i in range(5)]
    cols = [None, 43.18, 40.64, 38.1, 35.56]
    trunk_x = 66.04
    rpins = []
    for i, (ref, val, _lbl) in enumerate(GS.INT_IN):
        a, b = place2(s.s, ref, "Device:R", val, 55.88, rows[i], 1, FP["R"], horizontal=True)
        rpins.append(a)
        s.wire(b, (trunk_x, b[1]))
    s.wire((trunk_x, rows[0]), (trunk_x, rows[-1]))
    used = [0] if h.sim else range(5)
    fan(s.s, [J2[i] if i in used else None for i in range(5)], rpins, [c or 0 for c in cols])
    sum_y = 137.16
    if not h.sim:
        s.wire(J2[5], (J2[5][0] + G, J2[5][1]), (J2[5][0] + G, sum_y), (trunk_x, sum_y), (trunk_x, rows[-1]))
    else:
        s.wire((trunk_x, rows[-1]), (trunk_x, sum_y))
    h.source("V3", J2[0], "DC", "dc=1", "1 V")
    # relé
    kx, ky = 101.6, 106.68
    s.place("K1", "Relay:G5V-2", "G5V-2 12V", kx, ky, props=h.m(RELAY, {"Footprint": FP["RELAY"]}))
    k = {n: s.pin("K1", n) for n in (1, 4, 6, 8, 9, 11, 13, 16)}
    s.wire((trunk_x, sum_y), (k[13][0], sum_y), k[13])                       # SUMIN -> COM2
    s.stub("K1", 16, G, power="GND")
    s.stub("K1", 8, G, power="GND")
    s.stub("K1", 11, G, power="GND")
    inv_y = 88.9
    s.wire(k[6], (k[6][0], inv_y), (k[9][0], inv_y), k[9])                   # NC1 y NO2 = INV
    # diodo en la bobina y línea OP desde el bus
    dx = k[1][0] - 7.62
    a, b = place2(s.s, "D1", "Diode:1N4148", "1N4148", dx, ky, 1, FP["D"], props=h.m(D1N4148))
    s.wire(a, (dx, k[1][1]), k[1])
    s.wire(b, (dx, k[16][1]), k[16])
    op = J1[3]
    s.wire(op, (dx, op[1]), (dx, k[1][1]))
    h.source("V4", op, "PWL", 'pwl="0 0 0.5 0 0.501 12 3 12"', "OP: 0 V -> 12 V en t = 0.5 s")
    # integrador U1A, selector de velocidad y condensadores
    s.place("U1", OPAMP, "LF412", 152.4, 86.36, unit=1, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    s.stub("U1", 3, G, power="GND", unit=1)
    m_, o = s.pin("U1", 2, 1), s.pin("U1", 1, 1)
    s.wire((k[9][0], inv_y), m_)
    s.place("SW1", "Switch:SW_SPDT", "VELOCIDAD x1/x10", 144.78, 66.04, props=h.m(spdt("A"), {"Footprint": FP["SW"]}))
    sa, sb, sc = s.pin("SW1", 1), s.pin("SW1", 2), s.pin("SW1", 3)
    s.wire((134.62, inv_y), (134.62, sb[1]), sb)
    ca, cb = place2(s.s, "C1", "Device:C", "1uF film", sa[0] + 7.62, sa[1], 1, FP["CF"], horizontal=True,
                    props=h.m(cap("1u")))
    s.wire(sa, ca)
    da, db = place2(s.s, "C2", "Device:C", "100nF film", sa[0] + 7.62, sc[1] + 2.54, 1, FP["CF"], horizontal=True,
                    props=h.m(cap("100n")))
    s.wire(sc, (sc[0] + 1.27, sc[1]), (sc[0] + 1.27, da[1]), da)
    xr = max(cb[0], db[0]) + 3.81
    out_x2 = 182.88 - 7.62 * 0
    s.wire(cb, (xr, cb[1]), (xr, db[1]))
    s.wire(db, (xr, db[1]))
    s.wire((xr, db[1]), (xr, o[1]))
    # buffer U1B
    s.place("U1", OPAMP, "LF412", 190.5, o[1] + 2.54, unit=2, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    bp, bm, bo = s.pin("U1", 5, 2), s.pin("U1", 6, 2), s.pin("U1", 7, 2)
    s.wire(o, bp)
    fb = (bo[0] + G, bo[1])
    s.wire(bo, fb, (fb[0], bm[1] + 5.08), (bm[0] - G, bm[1] + 5.08), (bm[0] - G, bm[1]), bm)
    J4 = h.header("J4", 3, fb[0] + 15.24, bo[1] + 2.54, "SALIDA", mirror=False)
    s.wire(fb, J4[0] if not h.sim else (fb[0] + 10.16, fb[1]))
    if not h.sim:
        s.wire(J4[1], (J4[1][0] - G, J4[1][1]), (J4[1][0] - G, J4[0][1]))
        s.stub("J4", 3, G, power="GND")
    # condición inicial: J3 -> R6 -> ICN (COM1) -> R7 -> OUT
    ic_y = 147.32
    J3 = h.header("J3", 2, 25.4, ic_y, "COND. INICIAL")
    a6, b6 = place2(s.s, "R6", "Device:R", "10k", 81.28, ic_y, 1, FP["R"], horizontal=True)
    s.wire(J3[0], a6)
    if not h.sim:
        s.stub("J3", 2, G, power="GND")
    a7, b7 = place2(s.s, "R7", "Device:R", "10k", 124.46, ic_y, 1, FP["R"], horizontal=True)
    s.wire(b6, a7)
    s.wire(k[4], (k[4][0], ic_y))
    ox = 170.18
    s.wire(b7, (ox, ic_y), (ox, o[1]))
    h.source("V5", J3[0], "DC", "dc=2", "Vic = 2 V", ext=0)
    # alimentación de U1
    s.place("U1", OPAMP, "LF412", 190.5, 60.96, unit=3, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    s.stub("U1", 8, G, power="+15V", unit=3)
    s.stub("U1", 4, G, power="-15V", unit=3)
    GS.decoupling(s.s, ("C3", "C4"), 203.2, 60.96)
    # puntos de prueba
    h.tp("TP1", "TP1 entrada", (J2[0][0] + 10.16, J2[0][1]), what="Entrada IN_X1 (1 MΩ, k = 1/s)",
         expect="1 V constante")
    h.tp("TP2", "TP2 OP", (dx, op[1] + 12.7), up="left", L=5.08, what="Control OP del relé",
         expect="0 V (IC) hasta t = 0.5 s; luego 12 V (OPERAR)")
    h.tp("TP3", "TP3 INV", (120.65, inv_y), what="Entrada inversora del integrador (tierra virtual)",
         expect="≈ 0 V todo el tiempo")
    h.tp("TP4", "TP4 salida", (fb[0] + 5.08, fb[1]), what="Salida del integrador (buffer U1B)",
         expect="-2 V durante IC; al pasar a OPERAR baja a -1 V/s hasta saturar en -13.5 V")
    h.directive(".tran 2m 3 0 1m uic", 81.28, 152.4)
    s.note("Relé en reposo (OP = 0 V): IC, ICN -> INV y SUMIN -> GND.\n"
           "Relé activado (OP = +12 V): OPERAR, ICN -> GND y SUMIN -> INV.", 81.28, 157.48 if h.sim else 152.4, 1.0)


# --------------------------------------------------------------------------
# M4  Sumador inversor
# --------------------------------------------------------------------------
def m4(h):
    s = h
    J1 = h.header("J1", 4, 25.4, 55.88, "BUS")
    h.rails_pins(J1, ("+15V", "GND", "-15V"))
    if not h.sim:
        s.nc("J1", 4)
    GS.pwr_flags(s.s, 45.72, 45.72)
    h.supplies(139.7, 119.38)
    J2 = h.header("J2", 6, 25.4, 96.52, "ENTRADAS")
    rows = [91.44 + 10.16 * i for i in range(5)]
    cols = [0, 43.18, 40.64, 38.1, 35.56]
    trunk_x = 66.04
    rpins = []
    for i, (ref, val, _lbl) in enumerate(GS.SUM_IN):
        a, b = place2(s.s, ref, "Device:R", val, 55.88, rows[i], 1, FP["R"], horizontal=True)
        rpins.append(a)
        s.wire(b, (trunk_x, b[1]))
    sum_y = 137.16
    used = [1, 3] if h.sim else range(5)
    fan(s.s, [J2[i] if i in used else None for i in range(5)], rpins, cols)
    if not h.sim:
        s.wire(J2[5], (J2[5][0] + G, J2[5][1]), (J2[5][0] + G, sum_y), (trunk_x, sum_y), (trunk_x, rows[-1]))
    h.source("V3", J2[1], "SIN", "dc=0 ampl=2 f=1", "V1: seno 2 V, 1 Hz")
    h.source("V4", J2[3], "DC", "dc=10", "V2: 10 V", ext=12.7)
    # amplificador
    s.place("U1", OPAMP, "LF412", 88.9, 99.06, unit=1, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    p, m_, o = s.pin("U1", 3, 1), s.pin("U1", 2, 1), s.pin("U1", 1, 1)
    s.stub("U1", 3, G, power="GND", unit=1)
    s.wire((trunk_x, m_[1]), m_)
    # realimentación: SW1 elige R6 (x1) o RV1 (variable)
    top_y, low_y = 68.58, 76.2
    s.wire((trunk_x, top_y), (trunk_x, rows[-1]))
    a6, b6 = place2(s.s, "R6", "Device:R", "10k", 76.2, top_y, 1, FP["R"], horizontal=True)
    s.wire((trunk_x, top_y), a6)
    s.place("RV1", "Device:R_Potentiometer_Trim", "100k", 76.2, low_y, rot=90,
            props=h.m(pot(0.5, "100k"), {"Footprint": FP["TRIM"]}))
    s.nc("RV1", 2)
    r1, r3 = s.pin("RV1", 1), s.pin("RV1", 3)
    left, right = (r1, r3) if r1[0] < r3[0] else (r3, r1)
    s.wire((trunk_x, left[1]), left)
    s.place("SW1", "Switch:SW_SPDT", "GANANCIA", 91.44, 71.12, mirror="y", props=h.m(spdt("A"), {"Footprint": FP["SW"]}))
    sa, sb, sc = s.pin("SW1", 1), s.pin("SW1", 2), s.pin("SW1", 3)
    s.wire(b6, sa)
    s.wire(right, (sc[0] - G, right[1]), (sc[0] - G, sc[1]), sc)
    J3 = h.header("J3", 3, o[0] + 20.32, o[1] + 2.54, "SALIDA", mirror=False)
    xo = sb[0] + 5.08
    s.wire(sb, (xo, sb[1]), (xo, o[1]))
    s.wire(o, J3[0] if not h.sim else (o[0] + 15.24, o[1]))
    if not h.sim:
        s.wire(J3[1], (J3[1][0] - G, J3[1][1]), (J3[1][0] - G, J3[0][1]))
        s.stub("J3", 3, G, power="GND")
    s.place("U1", OPAMP, "LF412", 152.4, 60.96, unit=3, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
    s.stub("U1", 8, G, power="+15V", unit=3)
    s.stub("U1", 4, G, power="-15V", unit=3)
    GS.decoupling(s.s, ("C1", "C2"), 165.1, 60.96)
    GS.unused_half(s.s, "U1", 2, 152.4, 91.44)
    h.model("U1", 2, LF412)
    h.tp("TP1", "TP1 V1", (J2[1][0] + 7.62, J2[1][1]), what="Entrada V1 por 10 kΩ (ganancia 1)",
         expect="Seno de 2 V de pico a 1 Hz")
    h.tp("TP2", "TP2 V2", (J2[3][0] + 2.54, J2[3][1]), up=False, what="Entrada V2 por 100 kΩ (ganancia 0.1)",
         expect="10 V constantes")
    h.tp("TP3", "TP3 SUMIN", (trunk_x, rows[3] + 3.81), up="right", L=5.08,
         what="Nodo suma (tierra virtual)", expect="≈ 0 V: por eso las entradas no se afectan entre sí")
    h.tp("TP4", "TP4 OUT", (o[0] + 10.16, o[1]), what="Salida del sumador",
         expect="OUT = -(V1 + 0.1·V2) = -(2 sen(2π t) + 1): seno de 2 V centrado en -1 V")
    h.directive(".tran 2m 2", 88.9, 134.62)


# --------------------------------------------------------------------------
# M5  Coeficientes: 4 potenciómetros con seguidor
# --------------------------------------------------------------------------
def m5(h):
    s = h
    J1 = h.header("J1", 4, 25.4, 50.8, "BUS")
    h.rails_pins(J1, ("+15V", "GND", "-15V"))
    if not h.sim:
        s.nc("J1", 4)
    GS.pwr_flags(s.s, 45.72, 45.72)
    h.supplies(190.5, 154.94)
    J2 = h.header("J2", 4, 25.4, 99.06, "ENTRADAS")
    ys = [71.12 + 30.48 * i for i in range(4)]
    cin_cols = [35.56, 38.1, 38.1, 35.56]
    out_cols = [134.62, 132.08, 132.08, 134.62]
    J3 = h.header("J3", 5, 152.4, 116.84, "SALIDAS", mirror=False)
    positions = [0.3, 0.7, 0.5, 0.5]
    used = [0, 1] if h.sim else range(4)
    for n, (u, unit, y) in enumerate(zip(("U1", "U1", "U2", "U2"), (1, 2, 1, 2), ys)):
        rv = f"RV{n + 1}"
        s.place(rv, "Device:R_Potentiometer", "10k lineal", 76.2, y, rot=180, mirror="y",
                props=h.m(pot(positions[n]), {"Footprint": FP["POT"]}))
        p1, w, p3 = s.pin(rv, 1), s.pin(rv, 2), s.pin(rv, 3)
        assert p1[1] > p3[1] and w[0] > p1[0], (rv, p1, w, p3)
        s.stub(rv, 1, G, power="GND")
        top = (p3[0], y - 7.62)
        s.wire(top, p3)
        if n in used:
            fan(s.s, [J2[n]], [top], [cin_cols[n]])
        pins = {1: (3, 2, 1), 2: (5, 6, 7)}[unit]
        s.place(u, OPAMP, "LF412", w[0] + 26.67, w[1] + 2.54, unit=unit, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
        pp, pm, po = (s.pin(u, k, unit) for k in pins)
        s.wire(w, pp)
        fb = (po[0] + G, po[1])
        s.wire(po, fb, (fb[0], pm[1] + 5.08), (pm[0] - G, pm[1] + 5.08), (pm[0] - G, pm[1]), pm)
        if not h.sim:
            fan(s.s, [fb], [J3[n]], [out_cols[n]])
        else:
            s.wire(fb, (fb[0] + 7.62, fb[1]))
    if not h.sim:
        s.stub("J3", 5, G, power="GND")
        J4 = h.header("J4", 3, 25.4, 177.8, "REF")
        h.rails_pins(J4, ("+15V", "GND", "-15V"))
        s.note("Puente REF+ -> ENTRADA para un coeficiente constante.", 15.24, 187.96, 1.0)
    # la misma señal en los canales 1 y 2
    h.source("V3", J2[0], "SIN", "dc=0 ampl=10 f=1", "CIN: seno 10 V, 1 Hz")
    h.source("V4", J2[1], "SIN", "dc=0 ampl=10 f=1", "CIN: seno 10 V, 1 Hz", ext=12.7)
    for u, y0 in (("U1", 71.12), ("U2", 101.6)):
        s.place(u, OPAMP, "LF412", 175.26, y0, unit=3, props=h.m(LF412, {"Footprint": FP["DIP8"]}))
        s.stub(u, 8, G, power="+15V", unit=3)
        s.stub(u, 4, G, power="-15V", unit=3)
    GS.decoupling(s.s, ("C1", "C2"), 185.42, 71.12)
    GS.decoupling(s.s, ("C3", "C4"), 185.42, 101.6)
    w1 = s.pin("RV1", 2)
    h.tp("TP1", "TP1 CIN", (cin_cols[0], ys[0] - 7.62 - 0) if False else (55.88, ys[0] - 7.62),
         what="Entrada CIN de los canales 1 y 2", expect="Seno de 10 V de pico a 1 Hz")
    h.tp("TP2", "TP2 cursor 1", (w1[0] + 7.62, w1[1]), what="Cursor de RV1 (posición 30 %)",
         expect="0.3 × CIN = seno de 3 V de pico")
    fb1 = (s.pin("U1", 1, 1)[0] + G, s.pin("U1", 1, 1)[1])
    fb2 = (s.pin("U1", 7, 2)[0] + G, s.pin("U1", 7, 2)[1])
    h.tp("TP3", "TP3 COUT1", (fb1[0] + 5.08, fb1[1]), what="Salida del canal 1",
         expect="Igual que el cursor: seno de 3 V de pico")
    h.tp("TP4", "TP4 COUT2", (fb2[0] + 5.08, fb2[1]), what="Salida del canal 2 (RV2 al 70 %)",
         expect="0.7 × CIN = seno de 7 V de pico")
    h.directive(".tran 2m 2", 55.88, 182.88)


# --------------------------------------------------------------------------
# M6  Filtro RC de salida
# --------------------------------------------------------------------------
def m6(h):
    s = h
    J1 = h.header("J1", 3, 25.4, 63.5, "X / Y / GND")
    if not h.sim:
        s.stub("J1", 3, G, power="GND")
    GS.pwr_flags(s.s, 25.4, 78.74, rails=("GND",))
    outs = []
    for ch, (r, c, j, y, col, pin) in (("X", ("R1", "C1", "J2", 50.8, 38.1, 0)), ("Y", ("R2", "C2", "J3", 76.2, 38.1, 1))):
        a, b = place2(s.s, r, "Device:R", "10k", 76.2, y, 1, FP["R"], horizontal=True)
        fan(s.s, [J1[pin]], [a], [col])
        ct, cb = place2(s.s, c, "Device:C", "100nF", b[0] + 7.62, y + 5.08, 1, FP["C"])
        bx = b[0] + 22.86
        if not h.sim:
            s.place(j, "Connector:Conn_Coaxial", f"BNC {ch}", bx, y, props={"Footprint": FP["BNC"]})
            s.wire(b, s.pin(j, 1))
            s.stub(j, 2, G, power="GND")
        else:
            s.wire(b, (bx - 5.08, y))
        s.wire(ct, (ct[0], y))
        s.stub(c, 2, G, power="GND")
        outs.append((b[0] + 12.7, y))
    h.source("V1", J1[0], "SIN", "dc=0 ampl=5 f=50", "X: seno 5 V, 50 Hz")
    h.source("V2", J1[1], "SIN", "dc=0 ampl=5 f=1k", "Y: seno 5 V, 1 kHz", ext=12.7)
    h.tp("TP1", "TP1 X_IN", (60.96, 50.8), what="Entrada X (50 Hz, debajo de fc)", expect="Seno de 5 V de pico")
    h.tp("TP2", "TP2 X_OUT", outs[0], what="Salida X al BNC",
         expect="Casi igual: 4.5 V de pico (fc = 159 Hz deja pasar los 50 Hz)")
    h.tp("TP3", "TP3 Y_IN", (60.96, 76.2), up=False, what="Entrada Y (1 kHz, encima de fc)", expect="Seno de 5 V de pico")
    h.tp("TP4", "TP4 Y_OUT", outs[1], up=False, what="Salida Y al BNC",
         expect="Atenuada: ≈ 0.8 V de pico (|H| = 1/√(1+(f/fc)²) = 0.157)")
    s.note("fc = 1/(2π·10k·100nF) = 159 Hz: quita el ruido de alta frecuencia sin\n"
           "deformar soluciones de unos pocos hertz.", 25.4, 99.06 if not h.sim else 104.14, 1.0)
    h.directive(".tran 0.01m 60m", 25.4, 96.52)


# --------------------------------------------------------------------------
# M7  Multiplicador AD633
# --------------------------------------------------------------------------
def m7(h, d):
    s = h
    ad633 = d.functional_symbol(
        "AD633",
        left=[("1", "X1", "in"), ("2", "X2", "in"), None, ("3", "Y1", "in"), ("4", "Y2", "in"),
              None, ("6", "Z", "in")],
        right=[("7", "W", "out")],
        top=[("8", "+VS", "pwr")], bottom=[("5", "-VS", "pwr")],
        footprint="Package_DIP:DIP-8_W7.62mm_Socket",
        description="Multiplicador analogico de 4 cuadrantes, W = (X1-X2)(Y1-Y2)/10 V + Z")
    J1 = h.header("J1", 4, 25.4, 55.88, "BUS")
    h.rails_pins(J1, ("+15V", "GND", "-15V"))
    if not h.sim:
        s.nc("J1", 4)
    GS.pwr_flags(s.s, 45.72, 45.72)
    h.supplies(124.46, 119.38)
    J2 = h.header("J2", 6, 25.4, 91.44, "X1 X2 Y1 Y2 Z GND")
    s.place("U1", ad633, "AD633JN", 83.82, 93.98, props=h.m(AD633, {"Footprint": FP["DIP8"]}))
    tgt = [s.pin("U1", k) for k in ("1", "2", "3", "4", "6")]
    cols = [50.8, 48.26, 45.72, 43.18, 40.64]
    if not h.sim:
        fan(s.s, J2[:5], tgt, cols)
        s.stub("J2", 6, G, power="GND") if False else None
        s.wire(J2[5], (J2[5][0] + G, J2[5][1]))
        s.power("GND", J2[5][0] + G, J2[5][1], rot=s._power_rot("GND", (-1, 0)))
    else:
        fan(s.s, [J2[0], None, J2[2], None, None], tgt, cols)
        for k in ("2", "4", "6"):
            s.stub("U1", k, 5.08, power="GND")
    h.source("V3", J2[0], "SIN", "dc=0 ampl=5 f=1", "X: seno 5 V, 1 Hz")
    h.source("V4", J2[2], "SIN", "dc=0 ampl=8 f=3", "Y: seno 8 V, 3 Hz", ext=12.7)
    s.stub("U1", 8, G, power="+15V")
    s.stub("U1", 5, G, power="-15V")
    GS.decoupling(s.s, ("C1", "C2"), 124.46, 71.12)
    wpin = s.pin("U1", "7")
    J3 = h.header("J3", 2, wpin[0] + 25.4, wpin[1], "W", mirror=False)
    s.wire(wpin, J3[0] if not h.sim else (wpin[0] + 15.24, wpin[1]))
    if not h.sim:
        s.stub("J3", 2, G, power="GND")
    h.tp("TP1", "TP1 X", (tgt[0][0] - 5.08, tgt[0][1]), what="Entrada X1", expect="Seno de 5 V a 1 Hz")
    h.tp("TP2", "TP2 Y", (38.1, J2[2][1]), up=False, what="Entrada Y1", expect="Seno de 8 V a 3 Hz")
    h.tp("TP3", "TP3 W", (wpin[0] + 7.62, wpin[1]), what="Salida W = X·Y/10",
         expect="Producto: llega a ±4 V (5 × 8 / 10) y cambia de signo con cada factor")
    s.note("W = (X1-X2)(Y1-Y2)/10 + Z.  Entradas sin usar (X2, Y2, Z) a GND.", 63.5, 116.84 if not h.sim else 132.08, 1.0)
    h.directive(".tran 1m 1", 63.5, 127.0)


MODULES = {
    "m1": ("m1_fuente", "M1 - Fuente +/-15 V y control", None, m1),
    "m2": ("m2_condicion_inicial", "M2 - Condicion inicial", "01_M2_condicion_inicial", m2),
    "m3": ("m3_integrador", "M3 - Integrador con condicion inicial", "02_M3_integrador", m3),
    "m4": ("m4_sumador", "M4 - Sumador inversor", "03_M4_sumador", m4),
    "m5": ("m5_coeficientes", "M5 - Potenciometros de coeficientes", "04_M5_coeficientes", m5),
    "m6": ("m6_filtro_salida", "M6 - Filtro paso bajo de salida", "05_M6_filtro_salida", m6),
    "m7": ("m7_multiplicador", "M7 - Multiplicador AD633", "06_M7_multiplicador", m7),
}


def draw(fn, d, h):
    if fn is m7:
        fn(h, d)
    else:
        fn(h)


def build(key):
    name, title, simfolder, fn = MODULES[key]
    ok = True
    # 1) completo: mismas conexiones que el esquemático del módulo
    pdir = os.path.join(HERE, name, "completo")
    os.makedirs(pdir, exist_ok=True)
    d = Design(pdir, name + "_completo", title=title + " (completo)", rev="A",
               company="Computadora analogica (Johnson 2016)")
    h = Hoja(d, name + "_completo.kicad_sch", title + " - esquematico completo",
             "Todas las conexiones dibujadas con cable (sin etiquetas de red)", sim=False)
    draw(fn, d, h)
    d.write(force=True)
    pro = os.path.join(pdir, name + "_completo.kicad_pro")
    if not os.path.exists(pro):
        json.dump({"meta": {"filename": name + "_completo.kicad_pro", "version": 3}}, open(pro, "w"), indent=2)
    spec = json.load(open(os.path.join(HERE, name, "nets.json")))
    print(f"== {name} completo")
    ok &= d.verify(spec["nets"], [tuple(x) for x in spec["nc"]])
    d.erc()
    if not simfolder:
        return ok
    # 2) simulación
    sdir = os.path.join(SIMDIR, simfolder)
    os.makedirs(sdir, exist_ok=True)
    d = Design(sdir, name + "_sim", title=title + " (simulacion)", rev="A",
               company="Computadora analogica (Johnson 2016)")
    h = Hoja(d, name + "_sim.kicad_sch", title + " - simulacion KiCad",
             "Abrir en KiCad: Inspeccionar > Simulador > Ejecutar. Modelos en ../modelos.lib", sim=True)
    draw(fn, d, h)
    d.write(force=True, strict=False, native_check=False)
    pro = os.path.join(sdir, name + "_sim.kicad_pro")
    if not os.path.exists(pro):
        json.dump({"meta": {"filename": name + "_sim.kicad_pro", "version": 3}}, open(pro, "w"), indent=2)
    extra = {"m6": {"desde": 0.015}}.get(key, {})       # M6: sin el transitorio de arranque del filtro
    json.dump({"modulo": name, "esquematico": name + "_sim.kicad_sch", "puntos": h.tps, **extra},
              open(os.path.join(sdir, "medidas.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"== {name} simulación: {len(h.tps)} puntos de prueba")
    return ok


if __name__ == "__main__":
    keys = [a for a in sys.argv[1:] if not a.startswith("-")] or list(MODULES)
    bad = [k for k in keys if not build(k)]
    print("FALLAN:", bad if bad else "ninguno")
    sys.exit(1 if bad else 0)
