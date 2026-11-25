#!/usr/bin/env python3
"""Esquemáticos KiCad 10 de la Práctica 5 (Taller IV: Electrónica Análoga, UNAL 2026-II):
aplicaciones de los transistores.

    python gen_practica5.py [p1 p2 p3 p4]

Cada circuito es un proyecto en hardware/practica5/<nombre>/ verificado contra su NETS con el
netlist del propio KiCad y con ERC.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from schlib import Design  # noqa: E402
from gen_schematics import place2, G, HDR  # noqa: E402

FP = dict(
    R="Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal",
    CP="Capacitor_THT:CP_Radial_D5.0mm_P2.50mm",
    LED="LED_THT:LED_D5.0mm",
    TO92="Package_TO_SOT_THT:TO-92_Inline",
    TO126="Package_TO_SOT_THT:TO-126-3_Vertical",
    POT="Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical",
    D="Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal",
    BUZ="Buzzer_Beeper:Buzzer_12x9.5RM7.6",
    MOT="Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
)
OUTDIR = os.path.join(HERE, "practica5")


def supply(s, ref, x, y, rail="+5V", label="FUENTE"):
    """Conector de la fuente DC de laboratorio (+ y GND) con PWR_FLAG."""
    s.place(ref, "Connector_Generic:Conn_01x02", label, x, y, mirror="y", props={"Footprint": HDR(2)})
    s.stub(ref, 1, G, power=rail)
    s.stub(ref, 2, 7.62, power="GND")
    s.power("PWR_FLAG", x + 15.24, y - 7.62)
    s.wire((x + 15.24, y - 7.62), (x + 15.24, y - 5.08))
    s.power(rail, x + 15.24, y - 5.08, rot=180)
    s.power("PWR_FLAG", x + 22.86, y - 7.62)
    s.wire((x + 22.86, y - 7.62), (x + 22.86, y - 2.54))
    s.gnd(x + 22.86, y - 2.54)


# --------------------------------------------------------------------------
# Punto 1: multivibrador astable (Figura 1) con período variable
# --------------------------------------------------------------------------
def p1(d):
    s = d.sheet("p5_1_astable.kicad_sch", "P5.1 - Multivibrador astable", paper="auto",
                comment="Figura 1 + RV1/RV2 para variar el periodo. T = 0.693 (RB1 C5 + RB2 C6)")
    with s.block("FUENTE 5 V"):
        supply(s, "J1", 25.4, 63.5)
    with s.block("MULTIVIBRADOR ASTABLE"):
        for side, (q, rc, led, rb, rv, cap, xc, xb, bnode, mirror) in {
            "izq": ("Q5", "R10", "D8", "R9", "RV1", "C5", 66.04, 78.74, "B_Q6", None),
            "der": ("Q6", "R12", "D9", "R11", "RV2", "C6", 116.84, 104.14, "B_Q5", "y"),
        }.items():
            # rama de colector: +5V - Rc - LED - colector
            a, b = place2(s, rc, "Device:R", "1k", xc, 55.88, 1, FP["R"])
            s.stub(rc, 1, G, power="+5V")
            la, lk = place2(s, led, "Device:LED", "LED rojo", xc, 68.58, 2, FP["LED"])
            s.wire(b, la)
            qx = xc - 2.54 if mirror is None else xc + 2.54
            s.place(q, "Transistor_BJT:2N3904", "2N3904", qx, 88.9, mirror=mirror, props={"Footprint": FP["TO92"]})
            s.wire(lk, s.pin(q, "C"))
            s.stub(q, "E", G, power="GND")
            # rama de base del OTRO transistor: +5V - RV - R - nodo base
            s.place(rv, "Device:R_Potentiometer", "50k", xb, 50.8, props={"Footprint": FP["POT"]})
            s.stub(rv, 3, G, power="+5V")
            s.nc(rv, 1)
            ra, rb_ = place2(s, rb, "Device:R", "10k", xb, 66.04, 1, FP["R"])
            w = s.pin(rv, 2)
            s.wire(w, (w[0] + 2.54, w[1]), (w[0] + 2.54, ra[1] - 2.54), (xb, ra[1] - 2.54), ra)
            # condensador de acople: colector -> nodo base del otro
            ny = 78.74
            if mirror is None:
                c1, c2 = place2(s, cap, "Device:C_Polarized", "10uF", (xc + xb) / 2 - 1.27 + 1.27, ny, 1, FP["CP"], horizontal=True)
                s.wire((xc, ny), c1)
            else:
                c1, c2 = place2(s, cap, "Device:C_Polarized", "10uF", (xc + xb) / 2, ny, 2, FP["CP"], horizontal=True)
                s.wire((xc, ny), c2)
            # nodo de base
            far = c2 if mirror is None else c1
            s.wire(rb_, (xb, ny))
            s.wire(far, (xb, ny))
            s.wire((xb, ny), (xb, ny + 5.08))
            s.label(bnode, xb, ny + 5.08, angle=270)
            s.stub(q, "B", 5.08, label="B_" + q)
        s.note("Periodo: T = 0.693 (RB_a C5 + RB_b C6), RB = R9/R11 + RV.\n"
               "RV = 0 (Figura 1): f = 1/(1.386 * 10k * 10uF) = 7.2 Hz.\n"
               "RV = 50k: f = 1.2 Hz.  Saturacion: RB < beta * Rc (60k < 100 * 1k).",
               60.96, 106.68, 1.0)
    s.arrange()
    nets = {
        "+5V": [("J1", 1), ("R10", 1), ("R12", 1), ("RV1", 3), ("RV2", 3)],
        "GND": [("J1", 2), ("Q5", "1"), ("Q6", "1")],
        "LED8": [("R10", 2), ("D8", 2)], "LED9": [("R12", 2), ("D9", 2)],
        "C_Q5": [("D8", 1), ("Q5", "3"), ("C5", 1)],
        "C_Q6": [("D9", 1), ("Q6", "3"), ("C6", 1)],
        "RV1W": [("RV1", 2), ("R9", 1)], "RV2W": [("RV2", 2), ("R11", 1)],
        "B_Q6": [("R9", 2), ("C5", 2), ("Q6", "2")],
        "B_Q5": [("R11", 2), ("C6", 2), ("Q5", "2")],
    }
    return nets, [("RV1", 1), ("RV2", 1)]


# --------------------------------------------------------------------------
# Punto 2: comparador diferencial + conmutador PNP + buzzer (Figura 2)
# --------------------------------------------------------------------------
def p2(d):
    s = d.sheet("p5_2_sensor_buzzer.kicad_sch", "P5.2 - Circuito con sensor y buzzer", paper="auto",
                comment="Etapa 1: par diferencial U1/U2 (referencia 2.5 V).  Etapa 2: PNP U3 conmuta el buzzer")
    with s.block("FUENTE 5 V"):
        supply(s, "J1", 25.4, 63.5)
    with s.block("SENSOR (potenciómetro 0-5 V)"):
        s.place("RV1", "Device:R_Potentiometer", "10k (sensor)", 50.8, 66.04, props={"Footprint": FP["POT"]})
        s.stub("RV1", 3, G, power="+5V")
        s.stub("RV1", 1, G, power="GND")
        w = s.pin("RV1", 2)
        s.wire(w, (w[0] + 7.62, w[1]))
        s.label("SENSOR", w[0] + 7.62, w[1])
    with s.block("ETAPA 1: COMPARADOR DIFERENCIAL"):
        # divisor de referencia R2/R1
        a, b = place2(s, "R2", "Device:R", "2.2k", 81.28, 58.42, 1, FP["R"])
        s.stub("R2", 1, G, power="+5V")
        a1, b1 = place2(s, "R1", "Device:R", "2.2k", 81.28, 81.28, 1, FP["R"])
        s.wire(b, a1)
        s.stub("R1", 2, G, power="GND")
        s.place("U1", "Transistor_BJT:2N3904", "2N3904", 96.52, 69.85, props={"Footprint": FP["TO92"]})
        bu1 = s.pin("U1", "B")
        s.wire((81.28, bu1[1]), bu1)
        a3, b3 = place2(s, "R3", "Device:R", "1k", s.pin("U1", "C")[0], 54.61, 1, FP["R"])
        s.stub("R3", 1, G, power="+5V")
        s.wire(b3, s.pin("U1", "C"))
        s.place("U2", "Transistor_BJT:2N3904", "2N3904", 119.38, 69.85, mirror="y", props={"Footprint": FP["TO92"]})
        a4, b4 = place2(s, "R4", "Device:R", "15k", s.pin("U2", "C")[0], 54.61, 1, FP["R"])
        s.stub("R4", 1, G, power="+5V")
        s.wire(b4, s.pin("U2", "C"))
        e1, e2 = s.pin("U1", "E"), s.pin("U2", "E")
        ty = e1[1] + 5.08
        s.wire(e1, (e1[0], ty), (e2[0], ty), e2)
        xm = (e1[0] + e2[0]) / 2
        xm = round(xm / 2.54) * 2.54
        a5, b5 = place2(s, "R5", "Device:R", "1k", xm, ty + 7.62, 1, FP["R"])
        s.wire((xm, ty), a5)
        s.stub("R5", 2, G, power="GND")
        a6, b6 = place2(s, "R6", "Device:R", "1k", s.pin("U2", "B")[0] + 8.89, 69.85, 2, FP["R"], horizontal=True)
        s.wire(s.pin("U2", "B"), a6)
        s.wire(b6, (b6[0] + 5.08, b6[1]))
        s.label("SENSOR", b6[0] + 5.08, b6[1])
        cx = s.pin("U2", "C")
        s.wire(cx, (cx[0], cx[1] - 2.54))
        s.label("C_U2", cx[0], cx[1] - 2.54, angle=90)
        s.note("Vref = 5 * R1/(R1+R2) = 2.5 V en la base de U1.\n"
               "SENSOR > 2.5 V: U2 conduce y baja C_U2.", 76.2, 101.6, 1.0)
    with s.block("ETAPA 2: CONMUTADOR PNP Y BUZZER"):
        a7, b7 = place2(s, "R7", "Device:R", "200", 160.02, 69.85, 1, FP["R"], horizontal=True)
        s.wire(a7, (a7[0] - 5.08, a7[1]))
        s.label("C_U2", a7[0] - 5.08, a7[1], angle=180)
        s.place("U3", "Transistor_BJT:2N3906", "2N3906", 172.72, 69.85, mirror="x", props={"Footprint": FP["TO92"]})
        s.wire(b7, s.pin("U3", "B"))
        s.stub("U3", "E", G, power="+5V")
        c3 = s.pin("U3", "C")
        dk, da = place2(s, "D1", "Device:D", "1N4007", c3[0], c3[1] + 10.16, 1, FP["D"])
        s.wire(c3, dk)
        # buzzer a la derecha, en paralelo con D1: '+' a la altura del cátodo
        s.place("BZ1", "Device:Buzzer", "Buzzer 5V (L=100uH, R=24)", c3[0] + 12.7, dk[1] + 2.54,
                props={"Footprint": FP["BUZ"]})
        s.wire(dk, s.pin("BZ1", 1))
        s.wire(da, (da[0], da[1] + 2.54))
        s.gnd(da[0], da[1] + 2.54)
        s.stub("BZ1", 2, G, power="GND")
        s.note("D1 (diodo de rueda libre) absorbe el pico inductivo de la\n"
               "bobina del buzzer cuando U3 se apaga.", 150, 96.52, 1.0)
    s.arrange()
    bzp = "1"
    nets = {
        "+5V": [("J1", 1), ("RV1", 3), ("R2", 1), ("R3", 1), ("R4", 1), ("U3", "1")],
        "GND": [("J1", 2), ("RV1", 1), ("R1", 2), ("R5", 2), ("D1", 2), ("BZ1", "2")],
        "SENSOR": [("RV1", 2), ("R6", 1)],
        "VREF": [("R2", 2), ("R1", 1), ("U1", "2")],
        "C_U1": [("R3", 2), ("U1", "3")],
        "C_U2": [("R4", 2), ("U2", "3"), ("R7", 1)],
        "B_U2": [("R6", 2), ("U2", "2")],
        "COLA": [("U1", "1"), ("U2", "1"), ("R5", 1)],
        "B_U3": [("R7", 2), ("U3", "2")],
        "BUZ": [("U3", "3"), ("D1", 1), ("BZ1", bzp)],
    }
    return nets, []


# --------------------------------------------------------------------------
# Punto 3: fuente de corriente constante (Figura 3), 10 mA y 20 mA
# --------------------------------------------------------------------------
def p3(d):
    s = d.sheet("p5_3_fuente_corriente.kicad_sch", "P5.3 - Fuente de corriente constante", paper="auto",
                comment="I = Vbe(Q2) / Rsense.  Rsense = 68 ohm -> 9.6 mA ;  33 ohm -> 19.7 mA")
    with s.block("FUENTE 12 V"):
        supply(s, "J1", 25.4, 63.5, rail="+12V")
    with s.block("FUENTE DE CORRIENTE"):
        a1, b1 = place2(s, "R1", "Device:R", "10k", 60.96, 60.96, 1, FP["R"])
        s.stub("R1", 1, G, power="+12V")
        s.place("Q1", "Transistor_BJT:2N3904", "2N3904", 81.28, 76.2, props={"Footprint": FP["TO92"]})
        c1 = s.pin("Q1", "C")
        s.place("J2", "Connector_Generic:Conn_01x02", "RLOAD (R o LED)", c1[0] + 10.16, c1[1] - 10.16,
                props={"Footprint": HDR(2)}, mirror="y")
        j1, j2 = s.pin("J2", 1), s.pin("J2", 2)
        s.wire(j1, (j1[0] + 5.08 - 10.16 * 0, j1[1])) if False else None
        s.stub("J2", 1, 5.08, power="+12V")
        s.wire(j2, (c1[0] + 5.08, j2[1]), (c1[0] + 5.08, c1[1] - 2.54), (c1[0], c1[1] - 2.54), c1)
        bq1 = s.pin("Q1", "B")
        s.wire(b1, (60.96, bq1[1]), bq1)
        s.place("Q2", "Transistor_BJT:2N3904", "2N3904", 63.5, 91.44, mirror="y", props={"Footprint": FP["TO92"]})
        cq2 = s.pin("Q2", "C")
        s.wire(cq2, (cq2[0], bq1[1])) if abs(cq2[0] - 60.96) < 0.01 else s.wire(cq2, (cq2[0], cq2[1] - 2.54), (60.96, cq2[1] - 2.54), (60.96, bq1[1]))
        s.stub("Q2", "E", G, power="GND")
        e1 = s.pin("Q1", "E")
        ra, rb = place2(s, "R2", "Device:R", "1k", (s.pin("Q2", "B")[0] + e1[0]) / 2, 91.44, 1, FP["R"], horizontal=True)
        s.wire(s.pin("Q2", "B"), ra)
        s.wire(rb, (e1[0], rb[1]))
        s.wire(e1, (e1[0], rb[1]))
        sa, sb = place2(s, "RS1", "Device:R", "68 (10 mA) / 33 (20 mA)", e1[0], 104.14, 1, FP["R"])
        s.wire((e1[0], rb[1]), sa)
        s.stub("RS1", 2, G, power="GND")
        s.note("Realimentacion negativa: si I sube, sube V(Rsense) = Vbe(Q2),\n"
               "Q2 conduce mas, roba corriente de base a Q1 e I baja.\n"
               "I = 0.65 V / Rsense.  Compliancia: Rload_max = (12 - 0.65 - 0.3) / I.",
               50.8, 116.84, 1.0)
    s.arrange()
    nets = {
        "+12V": [("J1", 1), ("R1", 1), ("J2", 1)],
        "GND": [("J1", 2), ("Q2", "1"), ("RS1", 2)],
        "C_Q1": [("J2", 2), ("Q1", "3")],
        "B_Q1": [("R1", 2), ("Q1", "2"), ("Q2", "3")],
        "SENSE": [("Q1", "1"), ("R2", 2), ("RS1", 1)],
        "B_Q2": [("R2", 1), ("Q2", "2")],
    }
    return nets, []


# --------------------------------------------------------------------------
# Punto 4: puente H con transistores (diseño de referencia)
# --------------------------------------------------------------------------
def p4(d):
    s = d.sheet("p5_4_puente_h.kicad_sch", "P5.4 - Puente H", paper="auto",
                comment="Q5 enciende la diagonal Q1-Q4 (giro A); Q6 la diagonal Q2-Q3 (giro B). A = B = 1 prohibido")
    with s.block("FUENTES"):
        supply(s, "J1", 25.4, 63.5, rail="+9V", label="MOTOR 9 V")
        s.place("J2", "Connector_Generic:Conn_01x03", "CONTROL A / B / GND", 25.4, 88.9, mirror="y",
                props={"Footprint": HDR(3)})
        s.stub("J2", 1, 5.08, label="IN_A")
        s.stub("J2", 2, 5.08, label="IN_B")
        s.stub("J2", 3, G, power="GND")
    for side, (qh, ql, qd, rb, rc, rpu, rpd, dh, dl, inp, out, x, mir) in {
        "A": ("Q1", "Q3", "Q5", "R1", "R3", "R5", "R7", "D1", "D3", "IN_A", "MA", 86.36, None),
        "B": ("Q2", "Q4", "Q6", "R2", "R4", "R6", "R8", "D2", "D4", "IN_B", "MB", 157.48, "y"),
    }.items():
        with s.block(f"MEDIO PUENTE {side}"):
            # alto: PNP BD140 con emisor arriba
            s.place(qh, "Transistor_BJT:BD140", "BD140", x, 66.04, mirror="x" if mir is None else "xy" if False else "x",
                    props={"Footprint": FP["TO126"]})
            if mir:
                s.symbols[-1]["mirror"] = None
                s.symbols[-1]["rot"] = 180
            s.stub(qh, "E", G, power="+9V")
            ch = s.pin(qh, "C")
            s.wire(ch, (ch[0], 81.28))
            s.label(out, ch[0], 81.28, angle=0 if mir is None else 180)
            # bajo: NPN BD139
            s.place(ql, "Transistor_BJT:BD139", "BD139", x, 96.52, mirror=mir, props={"Footprint": FP["TO126"]})
            cl = s.pin(ql, "C")
            s.wire(cl, (cl[0], 81.28))
            s.stub(ql, "E", G, power="GND")
            # diodos de rueda libre
            dk, da = place2(s, dh, "Device:D", "1N4007", ch[0] + (7.62 if mir is None else -7.62), 71.12, 1, FP["D"])
            s.wire(dk, (dk[0], dk[1] - 5.08))
            s.power("+9V", dk[0], dk[1] - 5.08)
            s.wire(da, (da[0], 81.28), (ch[0], 81.28))
            dk2, da2 = place2(s, dl, "Device:D", "1N4007", ch[0] + (7.62 if mir is None else -7.62), 91.44, 1, FP["D"])
            s.wire(dk2, (dk2[0], 81.28))
            s.wire(da2, (da2[0], da2[1] + 2.54))
            s.gnd(da2[0], da2[1] + 2.54)
            # pull-up base-emisor del PNP y R3 al colector del driver
            bh = s.pin(qh, "B")
            sx = -1 if mir is None else 1
            pa, pb = place2(s, rpu, "Device:R", "1k", bh[0] + sx * 7.62, bh[1] - 7.62, 1, FP["R"])
            s.stub(rpu, 1, G, power="+9V")
            s.wire(pb, (pb[0], bh[1]), bh)
            ra, rb_ = place2(s, rc, "Device:R", "180 1/2W", bh[0] + sx * 7.62, bh[1] + 12.7, 1, FP["R"])
            s.wire((pb[0], bh[1]), ra)
            # driver NPN 2N3904: colector -> R3, emisor -> base del bajo opuesto (diagonal)
            s.place(qd, "Transistor_BJT:2N3904", "2N3904", bh[0] + sx * 12.7, 99.06 + 7.62, mirror=mir,
                    props={"Footprint": FP["TO92"]})
            cd = s.pin(qd, "C")
            s.wire(rb_, (rb_[0], cd[1] - 2.54), (cd[0], cd[1] - 2.54), cd)
            s.stub(qd, "E", 5.08, label="BL_" + ("B" if side == "A" else "A"))
            bd = s.pin(qd, "B")
            ia, ib = place2(s, rb, "Device:R", "820", bd[0] + sx * 8.89, bd[1], 2 if mir is None else 1,
                            FP["R"], horizontal=True)
            near, farp = (ib, ia) if mir is None else (ia, ib)
            s.wire(bd, near)
            s.wire(farp, (farp[0] + sx * 5.08, farp[1]))
            s.label(inp, farp[0] + sx * 5.08, farp[1], angle=180 if mir is None else 0)
            # base del transistor bajo de ESTE lado, alimentada por el driver del OTRO lado
            bl = s.pin(ql, "B")
            s.wire(bl, (bl[0] + (-5.08 if mir is None else 5.08), bl[1]))
            s.label("BL_" + side, bl[0] + (-5.08 if mir is None else 5.08), bl[1], angle=180 if mir is None else 0)
            qa, qb = place2(s, rpd, "Device:R", "1k", bl[0] + (-5.08 if mir is None else 5.08), bl[1] + 10.16, 1, FP["R"])
            s.wire((bl[0] + (-5.08 if mir is None else 5.08), bl[1]), qa)
            s.stub(rpd, 2, G, power="GND")
    with s.block("MOTOR"):
        s.place("M1", "Motor:Motor_DC", "Motor DC 6-9 V", 121.92, 132.08, props={"Footprint": FP["MOT"]})
        s.stub("M1", 1, 5.08, label="MA")
        s.stub("M1", 2, 5.08, label="MB")
        s.note("Diseno (Vm = 9 V, Imotor = 0.5 A, beta BD13x = 25, sobreexcitacion x2):\n"
               "IB1 = IB4 = 2 * 0.5 / 25 = 40 mA ;  IC5 = IB1 + 0.7 mA = 41 mA\n"
               "IB5 = IC5 / 10 = 4 mA (2N3904 saturado) ;  VB5 = VBE5 + VBE4 = 1.6 V\n"
               "R1 = (5 - 1.6) / 4 mA = 850 -> 820 ohm\n"
               "R3 = (9 - VEB1 - VCE5sat - VBE4) / IC5 = (9 - 0.9 - 0.2 - 0.85) / 41 mA = 172 -> 180 ohm (0.3 W)\n"
               "IN_A = 1, IN_B = 0: Q1+Q4 -> giro A.  IN_A = 0, IN_B = 1: Q2+Q3 -> giro B.\n"
               "IN_A = IN_B = 1: PROHIBIDO (Q1-Q3 y Q2-Q4 en corto a traves de la fuente).",
               86.36, 147.32, 1.0)
    s.arrange()
    nets = {
        "+9V": [("J1", 1), ("Q1", "1"), ("Q2", "1"), ("D1", 1), ("D2", 1), ("R5", 1), ("R6", 1)],
        "GND": [("J1", 2), ("J2", 3), ("Q3", "1"), ("Q4", "1"), ("D3", 2), ("D4", 2), ("R7", 2), ("R8", 2)],
        "IN_A": [("J2", 1), ("R1", 2)], "IN_B": [("J2", 2), ("R2", 2)],
        "MA": [("Q1", "2"), ("Q3", "2"), ("D1", 2), ("D3", 1), ("M1", "1")],
        "MB": [("Q2", "2"), ("Q4", "2"), ("D2", 2), ("D4", 1), ("M1", "2")],
        "B_Q1": [("Q1", "3"), ("R5", 2), ("R3", 1)], "B_Q2": [("Q2", "3"), ("R6", 2), ("R4", 1)],
        "C_Q5": [("R3", 2), ("Q5", "3")], "C_Q6": [("R4", 2), ("Q6", "3")],
        "B_Q5": [("Q5", "2"), ("R1", 1)], "B_Q6": [("Q6", "2"), ("R2", 1)],
        "BL_B": [("Q5", "1"), ("Q4", "3"), ("R8", 1)],
        "BL_A": [("Q6", "1"), ("Q3", "3"), ("R7", 1)],
    }
    return nets, []


CIRCUITS = {
    "p1": ("p5_1_astable", "P5.1 Multivibrador astable", p1),
    "p2": ("p5_2_sensor_buzzer", "P5.2 Sensor y buzzer", p2),
    "p3": ("p5_3_fuente_corriente", "P5.3 Fuente de corriente constante", p3),
    "p4": ("p5_4_puente_h", "P5.4 Puente H", p4),
}


def build(key, force=True):
    name, title, fn = CIRCUITS[key]
    pdir = os.path.join(OUTDIR, name)
    os.makedirs(pdir, exist_ok=True)
    d = Design(pdir, name, title=title, rev="A", company="Taller IV Electronica Analoga - Practica 5")
    nets, nc = fn(d)
    d.write(force=force)
    ok = d.verify(nets, nc)
    d.erc()
    json.dump({"nets": nets, "nc": nc}, open(os.path.join(pdir, "nets.json"), "w"), indent=1)
    return ok


if __name__ == "__main__":
    keys = [a for a in sys.argv[1:] if not a.startswith("-")] or list(CIRCUITS)
    bad = [k for k in keys if not build(k)]
    print("FALLAN:", bad if bad else "ninguno")
    sys.exit(1 if bad else 0)
