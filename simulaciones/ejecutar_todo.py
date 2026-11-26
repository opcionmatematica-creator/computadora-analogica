#!/usr/bin/env python3
"""Regenera los esquemáticos de simulación de KiCad y ejecuta todas las simulaciones.

    python simulaciones/ejecutar_todo.py

Los circuitos están en KiCad (simulaciones/kicad/<NN_nombre>/*_sim.kicad_sch), cada uno con sus
fuentes de prueba, sus modelos (simulaciones/kicad/modelos.lib), sus puntos de prueba TPn y su
directiva .tran. Este script solo:
  1. vuelve a dibujar esos esquemáticos (hardware/gen_completos.py y hardware/gen_sim_programas.py);
  2. los simula con el ngspice de KiCad (simular_kicad.py), igual que el botón «Ejecutar» de KiCad.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for script in ("hardware/gen_completos.py", "hardware/gen_sim_programas.py", "simulaciones/simular_kicad.py"):
    print(f"=== {script} ===", flush=True)
    subprocess.run([sys.executable, os.path.join(ROOT, script)], check=True)
print("\nListo. Resultados en", os.path.join(HERE, "kicad"))
