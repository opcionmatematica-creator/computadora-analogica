#!/usr/bin/env python3
"""Exporta de cada módulo KiCad los recursos que usa la web:

    web/assets/<modulo>/esquematico.svg / .pdf
    web/assets/<modulo>/pcb_top.svg, pcb_bottom.svg   (si hay PCB)
    web/assets/<modulo>/placa.glb                      (modelo 3D para el visor)
    web/assets/<modulo>/bom.csv
    web/assets/<modulo>/kicad.zip                      (proyecto completo)

    python export_assets.py [--png]   (--png además rasteriza para revisión)
"""
import glob
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CLI = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "KiCad", "10.0", "bin", "kicad-cli.exe")
if not os.path.exists(CLI):
    CLI = shutil.which("kicad-cli") or "kicad-cli"


def run(*args):
    r = subprocess.run([CLI, *args], capture_output=True, text=True)
    if r.returncode:
        print("   !", " ".join(args[:3]), r.stderr.strip()[:300])
    return r.returncode == 0


def crop_svg(path, pad=6.0):
    """Recorta el viewBox del SVG al dibujo (KiCad exporta la hoja entera)."""
    import re
    import pymupdf
    doc = pymupdf.open(path)
    page = doc[0]
    W, H = page.rect.width, page.rect.height
    pix = page.get_pixmap(matrix=pymupdf.Matrix(0.5, 0.5), alpha=False)
    bg = pix.pixel(2, 2)
    xs, ys = [], []
    for y in range(0, pix.height, 2):
        for x in range(0, pix.width, 2):
            p = pix.pixel(x, y)
            if sum(abs(a - b) for a, b in zip(p, bg)) > 60:
                xs.append(x); ys.append(y)
    if not xs:
        return
    k = 2.0  # factor pix -> unidades de página (pt)
    x0, y0 = max(0, min(xs) * k - pad), max(0, min(ys) * k - pad)
    x1, y1 = min(W, max(xs) * k + pad), min(H, max(ys) * k + pad)
    s = open(path, encoding="utf8").read()
    m = re.search(r'viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"', s)
    vx, vy, vw, vh = map(float, m.groups())
    sx, sy = vw / W, vh / H
    nb = f'viewBox="{vx + x0 * sx:.2f} {vy + y0 * sy:.2f} {(x1 - x0) * sx:.2f} {(y1 - y0) * sy:.2f}"'
    s = s.replace(m.group(0), nb, 1)
    s = re.sub(r'(<svg[^>]*?)\swidth="[^"]*"', lambda mm: mm.group(1) + ' width="%.1fmm"' % ((x1 - x0) * 25.4 / 72), s, count=1)
    s = re.sub(r'(<svg[^>]*?)\sheight="[^"]*"', lambda mm: mm.group(1) + ' height="%.1fmm"' % ((y1 - y0) * 25.4 / 72), s, count=1)
    open(path, "w", encoding="utf8").write(s)


def export(mod, png=False):
    pdir = os.path.join(HERE, mod) if os.path.isdir(os.path.join(HERE, mod)) else os.path.join(HERE, "practica5", mod)
    out = os.path.join(ROOT, "web", "assets", mod)
    os.makedirs(out, exist_ok=True)
    sch = os.path.join(pdir, mod + ".kicad_sch")
    tmp = os.path.join(out, "_svg")
    run("sch", "export", "svg", "--exclude-drawing-sheet", "-o", tmp, sch)
    for f in glob.glob(os.path.join(tmp, "*.svg")):
        shutil.move(f, os.path.join(out, "esquematico.svg"))
        crop_svg(os.path.join(out, "esquematico.svg"))
    shutil.rmtree(tmp, ignore_errors=True)
    run("sch", "export", "pdf", "-o", os.path.join(out, "esquematico.pdf"), sch)
    run("sch", "export", "bom", "-o", os.path.join(out, "bom.csv"),
        "--fields", "Reference,Value,Footprint,${QUANTITY}", "--group-by", "Value,Footprint",
        "--labels", "Referencias,Valor,Huella,Cantidad", sch)
    pcb = os.path.join(pdir, mod + ".kicad_pcb")
    if os.path.exists(pcb):
        run("pcb", "export", "svg", "--mode-single", "--fit-page-to-board", "--exclude-drawing-sheet",
            "-l", "B.Cu,F.Cu,F.Mask,F.SilkS,Edge.Cuts", "-o", os.path.join(out, "pcb_top.svg"), pcb)
        run("pcb", "export", "glb", "--subst-models", "--include-tracks", "--include-pads",
            "--include-zones", "--include-silkscreen", "--include-soldermask", "-f",
            "-o", os.path.join(out, "placa.glb"), pcb)
    with zipfile.ZipFile(os.path.join(out, "kicad.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        for f in glob.glob(os.path.join(pdir, "**", "*"), recursive=True):
            if os.path.isfile(f) and not any(x in f for x in (".schgen", ".pcbgen", "-backups", ".history", "~")):
                z.write(f, os.path.relpath(f, pdir))
    if png:
        import pymupdf
        for f in glob.glob(os.path.join(out, "*.svg")):
            d = pymupdf.open(f)
            r = d[0].rect
            z = 1800 / max(r.width, r.height)
            d[0].get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False).save(f[:-4] + ".png")
    print("  ok", mod)


def combined_pdf():
    """Une los esquemáticos de todos los módulos en un solo PDF (esquemático completo)."""
    import pymupdf
    out = pymupdf.open()
    for f in sorted(glob.glob(os.path.join(ROOT, "web", "assets", "m*_*", "esquematico.pdf"))):
        out.insert_pdf(pymupdf.open(f))
    os.makedirs(os.path.join(ROOT, "web", "assets", "sistema"), exist_ok=True)
    dst = os.path.join(ROOT, "web", "assets", "sistema", "esquematico_completo.pdf")
    out.save(dst)
    print("  ok esquemático completo:", out.page_count, "páginas")


if __name__ == "__main__":
    mods = sorted(os.path.basename(p) for p in glob.glob(os.path.join(HERE, "m*_*")) if os.path.isdir(p))
    mods += sorted(os.path.basename(p) for p in glob.glob(os.path.join(HERE, "practica5", "p5_*")) if os.path.isdir(p))
    sel = [a for a in sys.argv[1:] if not a.startswith("-")]
    for m in mods:
        if not sel or any(m.startswith(s) for s in sel):
            export(m, "--png" in sys.argv)
    combined_pdf()
