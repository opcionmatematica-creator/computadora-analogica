#!/usr/bin/env python3
"""Datos de cada componente de cada placa para el visor 3D de la web.

    "%LOCALAPPDATA%\\Programs\\KiCad\\10.0\\bin\\python.exe" hardware/export_componentes.py

Escribe web/assets/<modulo>/componentes.json: referencia, valor, huella, descripción, posición y
giro, rectángulo del courtyard, pads con su red y si a la huella le falta el modelo 3D en la
biblioteca de KiCad (el visor dibuja entonces uno propio). Lo lee web/js/viewer3d.js para poner
las bandas de color de las resistencias, el rotulado de condensadores e integrados y la ficha de
cada pieza.
"""
import glob
import json
import os

import pcbnew

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "KiCad", "10.0", "share", "kicad", "3dmodels")


def mm(v):
    return round(pcbnew.ToMM(v), 3)


def model_exists(path):
    p = path
    for var in ("${KICAD10_3DMODEL_DIR}", "${KICAD9_3DMODEL_DIR}", "${KICAD8_3DMODEL_DIR}"):
        p = p.replace(var, MODELS)
    return any(os.path.exists(os.path.splitext(p)[0] + ext) for ext in (".step", ".stp", ".wrl"))


def field(fp, name):
    try:
        f = fp.GetFieldByName(name)
        return f.GetText() if f else ""
    except Exception:
        return ""


def export(pcb_path):
    b = pcbnew.LoadBoard(pcb_path)
    edge = b.GetBoardEdgesBoundingBox()
    out = {"placa": {"x": mm(edge.GetX()), "y": mm(edge.GetY()), "w": mm(edge.GetWidth()), "h": mm(edge.GetHeight()),
                     "grosor": mm(b.GetDesignSettings().GetBoardThickness())},
           "componentes": []}
    for fp in b.GetFootprints():
        try:
            cy = fp.GetCourtyard(pcbnew.F_CrtYd).BBox()
            court = [mm(cy.GetX()), mm(cy.GetY()), mm(cy.GetRight()), mm(cy.GetBottom())]
        except Exception:
            bb = fp.GetBoundingBox(False)
            court = [mm(bb.GetX()), mm(bb.GetY()), mm(bb.GetRight()), mm(bb.GetBottom())]
        models = [m.m_Filename for m in fp.Models()]
        out["componentes"].append({
            "ref": fp.GetReference(), "valor": fp.GetValue(),
            "huella": str(fp.GetFPID().GetLibItemName()),
            "descripcion": field(fp, "Description") or fp.GetLibDescription(),
            "x": mm(fp.GetPosition().x), "y": mm(fp.GetPosition().y), "giro": round(fp.GetOrientationDegrees(), 2),
            "lado": "abajo" if fp.IsFlipped() else "arriba", "courtyard": court,
            "sin_modelo": not models or not all(model_exists(m) for m in models),
            "pads": [{"n": p.GetNumber(), "x": mm(p.GetPosition().x), "y": mm(p.GetPosition().y), "red": p.GetNetname()}
                     for p in fp.Pads()],
        })
    out["componentes"].sort(key=lambda c: c["ref"])
    return out


if __name__ == "__main__":
    for pcb in sorted(glob.glob(os.path.join(HERE, "m*_*", "m*_*.kicad_pcb"))):
        mod = os.path.splitext(os.path.basename(pcb))[0]
        data = export(pcb)
        dst = os.path.join(ROOT, "web", "assets", mod, "componentes.json")
        json.dump(data, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        miss = [c["ref"] for c in data["componentes"] if c["sin_modelo"]]
        print(f"  ok {mod}: {len(data['componentes'])} componentes" + (f"; sin modelo 3D: {', '.join(miss)}" if miss else ""))
