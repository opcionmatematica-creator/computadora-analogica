#!/usr/bin/env python3
"""Ejecuta todas las simulaciones ngspice del proyecto (usa el ngspice.dll de KiCad 10).

    python simulaciones/ejecutar_todo.py

Resultado, ordenado por carpetas (cada una con circuito.cir, datos.csv, grafica.png, info.txt):
    simulaciones/computadora_analogica/01..09_*
    simulaciones/practica5/01..08_*
"""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
for script in ("computadora_analogica.py", "practica5.py"):
    print(f"=== {script} ===")
    runpy.run_path(os.path.join(HERE, script), run_name="__main__")
print("\nListo. Resultados en", HERE)
