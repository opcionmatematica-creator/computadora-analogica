// Contenido de cada módulo y de cada programa.
// Basado en: J. C. Johnson, "Design and Analysis of an Analog Computer: From
// Concept to Final System" (Georgia Tech, 2016).  El PDF está en docs/.

export const PAPER = {
  title: "Design and Analysis of an Analog Computer: From Concept to Final System",
  author: "Joshua C. Johnson",
  year: 2016,
  pdf: "../docs/johnson_AC.pdf",
};

const SOLDER_ORDER =
  "Suelda de menor a mayor altura: resistencias y diodos, zócalos DIP-8, condensadores cerámicos, " +
  "conectores de pines, condensadores de film y electrolíticos y, al final, relé, interruptores y potenciómetros.";

export const MODULES = [
  {
    id: "m1_fuente", n: 1, short: "Fuente y control", name: "M1 · Fuente ±15 V y control IC/OPERAR",
    icon: "⚡", qty: 1,
    role: "Recibe ±15 V de una fuente de laboratorio doble, la filtra y la reparte a todos los módulos por un " +
      "bus de 4 hilos (+15 V, GND, −15 V, OP). Además genera la señal OP que conmuta a la vez los relés de todos los " +
      "integradores: es el «integrator control» de las computadoras analógicas históricas (Fig. 4, EAI TR-48).",
    paper: "Págs. 6–7 y Fig. 5: rieles de ±15 V por conectores D; relé de condición inicial con su terminal J11.",
    equations: [
      "OP = +12 V (L7812) → OPERAR: los integradores integran",
      "OP = 0 V → IC: los integradores cargan su condición inicial",
      "I_LED ≈ (15 − 2) V / 4.7 kΩ ≈ 2.8 mA",
    ],
    build: [
      SOLDER_ORDER,
      "Respeta la polaridad de C1 y C2 (franja = negativo). C2 tiene el positivo hacia GND: el riel −15 V es el más negativo.",
      "Monta el L7812 (U1) de pie; no necesita disipador (solo alimenta relés: unos 30 mA por relé).",
      "Los cuatro conectores J2–J5 son salidas del bus idénticas. Para más de cuatro módulos, encadena el bus de módulo a módulo o añade una regleta.",
    ],
    test: [
      "Sin módulos conectados, alimenta J1 con ±15 V y límite de corriente de 100 mA.",
      "Comprueba que se enciendan los LED verde (+15 V) y rojo (−15 V).",
      "Mide entre el pin 4 (OP) y el pin 2 (GND) de J2: 0 V con SW1 en IC y +12 V ±0.5 V con SW1 en OPERAR (se enciende el LED amarillo).",
    ],
    sim: "m1",
  },
  {
    id: "m2_condicion_inicial", n: 2, short: "Condición inicial", name: "M2 · Condición inicial (potenciómetro + seguidor)",
    icon: "🎚", qty: 2,
    role: "Produce una tensión ajustable entre −13.5 y +13.5 V para la condición inicial (Vic) de un integrador. " +
      "El seguidor de tensión aísla el potenciómetro de la carga de 10 kΩ del circuito de condición inicial, tal como " +
      "explica el artículo («a follower was used to isolate the potentiometer»).",
    paper: "Fig. 5: IC2B (LF412) con el potenciómetro R8 entre +15 V y −15 V.",
    equations: ["IC_OUT = V(cursor),  −13.5 V ≤ IC_OUT ≤ +13.5 V", "El integrador carga Vout = −IC_IN (R7/R6 = 1)"],
    build: [
      SOLDER_ORDER,
      "RV1 es un trimmer multivuelta (Bourns 3386P o similar): permite ajustar la condición inicial con precisión de milivoltios.",
      "Pon el LF412 en su zócalo al final, con la muesca hacia el pin 1 marcado en la serigrafía.",
    ],
    test: [
      "Conecta el bus. Mide IC_OUT con un voltímetro mientras giras RV1: debe recorrer de −13.5 V a +13.5 V sin saltos.",
      "Ajusta el valor del programa. Para la caída libre: +7.07 V (velocidad inicial) y −2.00 V (altura inicial).",
    ],
    sim: "m2",
  },
  {
    id: "m3_integrador", n: 3, short: "Integrador", name: "M3 · Integrador sumador con condición inicial",
    icon: "∫", qty: 3,
    role: "El corazón de la máquina: integra respecto del tiempo la suma ponderada de sus entradas. Un relé DPDT " +
      "conmuta entre el modo IC (carga la condición inicial en el condensador) y el modo OPERAR (integra). Un " +
      "interruptor elige la velocidad de integración (C1 = 1 µF o C2 = 100 nF) y la segunda mitad del LF412 " +
      "funciona como buffer de salida.",
    paper: "Fig. 2 (integrador), Fig. 3 (integrador práctico con relé) y Fig. 5 (IC1A/IC1B, R1–R7, C1, C2).",
    equations: [
      "Vout(t) = −(1/C) ∫ Σ Vi/Ri dt + Vc   (Ec. 6)",
      "k = 1/(Ri·C):  1 MΩ → 1/s · 100 kΩ → 10/s · 10 kΩ → 100/s · 1 kΩ → 1000/s  (C = 1 µF)",
      "En IC: Vout = −(R7/R6)·Vic = −Vic   (Ec. 7)",
    ],
    build: [
      SOLDER_ORDER,
      "C1 y C2 deben ser de film (poliéster o, mejor, polipropileno): los cerámicos y los electrolíticos tienen fugas y absorción dieléctrica que hacen derivar el integrador.",
      "D1 (1N4148) protege al relé: la franja (cátodo) va hacia el lado de OP.",
      "Usa resistencias de 1 % (de película metálica). El artículo atribuye buena parte de su error del 10 % a la acumulación de tolerancias.",
    ],
    test: [
      "Con SW1 de M1 en IC, conecta COND. INICIAL a M2 ajustado a +2 V: OUT debe marcar −2.00 V.",
      "Une la entrada «X1» (1 MΩ) a +1 V (con M5) y pasa M1 a OPERAR: OUT baja a −1 V/s hasta saturar en unos −13.5 V.",
      "Vuelve a IC: OUT regresa al instante a −2 V. Si deriva con la entrada a GND, revisa C1 y la limpieza del flux.",
    ],
    sim: "m3",
  },
  {
    id: "m4_sumador", n: 4, short: "Sumador inversor", name: "M4 · Sumador inversor",
    icon: "Σ", qty: 1,
    role: "Suma sus entradas con signo cambiado y ganancia elegible. Con una sola entrada de 10 kΩ es el inversor " +
      "de ganancia −1 que usan los dos programas del artículo. SW1 alterna entre Rf = 10 kΩ y un trimmer de 100 kΩ " +
      "(ganancia variable, el «Aux Value / GAIN_COEFICIENT» del esquema original).",
    paper: "Fig. 1 y Fig. 5 (IC2A, R9–R15).",
    equations: ["Vout = −Rf (V1/R1 + V2/R2 + …)   (Ec. 2)", "Rf = 10 kΩ: 1 kΩ → ×10 · 10 kΩ → ×1 · 100 kΩ → ×0.1"],
    build: [SOLDER_ORDER, "La mitad B del LF412 queda como seguidor con la entrada + a GND (así no oscila ni se calienta)."],
    test: [
      "Pon +1 V en «X1A» (10 kΩ) y deja las demás entradas libres: OUT = −1.00 V.",
      "Pon +1 V en X1A y +2 V en X1B: OUT = −3.00 V. Con SW1 en el trimmer, ajusta cualquier ganancia entre 0 y −10.",
    ],
    sim: "m4",
  },
  {
    id: "m5_coeficientes", n: 5, short: "Coeficientes", name: "M5 · Potenciómetros de coeficientes",
    icon: "◔", qty: 1,
    role: "Cuatro potenciómetros con buffer. Cada canal multiplica su entrada por un coeficiente a (0 ≤ a ≤ 1), o, " +
      "con la entrada unida a REF ±15 V, da una tensión constante: la gravedad −9.8 V o la velocidad −7.07 V. Es la fila " +
      "de potenciómetros de la EAI TR-48 (Fig. 4).",
    paper: "Fig. 4 («Potentiometers, i.e. coefficients») y pág. 15: «a potentiometer that has +9.8 volts across it».",
    equations: ["COUT = a · CIN", "Constante: CIN = −15 V (REF) → COUT = −15·a"],
    build: [SOLDER_ORDER, "Los potenciómetros Alps RK09K van de pie, con el eje hacia afuera, para usarlos como panel."],
    test: [
      "Une CIN1 con REF −15. Gira RV1 hasta que COUT1 marque −9.80 V con un voltímetro de 4 dígitos.",
      "Carga COUT1 con 1 kΩ: la lectura no debe cambiar (para eso está el buffer).",
    ],
    sim: "m5",
  },
  {
    id: "m6_filtro_salida", n: 6, short: "Filtro de salida", name: "M6 · Filtro de salida al osciloscopio",
    icon: "〰", qty: 1,
    role: "Dos filtros RC paso bajo (10 kΩ / 100 nF, fc = 159 Hz) con salida BNC para los canales X e Y del " +
      "osciloscopio en modo X-Y. El artículo los añadió porque el ruido de alta frecuencia ensuciaba las trazas.",
    paper: "Pág. 13 («A low-pass RC filter was added to the output…») y pág. 15 («10k Ohm resistor and a 0.1uF capacitor»).",
    equations: ["fc = 1/(2π R C) = 1/(2π · 10 kΩ · 100 nF) ≈ 159 Hz"],
    build: [SOLDER_ORDER, "Los BNC asoman por el borde de la placa para atornillarlos a la caja."],
    test: ["Inyecta un seno de 1 kHz y 1 V: a la salida mide unos 0.16 V. Un seno de 10 Hz pasa casi entero."],
    sim: "m6",
  },
  {
    id: "m7_multiplicador", n: 7, short: "Multiplicador", name: "M7 · Multiplicador AD633",
    icon: "×", qty: 2,
    role: "Multiplicador analógico de cuatro cuadrantes. No está en la placa del artículo, pero es el elemento que " +
      "añade para resolver Lorenz (Fig. 18): los términos no lineales x·z y x·y.",
    paper: "Fig. 18 (dos AD633 «Multipliers»).",
    equations: ["W = (X1 − X2)(Y1 − Y2)/10 V + Z", "Con X2 = Y2 = Z = GND: W = X1·Y1/10.  Entrar por X2 invierte el signo."],
    build: [SOLDER_ORDER, "Las entradas X2, Y2 y Z que no uses llevan un puente a GND: si quedan flotando, suman ruido a la salida."],
    test: ["X2 = Y2 = Z = GND.  X1 = +5 V e Y1 = +4 V → W = +2.00 V.  X1 = −5 V → W = −2.00 V."],
    sim: "m7",
  },
];

