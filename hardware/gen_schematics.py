#!/usr/bin/env python3
"""Genera los esquemáticos KiCad 10 de cada módulo de la computadora analógica.

Basado en: J. C. Johnson, "Design and Analysis of an Analog Computer" (2016).
El diseño original (una placa = integrador + seguidor de condición inicial +
sumador, con LF412) se divide aquí en módulos independientes que se montan por
separado y se interconectan con cables dupont, como el "patch panel" original.

    python gen_schematics.py            # todos los módulos
    python gen_schematics.py m3         # solo uno

Los .kicad_sch son GENERADOS: edite este script, no los archivos.
Cada módulo se verifica contra su NETS con el netlist del propio KiCad.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from schlib import Design  # noqa: E402

OPAMP = "Amplifier_Operational:TL072"   # LF412 es pin a pin compatible con TL072
FP = dict(
    R="Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal",
    C="Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm",
    CF="Capacitor_THT:C_Rect_L7.2mm_W5.5mm_P5.00mm_FKS2_FKP2_MKS2_MKP2",
    CP="Capacitor_THT:CP_Radial_D6.3mm_P2.50mm",
    DIP8="Package_DIP:DIP-8_W7.62mm_Socket",
    RELAY="Relay_THT:Relay_DPDT_Omron_G5V-2",
    TRIM="Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical",
    POT="Potentiometer_THT:Potentiometer_Alps_RK09K_Single_Vertical",
    SW="Button_Switch_THT:SW_E-Switch_EG1271_SPDT",
    LED="LED_THT:LED_D3.0mm",
    D="Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal",
    T3="TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-3_1x03_P5.00mm_Horizontal",
    BNC="Connector_Coaxial:BNC_Amphenol_B6252HB-NPP3G-50_Horizontal",
    TO220="Package_TO_SOT_THT:TO-220-3_Vertical",
)


def HDR(n):
    return f"Connector_PinHeader_2.54mm:PinHeader_1x{n:02d}_P2.54mm_Vertical"


G = 2.54


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def place2(s, ref, lib, val, x, y, first, fp, horizontal=False, props=None):
    """Two-pin part: `first` pin (number) ends up on top (vertical) or on the
    left (horizontal). Tries the rotations and keeps the one that works."""
    p = dict(props or {})
    p["Footprint"] = fp
    s.place(ref, lib, val, x, y, props=p)
    sym = s.symbols[-1]
    other = "2" if str(first) == "1" else "1"
    for rot in (0, 90, 180, 270):
        sym["rot"] = rot
        a, b = s.pin(ref, first), s.pin(ref, other)
        if horizontal and a[1] == b[1] and a[0] < b[0]:
            return a, b
        if not horizontal and a[0] == b[0] and a[1] < b[1]:
            return a, b
    raise RuntimeError(f"no rotation for {ref}")


def bus_connector(s, ref, x, y, mirror=True, label_op=True):
    """Conector del bus de 4 pines: 1 +15V, 2 GND, 3 -15V, 4 OP (control relé)."""
    s.place(ref, "Connector_Generic:Conn_01x04", "BUS", x, y,
            mirror="y" if mirror else None, props={"Footprint": HDR(4)})
    # longitudes escalonadas: cada símbolo de riel en su propia columna
    s.stub(ref, 1, G, power="+15V")
    s.stub(ref, 2, 7.62, power="GND")
    s.stub(ref, 3, 12.7, power="-15V")
    if label_op:
        s.stub(ref, 4, 17.78, label="OP")


def pwr_flags(s, x, y, rails=("+15V", "GND", "-15V")):
    """PWR_FLAG por riel: los pines del bus son pasivos, el ERC necesita saber
    que la alimentación entra por aquí."""
    for i, r in enumerate(rails):
        xx = x + i * 7.62
        s.power("PWR_FLAG", xx, y)
        if r == "GND":
            s.wire((xx, y), (xx, y + 5.08))
            s.gnd(xx, y + 5.08)
        else:
            s.wire((xx, y), (xx, y + 2.54))
            s.power(r, xx, y + 2.54, rot=180)


def decoupling(s, refs, x, y):
    """Un 100 nF por riel, junto al integrado."""
    a, b = refs
    t, _ = place2(s, a, "Device:C", "100nF", x, y, 1, FP["C"])
    s.stub(a, 1, G, power="+15V")
    s.stub(a, 2, G, power="GND")
    place2(s, b, "Device:C", "100nF", x + 7.62, y, 1, FP["C"])
    s.stub(b, 1, G, power="GND")
    s.stub(b, 2, G, power="-15V")


def opamp_power(s, ref, x, y):
    s.place(ref, OPAMP, "LF412", x, y, unit=3, props={"Footprint": FP["DIP8"]})
    s.stub(ref, 8, G, power="+15V", unit=3)
    s.stub(ref, 4, G, power="-15V", unit=3)


def unused_half(s, ref, unit, x, y):
    """Mitad sin usar: seguidor con + a GND (no oscila, no satura)."""
    s.place(ref, OPAMP, "LF412", x, y, unit=unit, props={"Footprint": FP["DIP8"]})
    pins = {1: (3, 2, 1), 2: (5, 6, 7)}[unit]
    s.stub(ref, pins[0], G, power="GND", unit=unit)
    m, o = s.pin(ref, pins[1], unit), s.pin(ref, pins[2], unit)
    ly = m[1] + 5.08
    s.wire(o, (o[0] + G, o[1]), (o[0] + G, ly), (m[0] - G, ly), (m[0] - G, m[1]), m)


def header(s, ref, n, x, y, names, value, mirror=True, length=5.08):
    s.place(ref, f"Connector_Generic:Conn_01x{n:02d}", value, x, y,
            mirror="y" if mirror else None, props={"Footprint": HDR(n)})
    for i, nm in enumerate(names, 1):
        if nm is None:
            continue
        if nm in ("GND", "+15V", "-15V", "+12V"):
            s.stub(ref, i, G, power=nm)
        else:
            s.stub(ref, i, length, label=nm)


def follower(s, ref, unit, x, y, inp_label, out_label, out_len=7.62):
    """Seguidor de tensión: + = entrada, - unido a la salida."""
    s.place(ref, OPAMP, "LF412", x, y, unit=unit, props={"Footprint": FP["DIP8"]})
    p, m, o = {1: (3, 2, 1), 2: (5, 6, 7)}[unit]
    s.stub(ref, p, 5.08, label=inp_label, unit=unit)
    mp, op = s.pin(ref, m, unit), s.pin(ref, o, unit)
    ly = mp[1] + 5.08
    s.wire(op, (op[0] + out_len, op[1]))
    s.wire((op[0] + G, op[1]), (op[0] + G, ly), (mp[0] - G, ly), (mp[0] - G, mp[1]), mp)
    s.label(out_label, op[0] + out_len, op[1])


# --------------------------------------------------------------------------
# M1  Fuente ±15 V, bus y control IC/OPERAR
# --------------------------------------------------------------------------
def m1(d):
    s = d.sheet("m1_fuente.kicad_sch", "M1 - Fuente +/-15 V y control", paper="auto",
                comment="Bus de 4 hilos: +15V, GND, -15V, OP (relés de integradores)")
    with s.block("ENTRADA FUENTE DE LABORATORIO"):
        s.place("J1", "Connector:Screw_Terminal_01x03", "+15 / GND / -15", 30.48, 60.96,
                mirror="y", props={"Footprint": FP["T3"]})
        s.stub("J1", 1, G, power="+15V")
        s.stub("J1", 2, 7.62, power="GND")
        s.stub("J1", 3, 12.7, power="-15V")
        place2(s, "C1", "Device:C_Polarized", "100uF 25V", 55.88, 58.42, 1, FP["CP"])
        s.stub("C1", 1, G, power="+15V")
        s.stub("C1", 2, G, power="GND")
        place2(s, "C2", "Device:C_Polarized", "100uF 25V", 66.04, 58.42, 1, FP["CP"])
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
        s.note("Fuente de laboratorio doble +/-15 V (el artículo usa +/-15 V;\n"
               "con +/-12 V el rango útil baja a +/-10 V).", 22.86, 76.2, 1.0)

    with s.block("INDICADORES"):
        place2(s, "R1", "Device:R", "4.7k", 121.92, 55.88, 1, FP["R"])
        s.stub("R1", 1, G, power="+15V")
        place2(s, "D1", "Device:LED", "VERDE +15V", 121.92, 66.04, 2, FP["LED"])
        s.wire(s.pin("R1", 2), s.pin("D1", 2))
        s.stub("D1", 1, G, power="GND")
        place2(s, "D2", "Device:LED", "ROJO -15V", 137.16, 55.88, 2, FP["LED"])
        s.stub("D2", 2, G, power="GND")
        place2(s, "R2", "Device:R", "4.7k", 137.16, 66.04, 1, FP["R"])
        s.wire(s.pin("D2", 1), s.pin("R2", 1))
        s.stub("R2", 2, G, power="-15V")

    with s.block("CONTROL IC / OPERAR"):
        s.place("U1", "Regulator_Linear:L7812", "L7812", 172.72, 58.42,
                props={"Footprint": FP["TO220"]})
        vi, vo = s.pin("U1", "IN"), s.pin("U1", "OUT")
        s.stub("U1", "GND", G, power="GND")
        s.wire(vi, (vi[0] - 7.62, vi[1]))
        s.power("+15V", vi[0] - 7.62, vi[1])
        place2(s, "C3", "Device:C", "330nF", vi[0] - 5.08, vi[1] + 5.08, 1, FP["C"])
        s.wire(s.pin("C3", 1), (vi[0] - 5.08, vi[1]))
        s.stub("C3", 2, G, power="GND")
        place2(s, "C4", "Device:C", "100nF", vo[0] + 5.08, vo[1] + 5.08, 1, FP["C"])
        s.wire(vo, (vo[0] + 12.7, vo[1]))
        s.wire(s.pin("C4", 1), (vo[0] + 5.08, vo[1]))
        s.stub("C4", 2, G, power="GND")
        # SW1: B = común -> OP ; A -> +12 V (OPERAR) ; C -> GND (IC / reset)
        s.place("SW1", "Switch:SW_SPDT", "IC/OPERAR", vo[0] + 22.86, vo[1] - 2.54,
                mirror="y", props={"Footprint": FP["SW"]})
        a, b, c = s.pin("SW1", 1), s.pin("SW1", 2), s.pin("SW1", 3)
        # whichever throw sits on the regulator's row takes +12 V
        top, bot = (a, c) if a[1] < c[1] else (c, a)
        s.wire((vo[0] + 12.7, vo[1]), (vo[0] + 12.7, top[1]), top)
        s.stub("SW1", 1 if bot == a else 3, G, power="GND")
        s.wire(b, (b[0] + 7.62, b[1]))
        s.label("OP", b[0] + 7.62, b[1])
        place2(s, "R3", "Device:R", "1k", b[0] + 12.7, b[1] + 7.62, 1, FP["R"])
        s.wire((b[0] + 7.62, b[1]), (b[0] + 12.7, b[1]), s.pin("R3", 1))
        place2(s, "D3", "Device:LED", "AMARILLO OPERAR", b[0] + 12.7, b[1] + 17.78, 2, FP["LED"])
        s.wire(s.pin("R3", 2), s.pin("D3", 2))
        s.stub("D3", 1, G, power="GND")
        s.note("Interruptor arriba = OPERAR: OP = +12 V, los relés de\n"
               "todos los integradores conmutan y empiezan a integrar.\n"
               "Abajo = IC: OP = 0 V, se cargan las condiciones iniciales.",
               152.4, 86.36, 1.0)
        top_is_a = top == a

    with s.block("SALIDAS DEL BUS (a cada módulo)"):
        for i, ref in enumerate(("J2", "J3", "J4", "J5")):
            bus_connector(s, ref, 40.64 + i * 30.48, 121.92, mirror=False)
    s.arrange()

    sw_top = "1" if top_is_a else "3"
    sw_bot = "3" if top_is_a else "1"
    nets = {
        "+15V": [("J1", 1), ("C1", 1), ("R1", 1), ("U1", 1), ("C3", 1)]
                + [(j, 1) for j in ("J2", "J3", "J4", "J5")],
        "GND": [("J1", 2), ("C1", 2), ("C2", 1), ("D1", 1), ("D2", 2), ("U1", 2), ("C3", 2),
                ("C4", 2), ("SW1", sw_bot), ("D3", 1)] + [(j, 2) for j in ("J2", "J3", "J4", "J5")],
        "-15V": [("J1", 3), ("C2", 2), ("R2", 2)] + [(j, 3) for j in ("J2", "J3", "J4", "J5")],
        "LED1": [("R1", 2), ("D1", 2)],
        "LED2": [("D2", 1), ("R2", 1)],
        "+12V": [("U1", 3), ("C4", 1), ("SW1", sw_top)],
        "OP": [("SW1", 2), ("R3", 1)] + [(j, 4) for j in ("J2", "J3", "J4", "J5")],
        "LED3": [("R3", 2), ("D3", 2)],
    }
    return nets, []


# --------------------------------------------------------------------------
# M2  Condición inicial (potenciómetro + seguidor)
# --------------------------------------------------------------------------
def m2(d):
    s = d.sheet("m2_condicion_inicial.kicad_sch", "M2 - Condicion inicial", paper="auto",
                comment="Potenciometro +/-15 V aislado por un seguidor (Fig. 5, IC2B)")
    with s.block("BUS"):
        bus_connector(s, "J1", 30.48, 60.96, label_op=False)
        s.nc("J1", 4)
        pwr_flags(s, 45.72, 45.72)
    with s.block("POTENCIÓMETRO DE CONDICIÓN INICIAL"):
        s.place("RV1", "Device:R_Potentiometer", "10k multivuelta", 71.12, 60.96,
                props={"Footprint": FP["TRIM"]})
        s.stub("RV1", 1, G, power="-15V")
        s.stub("RV1", 3, G, power="+15V")
        w = s.pin("RV1", 2)
        s.wire(w, (w[0] + 5.08, w[1]))
        s.label("WIPER", w[0] + 5.08, w[1])
        s.note("Gire hasta leer en el voltímetro\n-Vic (la condición inicial negada).", 55.88, 76.2, 1.0)
    with s.block("SEGUIDOR (aislamiento)"):
        follower(s, "U1", 1, 116.84, 60.96, "WIPER", "IC_OUT")
        unused_half(s, "U1", 2, 116.84, 86.36)
    with s.block("ALIMENTACIÓN U1"):
        opamp_power(s, "U1", 152.4, 60.96)
        decoupling(s, ("C1", "C2"), 165.1, 60.96)
    with s.block("SALIDA"):
        header(s, "J2", 2, 190.5, 60.96, ["IC_OUT", "GND"], "-Vic", mirror=False)
    s.arrange()
    nets = {
        "+15V": [("J1", 1), ("RV1", 3), ("U1", 8), ("C1", 1)],
        "GND": [("J1", 2), ("U1", 5), ("C1", 2), ("C2", 1), ("J2", 2)],
        "-15V": [("J1", 3), ("RV1", 1), ("U1", 4), ("C2", 2)],
        "WIPER": [("RV1", 2), ("U1", 3)],
        "IC_OUT": [("U1", 1), ("U1", 2), ("J2", 1)],
        "U1B": [("U1", 6), ("U1", 7)],
    }
    return nets, [("J1", 4)]


# --------------------------------------------------------------------------
# M3  Integrador sumador con condición inicial y reset por relé
# --------------------------------------------------------------------------
INT_IN = [  # (pin del conector, ref, valor, etiqueta)  ganancia con C1 = 1 uF
    ("R1", "1M", "IN_X1"),      # k = 1/(1M*1u)   = 1 /s   (x0.1 del artículo)
    ("R2", "100k", "IN_X10"),   # k = 10 /s
    ("R3", "10k", "IN_X100A"),  # k = 100 /s
    ("R4", "10k", "IN_X100B"),
    ("R5", "1k", "IN_X1000"),   # k = 1000 /s
]


def m3(d):
    s = d.sheet("m3_integrador.kicad_sch", "M3 - Integrador con condicion inicial", paper="auto",
                comment="Vout = -(1/C) * integral( sum(Vi/Ri) ) dt  + Vic   (Fig. 3 y Fig. 5, IC1)")
    with s.block("BUS"):
        bus_connector(s, "J1", 25.4, 55.88)
        pwr_flags(s, 45.72, 45.72)
    with s.block("ENTRADAS"):
        header(s, "J2", 6, 25.4, 96.52,
               [lbl for _, _, lbl in INT_IN] + ["SUMIN"], "ENTRADAS")
        header(s, "J3", 2, 25.4, 121.92, ["IC_IN", "GND"], "COND. INICIAL")
    with s.block("RED DE ENTRADA (suma)"):
        x0, y0 = 66.04, 83.82
        bus_x = x0 + 12.7
        for i, (ref, val, lbl) in enumerate(INT_IN):
            y = y0 + i * 10.16
            a, b = place2(s, ref, "Device:R", val, x0, y, 1, FP["R"], horizontal=True)
            s.wire(a, (a[0] - 5.08, a[1]))
            s.label(lbl, a[0] - 5.08, a[1], angle=180)
            s.wire(b, (bus_x, b[1]))
        yA = y0 + 5 * 10.16
        s.wire((bus_x - 12.7, yA), (bus_x, yA))
        s.label("SUMIN", bus_x - 12.7, yA, angle=180)
        s.wire((bus_x, y0), (bus_x, yA))
        s.wire((bus_x, y0), (bus_x + 7.62, y0))
        s.label("SUMIN", bus_x + 7.62, y0)
        s.note("Ganancia de cada entrada con C1 = 1 uF:\n"
               "k = 1/(Ri*C): 1M -> 1/s, 100k -> 10/s,\n"
               "10k -> 100/s, 1k -> 1000/s.  Con C2 (100 nF) x10.",
               50.8, yA + 10.16, 1.0)
    with s.block("RELÉ IC / OPERAR"):
        kx, ky = 132.08, 99.06
        s.place("K1", "Relay:G5V-2", "G5V-2 12V", kx, ky, props={"Footprint": FP["RELAY"]})
        s.stub("K1", 1, G, label="OP")
        s.stub("K1", 16, G, power="GND")
        c1, c16 = s.pin("K1", 1), s.pin("K1", 16)
        dx = c1[0] - 10.16
        a, b = place2(s, "D1", "Diode:1N4148", "1N4148", dx, ky, 1, FP["D"])
        s.wire(a, (dx, c1[1]), c1)
        s.wire(b, (dx, c16[1]), c16)
        s.stub("K1", 4, 5.08, label="ICN")       # COM1
        s.stub("K1", 6, 5.08, label="INV")       # NC1 (reposo = IC)
        s.stub("K1", 8, 10.16, power="GND")      # NO1
        s.stub("K1", 13, 5.08, label="SUMIN")    # COM2
        s.stub("K1", 11, 10.16, power="GND")     # NC2
        s.stub("K1", 9, 5.08, label="INV")       # NO2 (activado = OPERAR)
        s.note("Relé en reposo (OP = 0 V): IC. ICN -> INV, entradas a GND.\n"
               "Relé activado (OP = +12 V): OPERAR. ICN -> GND, entradas -> INV.",
               kx - 22.86, ky + 20.32, 1.0)
    with s.block("CONDICIÓN INICIAL (R6 / R7)"):
        a, b = place2(s, "R6", "Device:R", "10k", 66.04, 152.4, 1, FP["R"], horizontal=True)
        s.wire(a, (a[0] - 5.08, a[1]))
        s.label("IC_IN", a[0] - 5.08, a[1], angle=180)
        s.wire(b, (b[0] + 7.62, b[1]))
        s.label("ICN", b[0] + 7.62, b[1])
        a2, b2 = place2(s, "R7", "Device:R", "10k", b[0] + 20.32, 152.4, 1, FP["R"], horizontal=True)
        s.wire(a2, (b[0] + 7.62, a2[1]))
        s.wire(b2, (b2[0] + 5.08, b2[1]))
        s.label("OUT", b2[0] + 5.08, b2[1])
        s.note("En IC: Vout = -(R7/R6) * Vic = -Vic.\nC1 queda cargado con esa tensión.",
               60.96, 162.56, 1.0)
    with s.block("INTEGRADOR (U1A) Y VELOCIDAD"):
        ux, uy = 132.08, 152.4
        s.place("U1", OPAMP, "LF412", ux, uy, unit=1, props={"Footprint": FP["DIP8"]})
        s.stub("U1", 3, G, power="GND", unit=1)
        m, o = s.pin("U1", 2, 1), s.pin("U1", 1, 1)
        s.wire(m, (m[0] - 7.62, m[1]))
        s.label("INV", m[0] - 7.62, m[1], angle=180)
        s.wire(o, (o[0] + 10.16, o[1]))
        s.label("OUT", o[0] + 10.16, o[1])
        # selector de velocidad: SW1 B (común) en INV, A -> C1, C -> C2
        s.place("SW1", "Switch:SW_SPDT", "VELOCIDAD x1/x10", ux - 10.16, uy - 20.32,
                props={"Footprint": FP["SW"]})
        sa, sb, sc = s.pin("SW1", 1), s.pin("SW1", 2), s.pin("SW1", 3)
        s.wire(sb, (sb[0] - 5.08, sb[1]))
        s.label("INV", sb[0] - 5.08, sb[1], angle=180)
        top, bot = (sa, sc) if sa[1] < sc[1] else (sc, sa)
        ca, cb = place2(s, "C1", "Device:C", "1uF film", top[0] + 10.16, top[1], 1, FP["CF"], horizontal=True)
        s.wire(top, ca)
        da, db = place2(s, "C2", "Device:C", "100nF film", bot[0] + 10.16, bot[1] + 2.54, 1, FP["CF"], horizontal=True)
        s.wire(bot, (bot[0] + 1.27, bot[1]), (bot[0] + 1.27, da[1]), da)
        xr = max(cb[0], db[0]) + 5.08
        s.wire(cb, (xr, cb[1]), (xr, db[1]))
        s.wire(db, (xr, db[1]))
        s.wire((xr, cb[1]), (xr + 5.08, cb[1]))
        s.label("OUT", xr + 5.08, cb[1])
        sw_top_c1 = "1" if top == sa else "3"
    with s.block("BUFFER DE SALIDA (U1B)"):
        follower(s, "U1", 2, 190.5, 152.4, "OUT", "OUT_BUF")
        header(s, "J4", 3, 218.44, 152.4, ["OUT_BUF", "OUT_BUF", "GND"], "SALIDA", mirror=False)
    with s.block("ALIMENTACIÓN U1"):
        opamp_power(s, "U1", 190.5, 99.06)
        decoupling(s, ("C3", "C4"), 203.2, 99.06)
    s.arrange()
    sw_bot_c2 = "3" if sw_top_c1 == "1" else "1"
    nets = {
        "+15V": [("J1", 1), ("U1", 8), ("C3", 1)],
        "GND": [("J1", 2), ("J3", 2), ("K1", 16), ("K1", 8), ("K1", 11), ("U1", 3),
                ("J4", 3), ("C3", 2), ("C4", 1)],
        "-15V": [("J1", 3), ("U1", 4), ("C4", 2)],
        "OP": [("J1", 4), ("K1", 1), ("D1", 1)],
        "COILN": [("K1", 16)],
        "IN_X1": [("J2", 1), ("R1", 1)], "IN_X10": [("J2", 2), ("R2", 1)],
        "IN_X100A": [("J2", 3), ("R3", 1)], "IN_X100B": [("J2", 4), ("R4", 1)],
        "IN_X1000": [("J2", 5), ("R5", 1)],
        "SUMIN": [("J2", 6), ("R1", 2), ("R2", 2), ("R3", 2), ("R4", 2), ("R5", 2), ("K1", 13)],
        "IC_IN": [("J3", 1), ("R6", 1)],
        "ICN": [("R6", 2), ("R7", 1), ("K1", 4)],
        "INV": [("K1", 6), ("K1", 9), ("U1", 2), ("SW1", 2)],
        "OUT": [("U1", 1), ("R7", 2), ("C1", 2), ("C2", 2), ("U1", 5)],
        "CSEL1": [("SW1", sw_top_c1), ("C1", 1)],
        "CSEL2": [("SW1", sw_bot_c2), ("C2", 1)],
        "OUT_BUF": [("U1", 7), ("U1", 6), ("J4", 1), ("J4", 2)],
    }
    # the diode's anode is on the coil's GND side
    nets["GND"].append(("D1", 2))
    del nets["COILN"]
    return nets, []


# --------------------------------------------------------------------------
# M4  Sumador inversor
# --------------------------------------------------------------------------
SUM_IN = [("R1", "1k", "IN_X10"), ("R2", "10k", "IN_X1A"), ("R3", "10k", "IN_X1B"),
          ("R4", "100k", "IN_X01A"), ("R5", "100k", "IN_X01B")]


def m4(d):
    s = d.sheet("m4_sumador.kicad_sch", "M4 - Sumador inversor", paper="auto",
                comment="Vout = -Rf * sum(Vi/Ri)   (Fig. 1 y Fig. 5, IC2A)")
    with s.block("BUS"):
        bus_connector(s, "J1", 25.4, 55.88, label_op=False)
        s.nc("J1", 4)
        pwr_flags(s, 45.72, 45.72)
    with s.block("ENTRADAS"):
        header(s, "J2", 6, 25.4, 91.44, [l for _, _, l in SUM_IN] + ["SUMIN"], "ENTRADAS")
    with s.block("SUMADOR (U1A)"):
        x0, y0 = 71.12, 78.74
        bus_x = x0 + 12.7
        for i, (ref, val, lbl) in enumerate(SUM_IN):
            y = y0 + i * 10.16
            a, b = place2(s, ref, "Device:R", val, x0, y, 1, FP["R"], horizontal=True)
            s.wire(a, (a[0] - 5.08, a[1]))
            s.label(lbl, a[0] - 5.08, a[1], angle=180)
            s.wire(b, (bus_x, b[1]))
        yA = y0 + 5 * 10.16
        s.wire((bus_x - 12.7, yA), (bus_x, yA))
        s.label("SUMIN", bus_x - 12.7, yA, angle=180)
        s.wire((bus_x, y0), (bus_x, yA))
        ux, uy = bus_x + 22.86, y0 + 17.78
        s.place("U1", OPAMP, "LF412", ux, uy, unit=1, props={"Footprint": FP["DIP8"]})
        s.stub("U1", 3, G, power="GND", unit=1)
        m, o = s.pin("U1", 2, 1), s.pin("U1", 1, 1)
        s.wire((bus_x, m[1]), m)
        s.wire(o, (o[0] + 12.7, o[1]))
        s.label("OUT", o[0] + 12.7, o[1])
        # realimentación: SW1 elige R6 (10k fijo, x1) o RV1 (ganancia variable)
        sy = y0 - 12.7
        s.place("SW1", "Switch:SW_SPDT", "GANANCIA", bus_x + 7.62, sy, mirror="y",
                props={"Footprint": FP["SW"]})
        sa, sb, sc = s.pin("SW1", 1), s.pin("SW1", 2), s.pin("SW1", 3)
        s.wire(sb, (sb[0] + 2.54, sb[1]), (sb[0] + 2.54, sy + 5.08))
        s.wire((sb[0] + 2.54, sy + 5.08), (o[0] + 5.08, sy + 5.08), (o[0] + 5.08, o[1]))
        top, bot = (sa, sc) if sa[1] < sc[1] else (sc, sa)
        ra, rb = place2(s, "R6", "Device:R", "10k", top[0] - 10.16, top[1] - 5.08, 1, FP["R"], horizontal=True)
        s.wire(top, (top[0] - 1.27, top[1]), (top[0] - 1.27, rb[1]), rb)
        s.place("RV1", "Device:R_Potentiometer_Trim", "100k", bot[0] - 10.16, bot[1] + 5.08,
                rot=90, props={"Footprint": FP["TRIM"]})
        p1, p2, p3 = s.pin("RV1", 1), s.pin("RV1", 2), s.pin("RV1", 3)
        right, left = (p1, p3) if p1[0] > p3[0] else (p3, p1)
        s.wire(bot, (bot[0] - 1.27, bot[1]), (bot[0] - 1.27, right[1]), right)
        lx = min(ra[0], left[0]) - 5.08
        s.wire(ra, (lx, ra[1]), (lx, left[1]))
        s.wire(left, (lx, left[1]))
        s.wire((lx, ra[1]), (lx, y0 - 2.54), (bus_x, y0 - 2.54), (bus_x, y0))
        s.nc("RV1", 2)
        sw_r6 = "1" if top == sa else "3"
        rv_end = "1" if right == p1 else "3"
        s.note("Vout = -Rf (V1/R1 + V2/R2 + ...).  Rf = R6 = 10k:\n"
               "1k -> x10, 10k -> x1, 100k -> x0.1.  RV1 da ganancia variable.\n"
               "Con una sola entrada de 10k es un inversor de ganancia -1.",
               x0 - 15.24, yA + 10.16, 1.0)
    with s.block("SALIDA"):
        header(s, "J3", 3, 175.26, 96.52, ["OUT", "OUT", "GND"], "SALIDA", mirror=False)
    with s.block("ALIMENTACIÓN U1"):
        opamp_power(s, "U1", 160.02, 58.42)
        decoupling(s, ("C1", "C2"), 172.72, 58.42)
        unused_half(s, "U1", 2, 205.74, 58.42)
    s.arrange()
    nets = {
        "+15V": [("J1", 1), ("U1", 8), ("C1", 1)],
        "GND": [("J1", 2), ("U1", 3), ("U1", 5), ("J3", 3), ("C1", 2), ("C2", 1)],
        "-15V": [("J1", 3), ("U1", 4), ("C2", 2)],
        "IN_X10": [("J2", 1), ("R1", 1)], "IN_X1A": [("J2", 2), ("R2", 1)],
        "IN_X1B": [("J2", 3), ("R3", 1)], "IN_X01A": [("J2", 4), ("R4", 1)],
        "IN_X01B": [("J2", 5), ("R5", 1)],
        "SUMIN": [("J2", 6), ("R1", 2), ("R2", 2), ("R3", 2), ("R4", 2), ("R5", 2),
                  ("U1", 2), ("R6", 1), ("RV1", "1" if rv_end == "3" else "3")],
        "OUT": [("U1", 1), ("SW1", 2), ("J3", 1), ("J3", 2)],
        "RF1": [("SW1", sw_r6), ("R6", 2)],
        "RF2": [("SW1", "3" if sw_r6 == "1" else "1"), ("RV1", rv_end)],
        "U1B": [("U1", 6), ("U1", 7)],
    }
    return nets, [("J1", 4), ("RV1", 2)]


# --------------------------------------------------------------------------
# M5  Panel de coeficientes (4 potenciómetros con buffer)
# --------------------------------------------------------------------------
def m5(d):
    s = d.sheet("m5_coeficientes.kicad_sch", "M5 - Potenciometros de coeficientes", paper="auto",
                comment="Vout_n = a_n * Vin_n,  0 <= a_n <= 1  (Fig. 4: 'Potentiometers = coefficients')")
    with s.block("BUS"):
        bus_connector(s, "J1", 25.4, 50.8, label_op=False)
        s.nc("J1", 4)
        pwr_flags(s, 45.72, 45.72)
    with s.block("ENTRADAS / REFERENCIAS"):
        header(s, "J2", 4, 25.4, 86.36, ["CIN1", "CIN2", "CIN3", "CIN4"], "ENTRADAS")
        header(s, "J4", 3, 25.4, 111.76, ["+15V", "GND", "-15V"], "REF")
        s.note("Puente REF+ -> ENTRADA para\nun coeficiente constante.", 15.24, 124.46, 1.0)
    for blk, chans in (("CANALES 1-2 (U1)", ((1, "U1", 1), (2, "U1", 2))),
                       ("CANALES 3-4 (U2)", ((3, "U2", 1), (4, "U2", 2)))):
        with s.block(blk):
            for k, (n, u, unit) in enumerate(chans):
                y = 60.96 + k * 30.48
                bx = 76.2 if n <= 2 else 76.2 + 101.6
                rv = f"RV{n}"
                s.place(rv, "Device:R_Potentiometer", "10k lineal", bx, y,
                        props={"Footprint": FP["POT"]})
                s.stub(rv, 3, G, label=f"CIN{n}")
                s.stub(rv, 1, G, power="GND")
                w = s.pin(rv, 2)
                s.wire(w, (w[0] + 5.08, w[1]))
                s.label(f"WIP{n}", w[0] + 5.08, w[1])
                follower(s, u, unit, bx + 30.48, y, f"WIP{n}", f"COUT{n}")
    with s.block("ALIMENTACIÓN U1/U2"):
        opamp_power(s, "U1", 157.48, 50.8)
        decoupling(s, ("C1", "C2"), 167.64, 50.8)
        opamp_power(s, "U2", 157.48, 83.82)
        decoupling(s, ("C3", "C4"), 167.64, 83.82)
    with s.block("SALIDAS"):
        header(s, "J3", 5, 200.66, 66.04, ["COUT1", "COUT2", "COUT3", "COUT4", "GND"],
               "SALIDAS", mirror=False)
    s.arrange()
    nets = {
        "+15V": [("J1", 1), ("J4", 1), ("U1", 8), ("U2", 8), ("C1", 1), ("C3", 1)],
        "GND": [("J1", 2), ("J4", 2), ("J3", 5), ("C1", 2), ("C2", 1), ("C3", 2), ("C4", 1)]
               + [(f"RV{n}", 1) for n in range(1, 5)],
        "-15V": [("J1", 3), ("J4", 3), ("U1", 4), ("U2", 4), ("C2", 2), ("C4", 2)],
    }
    for n, u, (p, m, o) in ((1, "U1", (3, 2, 1)), (2, "U1", (5, 6, 7)),
                            (3, "U2", (3, 2, 1)), (4, "U2", (5, 6, 7))):
        nets[f"CIN{n}"] = [("J2", n), (f"RV{n}", 3)]
        nets[f"WIP{n}"] = [(f"RV{n}", 2), (u, p)]
        nets[f"COUT{n}"] = [(u, o), (u, m), ("J3", n)]
    return nets, [("J1", 4)]


# --------------------------------------------------------------------------
# M6  Filtro de salida al osciloscopio
# --------------------------------------------------------------------------
def m6(d):
    s = d.sheet("m6_filtro_salida.kicad_sch", "M6 - Filtro paso bajo de salida", paper="auto",
                comment="RC 10k / 100nF: fc = 1/(2 pi R C) = 159 Hz  (pagina 15 del articulo)")
    with s.block("ENTRADAS"):
        header(s, "J1", 3, 25.4, 60.96, ["X_IN", "Y_IN", "GND"], "X / Y / GND")
        pwr_flags(s, 40.64, 45.72, rails=("GND",))
    for ch, (r, c, j, y) in (("X", ("R1", "C1", "J2", 50.8)), ("Y", ("R2", "C2", "J3", 76.2))):
        with s.block(f"CANAL {ch}"):
            a, b = place2(s, r, "Device:R", "10k", 76.2, y, 1, FP["R"], horizontal=True)
            s.wire(a, (a[0] - 5.08, a[1]))
            s.label(f"{ch}_IN", a[0] - 5.08, a[1], angle=180)
            ct, cb = place2(s, c, "Device:C", "100nF", b[0] + 7.62, y + 5.08, 1, FP["C"])
            s.place(j, "Connector:Conn_Coaxial", f"BNC {ch}", b[0] + 22.86, y,
                    props={"Footprint": FP["BNC"]})
            jin = s.pin(j, 1)
            s.wire(b, jin)
            s.wire(ct, (ct[0], y))
            s.stub(c, 2, G, power="GND")
            s.stub(j, 2, G, power="GND")
    with s.block(None, pad=None):
        s.note("fc = 159 Hz: quita el ruido de alta frecuencia sin\n"
               "deformar soluciones de unos pocos hertz.\n"
               "BNC X -> canal 1 (modo X-Y), BNC Y -> canal 2.", 25.4, 101.6, 1.0)
    s.arrange()
    nets = {
        "X_IN": [("J1", 1), ("R1", 1)], "Y_IN": [("J1", 2), ("R2", 1)],
        "GND": [("J1", 3), ("C1", 2), ("C2", 2), ("J2", 2), ("J3", 2)],
        "X_OUT": [("R1", 2), ("C1", 1), ("J2", 1)],
        "Y_OUT": [("R2", 2), ("C2", 1), ("J3", 1)],
    }
    return nets, []


# --------------------------------------------------------------------------
# M7  Multiplicador AD633 (para Lorenz)
# --------------------------------------------------------------------------
def m7(d):
    ad633 = d.functional_symbol(
        "AD633",
        left=[("1", "X1", "in"), ("2", "X2", "in"), None, ("3", "Y1", "in"), ("4", "Y2", "in"),
              None, ("6", "Z", "in")],
        right=[("7", "W", "out")],
        top=[("8", "+VS", "pwr")], bottom=[("5", "-VS", "pwr")],
        footprint="Package_DIP:DIP-8_W7.62mm_Socket",
        description="Multiplicador analogico de 4 cuadrantes, W = (X1-X2)(Y1-Y2)/10 V + Z")
    s = d.sheet("m7_multiplicador.kicad_sch", "M7 - Multiplicador AD633", paper="auto",
                comment="W = (X1-X2)(Y1-Y2)/10 + Z   (Fig. 18, terminos no lineales de Lorenz)")
    with s.block("BUS"):
        bus_connector(s, "J1", 25.4, 55.88, label_op=False)
        s.nc("J1", 4)
        pwr_flags(s, 45.72, 45.72)
    with s.block("ENTRADAS"):
        header(s, "J2", 6, 25.4, 91.44, ["MX1", "MX2", "MY1", "MY2", "MZ", "GND"], "X1 X2 Y1 Y2 Z GND")
        s.note("Entradas sin usar (X2, Y2, Z):\npuente a GND.", 15.24, 109.22, 1.0)
    with s.block("MULTIPLICADOR U1"):
        s.place("U1", ad633, "AD633JN", 99.06, 73.66, props={"Footprint": FP["DIP8"]})
        s.stub("U1", 1, 5.08, label="MX1")
        s.stub("U1", 2, 5.08, label="MX2")
        s.stub("U1", 3, 5.08, label="MY1")
        s.stub("U1", 4, 5.08, label="MY2")
        s.stub("U1", 6, 5.08, label="MZ")
        s.stub("U1", 7, 7.62, label="MW")
        s.stub("U1", 8, G, power="+15V")
        s.stub("U1", 5, G, power="-15V")
        decoupling(s, ("C1", "C2"), 129.54, 88.9)
        s.note("Diferencial: W = (X1-X2)(Y1-Y2)/10 + Z.\n"
               "Entrar una señal por X2 la invierte (sirve para -x en Lorenz).", 76.2, 106.68, 1.0)
    with s.block("SALIDA"):
        header(s, "J3", 2, 175.26, 73.66, ["MW", "GND"], "W", mirror=False)
    s.arrange()
    nets = {
        "+15V": [("J1", 1), ("U1", 8), ("C1", 1)],
        "GND": [("J1", 2), ("J2", 6), ("J3", 2), ("C1", 2), ("C2", 1)],
        "-15V": [("J1", 3), ("U1", 5), ("C2", 2)],
        "MX1": [("J2", 1), ("U1", 1)], "MX2": [("J2", 2), ("U1", 2)],
        "MY1": [("J2", 3), ("U1", 3)], "MY2": [("J2", 4), ("U1", 4)], "MZ": [("J2", 5), ("U1", 6)],
        "MW": [("U1", 7), ("J3", 1)],
    }
    return nets, [("J1", 4)]


MODULES = {
    "m1": ("m1_fuente", "M1 Fuente y control", m1),
    "m2": ("m2_condicion_inicial", "M2 Condicion inicial", m2),
    "m3": ("m3_integrador", "M3 Integrador", m3),
    "m4": ("m4_sumador", "M4 Sumador inversor", m4),
    "m5": ("m5_coeficientes", "M5 Coeficientes", m5),
    "m6": ("m6_filtro_salida", "M6 Filtro de salida", m6),
    "m7": ("m7_multiplicador", "M7 Multiplicador", m7),
}


def build(key, force=False):
    name, title, fn = MODULES[key]
    pdir = os.path.join(HERE, name)
    os.makedirs(pdir, exist_ok=True)
    d = Design(pdir, name, title=title, rev="A", company="Computadora analogica (Johnson 2016)")
    nets, nc = fn(d)
    d.write(force=force)
    ok = d.verify(nets, nc)
    d.erc()
    json.dump({"nets": nets, "nc": nc}, open(os.path.join(pdir, "nets.json"), "w"), indent=1)
    return ok


if __name__ == "__main__":
    keys = [a for a in sys.argv[1:] if not a.startswith("-")] or list(MODULES)
    force = "--force" in sys.argv
    bad = [k for k in keys if not build(k, force)]
    print("FALLAN:", bad if bad else "ninguno")
    sys.exit(1 if bad else 0)
