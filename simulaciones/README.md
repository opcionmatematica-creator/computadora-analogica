# Simulaciones (ngspice)

Todas las simulaciones del proyecto, una carpeta por circuito. Cada carpeta contiene:

| Archivo | Qué es |
|---|---|
| `circuito.cir` | netlist ngspice: se puede correr en ngspice o abrir en el simulador de KiCad |
| `datos.csv` | los datos de las curvas (se abre en Excel o LibreOffice) |
| `grafica.png` | la gráfica |
| `info.txt` | qué muestra y las cifras clave |

```
simulaciones/
├── ejecutar_todo.py              <- regenera todo
├── comun.py                      <- modelos SPICE compartidos (LF412, AD633, 2N3904, 2N3906, BD139/140, LED, diodos)
├── ngspice.py                    <- usa el ngspice.dll que trae KiCad (no hay que instalar nada)
├── computadora_analogica.py
├── computadora_analogica/
│   ├── 01_M2_condicion_inicial/
│   ├── 02_M3_integrador/
│   ├── 03_M4_sumador/
│   ├── 04_M5_coeficientes/
│   ├── 05_M6_filtro_salida/
│   ├── 06_M7_multiplicador/
│   ├── 07_programa_caida_libre_g9.8/
│   ├── 08_programa_caida_libre_g12/
│   └── 09_programa_lorenz/
├── practica5.py
└── practica5/
    ├── 01_astable_formas_de_onda/
    ├── 02_astable_periodo_variable/
    ├── 03_astable_frecuencia_maxima/
    ├── 04_sensor_buzzer_R3_vs_R4/
    ├── 05_fuente_corriente_vs_Rload/
    ├── 06_fuente_corriente_vs_Vcc/
    ├── 07_puente_h_giro/
    └── 08_puente_h_estado_prohibido/
```

Para regenerarlo todo: `python simulaciones/ejecutar_todo.py`. Necesita Python con numpy y matplotlib, y KiCad 10.