// Programas: qué módulos hacen falta y cómo se cablean (el "programa" del patch panel)
export const PROGRAMS = [
  {
    id: "prog_caida_libre", name: "Caída libre (tiro parabólico)", icon: "⤴",
    paper: "Figs. 11–17. Masa con v0 = 10 m/s a 45° desde 2 m de altura. Escala: 1 V = 1 m, en tiempo real.",
    equations: ["dvy/dt = −g,   dy/dt = vy,   dx/dt = vx", "y(t) = −4.9 t² + 7.071 t + 2,   x(t) = 7.071 t   (Ec. 15–16)"],
    needs: { m1_fuente: 1, m2_condicion_inicial: 2, m3_integrador: 3, m5_coeficientes: 1, m6_filtro_salida: 1 },
    nodes: [
      { id: "ic1", label: "M2 #1\n+7.07 V", x: 270, y: 30 },
      { id: "ic2", label: "M2 #2\n−2.00 V", x: 500, y: 30 },
      { id: "g", label: "M5 · CH1\n−9.8 V (g)", x: 30, y: 150 },
      { id: "i1", label: "M3 #1  ∫\n→ −vy", x: 270, y: 150 },
      { id: "i2", label: "M3 #2  ∫\n→ y", x: 500, y: 150 },
      { id: "vx", label: "M5 · CH2\n−7.07 V (vx)", x: 30, y: 280 },
      { id: "i3", label: "M3 #3  ∫\n→ x", x: 270, y: 280 },
      { id: "flt", label: "M6 filtro\nX / Y → osciloscopio", x: 730, y: 215 },
    ],
    edges: [
      ["g", "i1", "X1 (1 MΩ)"], ["i1", "i2", "X1 (1 MΩ)"], ["vx", "i3", "X1 (1 MΩ)"],
      ["ic1", "i1", "COND. INICIAL"], ["ic2", "i2", "COND. INICIAL"],
      ["i2", "flt", "Y_IN"], ["i3", "flt", "X_IN", 10],
    ],
    wiring: [
      "Bus: M1 → todos los módulos (cable plano de 4 hilos).",
      "M5: CIN1 ← REF −15 V; ajusta RV1 a COUT1 = −9.80 V.  CIN2 ← REF −15 V; RV2 a COUT2 = −7.07 V.",
      "M3 #1 (velocidad Y): ENTRADA X1 ← M5 COUT1.  COND. INICIAL ← M2 #1 = +7.07 V (el integrador carga −7.07 V = −vy0).",
      "M3 #2 (posición Y): ENTRADA X1 ← SALIDA de M3 #1.  COND. INICIAL ← M2 #2 = −2.00 V (carga +2 V = y0).",
      "M3 #3 (posición X): ENTRADA X1 ← M5 COUT2.  COND. INICIAL ← GND (x0 = 0).",
      "M6: X_IN ← SALIDA de M3 #3; Y_IN ← SALIDA de M3 #2. BNC X/Y → osciloscopio en modo X-Y, 2 V/div.",
      "Todos los integradores con SW1 en ×1 (C1 = 1 µF). M1 en IC, ajusta, y pasa a OPERAR: se dibuja la parábola.",
    ],
    note: "El artículo usa además un inversor (M4) para corregir el signo. Aquí se eligió el signo de las constantes " +
      "para que la salida ya salga con la polaridad correcta, y así sobra un módulo.",
  },
  {
    id: "prog_lorenz", name: "Atractor de Lorenz (caos)", icon: "∞",
    paper: "Fig. 18. Variables escaladas X = x/10, Y = y/10, Z = z/10 para no pasar de ±13 V.",
    equations: [
      "dx/dt = 10(y − x),   dy/dt = 28x − y − xz,   dz/dt = −(8/3) z + xy   (Ec. 19)",
      "Escalado: dX/dt = 10(Y − X),  dY/dt = 28X − Y − 10XZ,  dZ/dt = −(8/3)Z + 10XY",
      "R = 1/(10⁻⁶ · coeficiente)  (Ec. 20) → 100k, 35.7k, 1M, 10k, 374k",
    ],
    needs: { m1_fuente: 1, m2_condicion_inicial: 1, m3_integrador: 3, m4_sumador: 1, m7_multiplicador: 2, m6_filtro_salida: 1 },
    nodes: [
      { id: "i1", label: "M3 #1  ∫\n→ −X", x: 40, y: 80 },
      { id: "i2", label: "M3 #2  ∫\n→ Y", x: 370, y: 80 },
      { id: "i3", label: "M3 #3  ∫\n→ −Z", x: 680, y: 80 },
      { id: "m2", label: "M7 #2\nW2 = XY/10", x: 510, y: 215 },
      { id: "m1", label: "M7 #1\nW1 = XZ/10", x: 370, y: 330 },
      { id: "inv", label: "M4 inversor\n→ Z", x: 680, y: 330 },
      { id: "flt", label: "M6 → osciloscopio\nX vs Z", x: 40, y: 440 },
    ],
    edges: [
      ["i1", "i1", "−X → 100k ext. (SUMIN)"], ["i2", "i2", "Y → 1M (X1)"], ["i3", "i3", "−Z → 374k ext. (SUMIN)"],
      ["i2", "i1", "Y → 100k (X10)", 14], ["i1", "i2", "−X → 35.7k ext. (SUMIN)", 14],
      ["m1", "i2", "W1 → 10k (X100A)", 0, "L"], ["m2", "i3", "W2 → 10k (X100A)"],
      ["i3", "inv", "−Z → 10k (X1A)", 0, "R"], ["inv", "m1", "Z → Y1"], ["i1", "m1", "−X → X2", -12],
      ["i1", "m2", "−X → X2", -16], ["i2", "m2", "Y → Y1"], ["i1", "flt", "X_IN", 0, "R"], ["inv", "flt", "Y_IN", -30],
    ],
    wiring: [
      "M3 #1 (−X): ENTRADA X10 (100 kΩ) ← Y (salida M3 #2).  SUMIN ← resistencia externa de 100 kΩ desde su propia SALIDA.",
      "M3 #2 (Y): SUMIN ← 35.7 kΩ externa desde −X.  X1 (1 MΩ) ← su propia SALIDA (Y).  X100A (10 kΩ) ← W1 (M7 #1).",
      "M3 #3 (−Z): SUMIN ← 374 kΩ externa desde su propia SALIDA.  X100A (10 kΩ) ← W2 (M7 #2).",
      "M4: X1A (10 kΩ) ← −Z; su SALIDA es Z.",
      "M7 #1: X1 ← GND, X2 ← −X (así X1 − X2 = +X), Y1 ← Z, Y2 ← GND, Z ← GND.  Salida W1 = XZ/10.",
      "M7 #2: X1 ← GND, X2 ← −X, Y1 ← Y, Y2 ← GND, Z ← GND.  Salida W2 = XY/10.",
      "Condiciones iniciales: un M2 a +0.1 V conectado a las tres COND. INICIAL (los integradores cargan −0.1 V).",
      "Osciloscopio X-Y: X ← −X (M3 #1) y Y ← Z (M4), a 1 V/div: aparecen las «alas de mariposa».",
    ],
    note: "Las resistencias del artículo (Fig. 18) cuadran exactamente con este escalado y con el factor 1/10 del " +
      "AD633: 10 kΩ × (XZ/10) da un coeficiente de 100 × XZ/10 = 10·XZ.",
  },
];
