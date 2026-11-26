# Computadora analógica por módulos

Reconstrucción del proyecto de **Joshua C. Johnson, "Design and Analysis of an Analog Computer: From
Concept to Final System" (Georgia Tech, 2016)** (`docs/johnson_AC.pdf`), dividido en módulos que
cualquiera puede montar y probar uno por uno, con una aplicación web/escritorio que reúne todo.

## Abrir la aplicación

- **Escritorio:** doble clic en `Computadora Analogica.vbs` (o en el acceso directo del Escritorio;
  `crear_acceso_directo.ps1` lo vuelve a crear). Se abre como ventana propia en Edge o Chrome. Con la
  app de escritorio, los botones «Abrir en KiCad» abren cada proyecto, su esquemático completo y su
  simulación.
- **App nativa (Rust):** `cargo build --release --manifest-path app/Cargo.toml` crea
  `app/target/release/computadora-analogica(.exe)`: un solo ejecutable, sin dependencias, que el
  lanzador usa si existe. Si no está compilado, el lanzador usa `node server.js` (mismo comportamiento).
- **Linux:** el ejecutable de Rust o `node server.js` abren la app en Chrome/Chromium/Edge como
  ventana propia (y se cierran con ella) o, si no hay ninguno, en el navegador predeterminado.
  «Abrir en KiCad» usa el `kicad` del PATH (hace falta KiCad 10: los proyectos son de esa versión).
- **Web:** arranca el servidor y abre http://127.0.0.1:8642/web/ en el navegador.
- **Publicar:** la carpeta es un sitio estático (`web/`, `docs/`, `simulaciones/`). Súbela tal cual a
  GitHub Pages, Netlify o similar y entra por `/web/`.

## Módulos

| # | Módulo | Fabricar | Función |
|---|--------|---------:|---------|
| M1 | Fuente ±15 V y control | 1 | Bus de 4 hilos (+15, GND, −15, OP) y conmutador IC/OPERAR (L7812 → relés) |
| M2 | Condición inicial | 2 | Potenciómetro multivuelta + seguidor LF412 |
| M3 | Integrador | 3 | Integrador sumador LF412, relé G5V-2 IC/OPERAR, C = 1 µF / 100 nF, buffer |
| M4 | Sumador inversor | 1 | −Rf·ΣVi/Ri; Rf de 10 kΩ o trimmer de 100 kΩ |
| M5 | Coeficientes | 1 | 4 potenciómetros con buffer (constantes como g = −9.8 V) |
| M6 | Filtro de salida | 1 | RC 10 kΩ/100 nF (159 Hz) con BNC X/Y al osciloscopio |
| M7 | Multiplicador | 2 | AD633, W = (X1−X2)(Y1−Y2)/10 + Z (para Lorenz) |

Programas incluidos: **caída libre** (Figs. 11–17) y **atractor de Lorenz** (Fig. 18), con diagrama
de cableado, conexiones paso a paso, simulación en KiCad del programa completo y simulador interactivo.

Cada módulo tiene en la app: esquemático **por partes** (un recorte por bloque) y **completo** (todo
con cables, sin etiquetas de red), PCB y modelo 3D con el valor, las bandas de color y la ficha de cada
pieza, **simulación hecha en KiCad** con un apartado por punto de medida (dónde va la punta y qué se
debe ver), materiales, montaje en protoboard, prueba y archivos.

## Estructura

```
hardware/gen_schematics.py   esquemáticos KiCad 10 (schlib) + verificación de netlist y ERC
hardware/gen_completos.py    esquemático completo de cada módulo (todo con cables) + hoja de simulación KiCad
hardware/gen_sim_programas.py  hojas de simulación KiCad de los programas (módulos como bloques)
hardware/export_componentes.py datos de cada pieza para el visor 3D (correr con el Python de KiCad)
hardware/gen_pcb.py          PCB por módulo (pcbnew): colocación, contorno, agujeros, serigrafía, DRC
hardware/export_assets.py    SVG/PDF/BOM/GLB/ZIP de cada módulo  ->  web/assets/<módulo>/
hardware/m*_*/               proyectos KiCad (abrir el .kicad_pro)
hardware/export_proto.py     netlist de KiCad -> montaje en protoboard (web/js/protoboard.js)
simulaciones/kicad/          simulaciones hechas en KiCad: un esquemático por módulo/programa (ver simulaciones/README.md)
tools/probar_app.mjs         prueba la app con clics reales en una sola ventana (errores, 404, imágenes rotas)
tools/verificar_protoboard.mjs  comprueba que cada protoboard tenga exactamente las conexiones del netlist
tools/capturar_protoboards.mjs  captura cada montaje paso a paso terminado -> web/assets/sistema/proto/ (Sistema completo)
web/montaje/                 montaje paso a paso de cada módulo (skill protoboard-paso-a-paso) + su .redes.json
tools/captura_ventana.ps1    captura la ventana de la app o la pantalla
blender/render_all.sh        render Cycles de cada placa  ->  web/assets/<módulo>/render.png
web/                         la aplicación (HTML + JS + three.js, sin compilación)
app/                         app de escritorio en Rust (servidor + ventana, solo biblioteca estándar)
server.js                    la misma app en Node, por si no se compila la de Rust
```

