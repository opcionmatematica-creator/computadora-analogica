#!/usr/bin/env python3
"""Genera la PCB (.kicad_pcb) de cada módulo a partir de su esquemático.

Colocación por columnas en el orden de la señal (entrada -> proceso -> salida),
cada columna con las piezas de un mismo bloque funcional; los desacoplos van en
la columna de su integrado. Contorno, agujeros M3 en las esquinas y serigrafía
con el nombre de cada pin de los conectores (para cablear el "patch panel").

    "%LOCALAPPDATA%/Programs/KiCad/10.0/bin/python.exe" gen_pcb.py [m3 ...]

No enruta: el ruteo se hace en KiCad (o con Freerouting); ver README.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pcbnew  # noqa: E402
import pcblib  # noqa: E402
from pcblib import Board, create_board, say  # noqa: E402

GAP_Y = 1.6      # entre piezas de una columna
GAP_X = 2.5      # entre columnas
MARGIN = 7.0     # borde (deja sitio a los agujeros M3)
LEGEND_W = 10.0  # ancho reservado junto a un conector para los nombres de pin

# columna = lista de (ref, rotación).  "legend": lado del texto de pines.
LAYOUT = {
    "m1_fuente": [
        [("J1", 90)], [("C1", 0), ("C2", 0)],
        [("R1", 0), ("D1", 0), ("D2", 0), ("R2", 0)],
        [("U1", 0), ("C3", 0), ("C4", 0)],
        [("SW1", 0), ("R3", 0), ("D3", 0)],
        [("J2", 0), ("J3", 0)], [("J4", 0), ("J5", 0)],
    ],
    "m2_condicion_inicial": [
        [("J1", 0)], [("RV1", 0)], [("U1", 0), ("C1", 0), ("C2", 0)], [("J2", 0)],
    ],
    "m3_integrador": [
        [("J1", 0), ("J2", 0), ("J3", 0)],
        [("R1", 0), ("R2", 0), ("R3", 0), ("R4", 0), ("R5", 0), ("R6", 0), ("R7", 0)],
        [("K1", 0), ("D1", 0)],
        [("SW1", 0), ("C1", 0), ("C2", 0)],
        [("U1", 0), ("C3", 0), ("C4", 0)],
        [("J4", 0)],
    ],
    "m4_sumador": [
        [("J1", 0), ("J2", 0)],
        [("R1", 0), ("R2", 0), ("R3", 0), ("R4", 0), ("R5", 0)],
        [("SW1", 0), ("R6", 0), ("RV1", 0)],
        [("U1", 0), ("C1", 0), ("C2", 0)],
        [("J3", 0)],
    ],
    "m5_coeficientes": [
        [("J1", 0), ("J2", 0), ("J4", 0)],
        [("RV1", 0), ("RV2", 0)], [("RV3", 0), ("RV4", 0)],
        [("U1", 0), ("C1", 0), ("C2", 0)], [("U2", 0), ("C3", 0), ("C4", 0)],
        [("J3", 0)],
    ],
    "m6_filtro_salida": [
        [("J1", 0)], [("R1", 0), ("C1", 0), ("R2", 0), ("C2", 0)], [("J2", 270), ("J3", 270)],
    ],
    "m7_multiplicador": [
        [("J1", 0), ("J2", 0)], [("U1", 0), ("C1", 0), ("C2", 0)], [("J3", 0)],
    ],
}
TITLES = {
    "m1_fuente": "M1 FUENTE +/-15V Y CONTROL",
    "m2_condicion_inicial": "M2 CONDICION INICIAL",
    "m3_integrador": "M3 INTEGRADOR",
    "m4_sumador": "M4 SUMADOR INVERSOR",
    "m5_coeficientes": "M5 COEFICIENTES",
    "m6_filtro_salida": "M6 FILTRO DE SALIDA",
    "m7_multiplicador": "M7 MULTIPLICADOR AD633",
}
# piezas que asoman por el borde derecho (BNC): solo cuentan sus pads
EDGE_RIGHT = {("m6_filtro_salida", "J2"), ("m6_filtro_salida", "J3")}

PIN_NAMES = {  # nombre corto en serigrafía por net
    "+15V": "+15", "-15V": "-15", "GND": "GND", "OP": "OP",
}


def extent(fp):
    return pcblib._part_extent(fp)


def is_header(fp):
    return fp.GetReference().startswith("J") and "PinHeader" in fp.GetFPIDAsString()


def build(name):
    pdir = os.path.join(HERE, name)
    create_board(pdir, name, layers=2)
    b = Board(pdir, name, size=(100, 80), origin=(100.0, 50.0))
    b.sync_footprints(prune=True)
    b.link_schematic()
    cols = LAYOUT[name]
    on_board = set(b.fps)
    listed = {r for c in cols for r, _ in c}
    if on_board != listed:
        raise SystemExit(f"{name}: tabla vs placa: faltan {sorted(on_board - listed)}, "
                         f"sobran {sorted(listed - on_board)}")

    # 1) medir cada pieza ya rotada, en el origen
    sizes = {}
    for col in cols:
        for ref, rot in col:
            fp = b.fps[ref]
            fp.SetOrientationDegrees(rot)
            fp.SetPosition(b.pt(0, 0))
            x0, y0, x1, y1 = extent(fp)
            ox, oy = pcbnew.ToMM(fp.GetPosition().x), pcbnew.ToMM(fp.GetPosition().y)
            x0, x1, y0, y1 = x0 - ox, x1 - ox, y0 - oy, y1 - oy
            if (name, ref) in EDGE_RIGHT:
                px = [pcbnew.ToMM(p.GetPosition().x) - ox for p in fp.Pads()]
                x1 = max(px) + 2.0
            sizes[ref] = (x0, y0, x1, y1)

    # 2) columnas izquierda -> derecha; el texto de pines de un conector va hacia dentro
    x = MARGIN
    col_h = []
    placed = {}
    legends = []
    for ci, col in enumerate(cols):
        w = max(sizes[r][2] - sizes[r][0] for r, _ in col)
        hdr_left = ci == 0 and any(is_header(b.fps[r]) for r, _ in col)
        hdr_right = ci == len(cols) - 1 and ci > 0 and any(is_header(b.fps[r]) for r, _ in col)
        lx = x + (LEGEND_W if hdr_right else 0)
        y = MARGIN
        for ref, rot in col:
            x0, y0, x1, y1 = sizes[ref]
            cx = lx + (w - (x1 - x0)) / 2 - x0
            if (name, ref) in EDGE_RIGHT:
                cx = lx - x0
            placed[ref] = (cx, y - y0, rot)
            if is_header(b.fps[ref]):
                legends.append((ref, "right" if hdr_left or not hdr_right else "left"))
            y += (y1 - y0) + GAP_Y
        col_h.append(y - GAP_Y)
        x = lx + w + (LEGEND_W if hdr_left else 0) + GAP_X
    W = round(x - GAP_X + MARGIN, 1)
    H = round(max(col_h) + MARGIN + 3.0, 1)   # +3: título en la franja inferior
    # centrar verticalmente cada columna
    for ci, col in enumerate(cols):
        dy = (H - 3.0 - MARGIN - col_h[ci]) / 2
        for ref, _ in col:
            cx, cy, rot = placed[ref]
            placed[ref] = (cx, cy + dy, rot)
    b.W, b.H = W, H
    for ref, (cx, cy, rot) in placed.items():
        b.place(ref, round(cx, 2), round(cy, 2), rot)
    b.outline(radius=2.0)
    for hx, hy in ((3.5, 3.5), (W - 3.5, 3.5), (3.5, H - 3.5), (W - 3.5, H - 3.5)):
        b.hole(hx, hy, 3.2)

    # 3) serigrafía: título y nombre de cada pin de los conectores
    b.text(TITLES[name], W / 2, H - 3.2, size=1.4, thickness=0.22)
    b.text("Computadora analogica - basada en J. C. Johnson (2016)", W / 2, 2.6, size=0.9)
    for ref, side in legends:
        fp = b.fps[ref]
        for p in fp.Pads():
            px, py = b.rel(p.GetPosition())
            net = p.GetNetname().lstrip("/")
            nm = PIN_NAMES.get(net, net.replace("IN_", "").replace("_BUF", "").replace("Net-(", "")[:7])
            if side == "right":
                b.text(nm, px + 2.2, py, size=0.9, justify="left")
            else:
                b.text(nm, px - 2.2, py, size=0.9, justify="right")
    b.tidy_references(size=0.9, thickness=0.15)
    b.check()
    b.save(force=True)
    b.drc()
    say(f"{name}: {W} x {H} mm, {len(placed)} piezas")
    return W, H


if __name__ == "__main__":
    sel = [a for a in sys.argv[1:] if not a.startswith("-")]
    for n in LAYOUT:
        if not sel or any(n.startswith(s) for s in sel):
            build(n)
    os._exit(0)   # pcbnew a veces revienta al cerrar el intérprete
