# Simulaciones (hechas en KiCad)

Cada simulación es un **esquemático de KiCad** listo para el simulador: el circuito del módulo (o del
programa), las fuentes de prueba, el modelo SPICE de cada pieza y la directiva de análisis (`.tran`)
escrita en la hoja. Para verla en KiCad 10:

1. Abre `kicad/<NN_nombre>/<nombre>_sim.kicad_pro` (o el `.kicad_sch`).
2. *Inspeccionar → Simulador → Ejecutar*.
3. Pulsa en cada punto de prueba **TP1, TP2…** del esquemático para ver su señal.

Los modelos de todas las piezas (LF412, AD633, relé G5V-2, potenciómetro, 1N4148 y los módulos
como bloques para los programas) están en `kicad/modelos.lib`; cada esquemático lo usa con la
ruta relativa `../modelos.lib`, así que la carpeta `kicad/` se copia entera.

```
simulaciones/
├── ejecutar_todo.py        <- redibuja los esquemáticos de simulación y los simula
├── simular_kicad.py        <- hace lo mismo que el botón «Ejecutar» de KiCad, sin abrir KiCad:
│                              kicad-cli exporta el netlist SPICE y el ngspice de KiCad lo simula
├── ngspice.py              <- usa el ngspice.dll que trae KiCad (no hay que instalar nada)
└── kicad/
    ├── modelos.lib
    ├── 01_M2_condicion_inicial/      m2_condicion_inicial_sim.kicad_sch  + medidas.json
    ├── 02_M3_integrador/
    ├── 03_M4_sumador/
    ├── 04_M5_coeficientes/
    ├── 05_M6_filtro_salida/
    ├── 06_M7_multiplicador/
    ├── 07_programa_caida_libre_g9.8/
    ├── 08_programa_caida_libre_g12/
    └── 09_programa_lorenz/
```

Después de simular, cada carpeta tiene además `circuito.cir` (el netlist que exporta KiCad),
`datos.csv` (la tensión en cada TP) y `grafica.png`. `medidas.json` dice qué se mide en cada TP y
qué se debe ver; la web lo muestra en la pestaña «Simulación» de cada módulo.

Ningún circuito está escrito en Python: los esquemáticos los dibuja `hardware/gen_completos.py`
(módulos, con las mismas piezas que el esquemático completo) y `hardware/gen_sim_programas.py`
(programas), y se pueden editar directamente en KiCad.

Para regenerarlo todo: `python simulaciones/ejecutar_todo.py` (Python con numpy y matplotlib, y KiCad 10).