## Regenerar

```bat
python hardware\gen_schematics.py
"%LOCALAPPDATA%\Programs\KiCad\10.0\bin\python.exe" hardware\gen_pcb.py
python simulaciones\ejecutar_todo.py      (esquemáticos completos + simulaciones KiCad)
python hardware\export_assets.py
"%LOCALAPPDATA%\Programs\KiCad\10.0\bin\python.exe" hardware\export_componentes.py
python hardware\export_proto.py
node tools\capturar_protoboards.mjs   (después de cambiar un montaje de web/montaje/)
node tools\verificar_protoboard.mjs
bash blender/render_all.sh
cargo build --release --manifest-path app\Cargo.toml
```

Los `.kicad_sch` y `.kicad_pcb` son **generados**: los cambios se hacen en los scripts.
`gen_pcb.py` vuelve a colocar todas las piezas; si editas la colocación a mano en KiCad, pasa esos
cambios a la tabla `LAYOUT` antes de regenerar.

## Estado y verificación

- Esquemáticos: los 7 coinciden **exactamente** con su especificación de netlist (comprobado con el
  netlist del propio KiCad) y el **ERC sale con 0 errores**. Los 7 esquemáticos **completos** (todo con
  cables, sin etiquetas de red) tienen exactamente las mismas conexiones y también 0 errores de ERC.
- PCB: **0 violaciones de DRC** por colocación y paridad con el esquemático correcta.
  **Las pistas no están ruteadas todavía** (ver abajo).
- Simulación en KiCad (esquemáticos de `simulaciones/kicad/`, ngspice de KiCad): el integrador carga
  −2 V y luego integra a −1 V/s hasta −4.5 V a los 3 s; el sumador da −(V1 + 0.1·V2) con la tierra
  virtual a 0 V; el filtro deja 4.77 V de 5 V a 50 Hz y 0.79 V a 1 kHz. En la caída libre, la altura
  máxima es 4.551 m (teoría 4.551 m) y 4.083 m con g = 12. En Lorenz sale el atractor caótico con las
  resistencias exactas del artículo.

### Pendiente: ruteo

Las placas tienen las piezas colocadas y todas las conexiones definidas (ratsnest), pero no tienen
pistas. Hay dos opciones:
1. Rutearlas a mano en KiCad: son placas pequeñas de agujero pasante a 2 capas.
2. Usar Freerouting, que necesita instalar Java y el `.jar` de Freerouting.

Mientras tanto, cada módulo se puede montar en una placa perforada siguiendo el esquemático.

## Montaje en protoboard

Cada módulo tiene su pestaña «Protoboard» con el montaje paso a paso (`web/montaje/`). `hardware/export_proto.py` exporta
el netlist de KiCad de cada módulo y `node tools/verificar_protoboard.mjs` comprueba que no haya abiertos, cortos ni
agujeros ocupados dos veces.

## Diferencias con el diseño original

- La placa original (integrador + seguidor de IC + sumador, con dos LF412) está separada en M2, M3 y M4.
- Las entradas del integrador se nombran por su ganancia real k = 1/(R·C). El artículo llama «x0.1»
  a la entrada de 1 MΩ.
- Se añade un diodo 1N4148 en la bobina del relé y una línea OP común para todos los relés.
- Las mitades de LF412 que no se usan quedan como seguidor con la entrada a GND.
- Conectores de pines de 2.54 mm en vez de borneras, para cablear con dupont.
- En la caída libre, el signo de las constantes está elegido para que no haga falta el inversor.
