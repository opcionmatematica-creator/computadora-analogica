// Práctica 5 — Taller IV: Electrónica Análoga (UNAL Medellín, 2026-II): aplicaciones de los transistores.
// Contenido: guía de cada punto con teoría, respuestas, cálculos, esquemático KiCad, simulación ngspice,
// montaje en protoboard, tabla de mediciones (se guarda en este equipo) y rúbrica.

export const P5_DOC = "../docs/Practica_5_Taller_IV_Electronica_Analoga.pdf";

export const P5 = [
  {
    id: "p5_1_astable", n: 1, peso: 20, icon: "⎍", short: "Oscilador astable",
    name: "Punto 1 · Oscilador (multivibrador astable) con transistores",
    enunciado: "Con transistores, capacitores, resistencias y fuentes DC, montar un circuito que dé una señal oscilante de frecuencia y amplitud estables a la que se le pueda variar el período (Figura 1). Explicar su funcionamiento y hallar la máxima frecuencia que se puede lograr.",
    sims: ["p5_1_ondas", "p5_1_periodo", "p5_1_fmax"],
    rubrica: ["Circuito astable con transistores, capacitores y resistencias montado", "Explicación de la carga y descarga de los capacitores",
      "Explicación de la conmutación de los transistores", "Variación del período (RV1/RV2)", "Frecuencia y amplitud medidas en el osciloscopio",
      "Frecuencia máxima hallada y justificada"],
    tabla: { cols: ["Posición de RV1 = RV2", "RB total (kΩ)", "f medida (Hz)", "Amplitud colector (V)", "f teórica (Hz)"],
      rows: [["0 (Figura 1)", "10", "", "", "7.2"], ["mitad", "35", "", "", "2.1"], ["máximo", "60", "", "", "1.2"]] },
    body: R => `
      <h3>Cómo funciona</h3>
      <ol class="steps">
        <li>Los dos transistores se turnan: cuando uno está <b>saturado</b> (LED encendido), el otro está <b>cortado</b>.</li>
        <li>Cuando Q5 se satura, su colector cae de golpe unos 3.3 V (5 V menos la caída del LED). El condensador C5 no puede cambiar su tensión al instante, así que ese salto pasa entero a la base de Q6, que queda en unos <b>−3 V</b>: Q6 se corta.</li>
        <li>C5 se carga por R9 (+ RV1) hacia +5 V. Cuando la base de Q6 llega a ~0.65 V, Q6 conduce, su colector cae y, por C6, corta a Q5. El ciclo se repite.</li>
        <li>Cada semiperíodo dura t = R<sub>B</sub>·C·ln((V<sub>cc</sub> + ΔV)/(V<sub>cc</sub> − V<sub>BE</sub>)) ≈ 0.693·R<sub>B</sub>·C si ΔV ≈ V<sub>cc</sub>. Con los LED, ΔV ≈ 3.3 V y el período sale algo más corto.</li>
        <li><b>Variar el período:</b> RV1 y RV2 (50 kΩ, en serie con R9 y R11) cambian R<sub>B</sub>; con un potenciómetro doble se mantiene el ciclo de trabajo al 50 %.</li>
      </ol>
      <h3>Resultados de la simulación</h3>
      <table class="tbl"><tr><td>Frecuencia con los valores de la Figura 1</td><td><b>${R.astable_f_fig1.toFixed(2)} Hz</b> (fórmula 0.72/RC: ${R.astable_f_teo.toFixed(2)} Hz)</td></tr>
      <tr><td>Rango con RV de 0 a 50 kΩ</td><td><b>${R.astable_rango_f[0].toFixed(2)} – ${R.astable_rango_f[1].toFixed(2)} Hz</b></td></tr></table>
      <h3>Frecuencia máxima</h3>
      <p>La fórmula dice que f crece sin límite al bajar R<sub>B</sub> o C, pero hay tres límites reales:</p>
      <ol class="steps">
        <li><b>Saturación:</b> para que el transistor se sature, R<sub>B</sub> &lt; β·R<sub>C</sub>. Y para que el colector se recupere (el condensador se recarga por R<sub>C</sub> en ~5·R<sub>C</sub>·C) dentro de un semiperíodo (0.69·R<sub>B</sub>·C), hace falta R<sub>B</sub> ≳ 7·R<sub>C</sub>. Con R<sub>C</sub> = 1 kΩ, R<sub>B</sub> no debe bajar de unos 7–10 kΩ: con R<sub>B</sub> fija, la frecuencia solo sube bajando C.</li>
        <li><b>Velocidad del transistor:</b> el 2N3904 tarda ~200 ns en salir de saturación (tiempo de almacenamiento) y tiene capacidades de unión de unos 4–8 pF. Barriendo C en ngspice (R<sub>B</sub> = 10 kΩ):
          <table class="tbl small">${R.astable_barrido_C.map(r => `<tr><td>C = ${fmtC(r.C)}</td><td>${r.f_sim ? r.f_sim.toFixed(r.f_sim < 100 ? 2 : 0) + " Hz" : "<b>no oscila</b>"}</td><td>teórica ${r.f_teo.toFixed(0)} Hz</td></tr>`).join("")}</table>
          Sigue oscilando a ~${(R.astable_barrido_C.filter(r => r.f_sim).slice(-1)[0].f_sim / 1000).toFixed(0)} kHz con 220 pF y deja de hacerlo con 47 pF: ahí las capacidades del propio transistor son comparables a C. <b>La frecuencia máxima práctica de este circuito está en el orden de unos cientos de kHz</b> (en la protoboard algo menos, por las capacidades parásitas de los cables).</li>
        <li><b>Con los LED:</b> por encima de ~50 Hz el ojo ya no ve el parpadeo (persistencia de la visión): hay que medir con el osciloscopio.</li>
      </ol>`,
  },
  {
    id: "p5_2_sensor_buzzer", n: 2, peso: 20, icon: "🔔", short: "Sensor y buzzer",
    name: "Punto 2 · Circuito con sensor y buzzer",
    enunciado: "Montar la Figura 2 en simulación y en la protoboard: propósito, etapa 1 (antes de los 200 Ω), etapa 2, efecto de R3 frente a R4, rango de voltaje del sensor que activa la etapa 2, y voltajes, corrientes y potencias críticas.",
    sims: ["p5_2_umbral"],
    rubrica: ["Simulación y montaje del circuito", "Propósito del circuito", "Etapa 1: comparación del sensor con la referencia del divisor",
      "Etapa 2: PNP en conmutación que activa el buzzer, función del diodo", "Efecto de R3 frente a R4 y rango de voltaje del sensor",
      "Tabla de voltajes, corrientes y potencias críticas"],
    tabla: { cols: ["V sensor (V)", "V base U1 (V)", "V emisores (V)", "V colector U2 (V)", "I buzzer (mA)", "¿Suena?"],
      rows: [["0", "", "", "", "", ""], ["2.0", "", "", "", "", ""], ["2.5", "", "", "", "", ""], ["3.0", "", "", "", "", ""], ["5.0", "", "", "", "", ""]] },
    body: R => {
      const th = R.buzzer_umbrales, k = Object.keys(th);
      const T = R.buzzer_tabla, cols = Object.keys(T["0.0 V"]);
      return `
      <h3>a. Propósito</h3><p>Es una <b>alarma por umbral</b>: el buzzer suena cuando la tensión del sensor (aquí, un potenciómetro de 0 a 5 V) supera unos 2.5 V. Cambiando el potenciómetro por un sensor resistivo (LDR, termistor) en divisor, sirve como alarma de luz o de temperatura.</p>
      <h3>b. Etapa 1 (antes de R7 = 200 Ω): comparador diferencial</h3>
      <p>U1 y U2 forman un <b>par diferencial</b> con la resistencia de cola común R5. R1 y R2 (2.2 kΩ cada una) fijan la base de U1 en V<sub>ref</sub> = 5·R1/(R1+R2) = <b>2.5 V</b>. Por R5 circulan ~1.8 mA, que se reparten entre los dos transistores según cuál tenga la base más alta: si el sensor está por debajo de 2.5 V, conduce U1 y U2 queda cortado (su colector a 5 V); si lo supera, la corriente pasa a U2 y su colector baja por la caída en R4.</p>
      <h3>c. Etapa 2 (después de R7): conmutador PNP</h3>
      <p>U3 (PNP) tiene el emisor a +5 V. Mientras el colector de U2 está a 5 V, U3 no tiene V<sub>EB</sub> y está cortado. Cuando el colector de U2 baja, circula corriente de base por R7 (que la limita) y U3 conduce, alimentando el buzzer. <b>D1 es un diodo de rueda libre</b>: la bobina del buzzer (L1) se opone a cortes bruscos de corriente; al apagarse U3 aparecería un pico de tensión inversa que podría romperlo, y el diodo le da camino a esa corriente.</p>
      <h3>d. R3 frente a R4 y rango del sensor (ngspice)</h3>
      <table class="tbl"><thead><tr><th>Caso</th><th>Empieza a sonar (10 %)</th><th>Suena del todo (90 %)</th><th>I máx buzzer</th></tr></thead>
      ${k.map(n => `<tr><td>${n}</td><td>${th[n]["V_10%"]?.toFixed(2)} V</td><td>${th[n]["V_90%"]?.toFixed(2)} V</td><td>${th[n].I_max_mA.toFixed(0)} mA</td></tr>`).join("")}</table>
      <ul class="steps">
        <li><b>R3 &lt; R4 (Figura 2):</b> U1 trabaja en zona activa. La etapa 2 cambia entre <b>${th[k[0]]["V_10%"].toFixed(2)} V y ${th[k[0]]["V_90%"].toFixed(2)} V</b>, centrada en la referencia de 2.5 V. Es el diseño correcto.</li>
        <li><b>R3 = R4 o R3 &gt; R4:</b> con una R3 grande, U1 se <b>satura</b> (su colector baja hasta el emisor), la tensión de emisores deja de seguir a V<sub>ref</sub> y el umbral baja a ~${th[k[1]]["V_10%"].toFixed(1)} V, con una transición más ancha. La alarma se dispara antes de lo previsto y de forma menos nítida.</li>
        <li>R4 fija cuánto baja el colector de U2: con 15 kΩ basta una corriente pequeña de U2 para llevar U3 a saturación (la etapa 2 tiene mucha ganancia).</li>
      </ul>
      <h3>e. Voltajes, corrientes y potencias críticas (ngspice, Figura 2)</h3>
      <div class="tbl"><table><thead><tr><th>Magnitud</th>${Object.keys(T).map(v => `<th>sensor ${v}</th>`).join("")}</tr></thead>
      ${cols.map(c => `<tr><td>${c}</td>${Object.keys(T).map(v => `<td>${fmt(T[v][c])}</td>`).join("")}</tr>`).join("")}</table></div>
      <div class="tip"><b>Lo crítico:</b> con un buzzer de 24 Ω, U3 lleva unos <b>${T["5.0 V"]["I_buzzer (mA)"].toFixed(0)} mA</b>, cerca del máximo del 2N3906 (200 mA), y en la zona de transición disipa ~${T["2.5 V"]["P_U3 (mW)"].toFixed(0)} mW (el máximo es 625 mW sin disipador). No dejes el sensor parado justo en el umbral, o usa un PNP más robusto (BD140) o un buzzer de más resistencia.</div>`;
    },
  },
  {
    id: "p5_3_fuente_corriente", n: 3, peso: 20, icon: "⇉", short: "Fuente de corriente",
    name: "Punto 3 · Fuente de corriente constante",
    enunciado: "Calcular la Figura 3 para que por Rload circulen 10 mA y 20 mA (dos circuitos). Medir la corriente y su estabilidad y comprobar la ley de Ohm: (1) con un LED como carga; (2) con Rload = 100, 220, 330, 470 y 680 Ω.",
    sims: ["p5_3_carga", "p5_3_vcc"],
    rubrica: ["Cálculo de R_sense para 10 mA y 20 mA", "Montaje de los 2 circuitos", "Cambio de brillo del LED",
      "Tabla de voltaje y corriente para cada Rload (100, 220, 330, 470 y 680 Ω)", "Verificación de la ley de Ohm y de la estabilidad de la corriente",
      "Explicación de la realimentación negativa"],
    tabla: { cols: ["Circuito", "Rload (Ω)", "I medida (mA)", "V Rload medido (V)", "V/I (Ω)"],
      rows: ["10 mA", "20 mA"].flatMap(c => ["LED", "100", "220", "330", "470", "680"].map(r => [c, r, "", "", ""])) },
    body: R => {
      const F = R.fuente_corriente;
      return `
      <h3>Cómo funciona (realimentación negativa)</h3>
      <p>Q1 deja pasar la corriente de la carga, y esa misma corriente pasa por R<sub>sense</sub>. La tensión en R<sub>sense</sub> polariza la base de Q2. Si la corriente intenta subir, sube V(R<sub>sense</sub>), Q2 conduce más y le roba a Q1 la corriente de base que le da R1, así que la corriente baja. El equilibrio llega cuando V(R<sub>sense</sub>) ≈ V<sub>BE</sub>(Q2) ≈ 0.65 V:</p>
      <div class="eq">I_load ≈ V_BE(Q2) / R_sense ≈ 0.65 V / R_sense    (independiente de Rload y de Vcc)</div>
      <h3>Cálculos (Vcc = 12 V)</h3>
      <table class="tbl"><thead><tr><th></th><th>10 mA</th><th>20 mA</th></tr></thead>
        <tr><td>R_sense = 0.65 V / I</td><td>65 Ω → <b>68 Ω</b> (valor comercial)</td><td>32.5 Ω → <b>33 Ω</b></td></tr>
        <tr><td>I teórica con el valor comercial</td><td>${F["10 mA"]["I_teorica (mA)"].toFixed(2)} mA</td><td>${F["20 mA"]["I_teorica (mA)"].toFixed(2)} mA</td></tr>
        <tr><td>Potencia en R_sense = 0.65 V · I</td><td>6.5 mW</td><td>13 mW</td></tr>
        <tr><td>R1 = (Vcc − V<sub>BE1</sub> − V<sub>BE2</sub>) / ~1 mA</td><td colspan="2">≈ 10.7 kΩ → <b>10 kΩ</b> (corriente de base de Q1 + colector de Q2). R2 = 1 kΩ protege la base de Q2.</td></tr>
        <tr><td>Rload máxima (compliancia) = (Vcc − 0.65 − V<sub>CEsat</sub>) / I</td><td>${F["10 mA"]["Rload_max (Ω)"].toFixed(0)} Ω</td><td>${F["20 mA"]["Rload_max (Ω)"].toFixed(0)} Ω</td></tr></table>
      <h3>Resultados de la simulación</h3>
      ${["10 mA", "20 mA"].map(c => `<h4>${c} (R_sense = ${F[c].Rsense} Ω)</h4><table class="tbl"><thead><tr><th>Rload</th><th>I (mA)</th><th>V Rload (V)</th><th>V/I (Ω)</th></tr></thead>
        <tr><td>LED rojo</td><td>${F[c].LED["I (mA)"].toFixed(2)}</td><td>${F[c].LED["V_LED (V)"].toFixed(2)}</td><td>—</td></tr>
        ${F[c].filas.map(f => `<tr><td>${f.Rload} Ω</td><td>${f["I (mA)"].toFixed(2)}</td><td>${f["V_Rload (V)"].toFixed(2)}</td><td>${f["V/I (Ω)"].toFixed(0)}</td></tr>`).join("")}</table>`).join("")}
      <ul class="steps">
        <li><b>LED:</b> la corriente es la misma que con una resistencia: el brillo <b>no depende</b> de la tensión del LED ni de la fuente. Con 20 mA el LED brilla más que con 10 mA (el brillo es aproximadamente proporcional a la corriente).</li>
        <li><b>Ley de Ohm:</b> V<sub>Rload</sub>/I reproduce el valor de Rload: se cumple, y la corriente es la que fija la fuente, no la carga.</li>
        <li><b>Límite:</b> con 20 mA y 680 Ω la carga pide 13.6 V, más de lo que da la fuente: Q1 se satura, la corriente cae a ${F["20 mA"].filas[4]["I (mA)"].toFixed(1)} mA y deja de ser constante. Por eso la compliancia es de ~${F["20 mA"]["Rload_max (Ω)"].toFixed(0)} Ω.</li>
      </ul>`;
    },
  },
  {
    id: "p5_4_puente_h", n: 4, peso: 20, icon: "⇄", short: "Puente H",
    name: "Punto 4 · Puente H para un motor DC",
    enunciado: "Diseñar e implementar un puente H para un motor DC, medir su corriente y anexar los cálculos. Medir la corriente máxima frenando el motor con la fuente sin limitación de corriente.",
    sims: ["p5_4_giro", "p5_4_prohibido"],
    rubrica: ["Diseño con todos los cálculos (IB1, IB5, IC4, VB5, R3)", "Montaje: giro del motor en ambos sentidos",
      "Sin activar los estados prohibidos", "Medición de la corriente del motor", "Medición de la corriente máxima (motor frenado)",
      "Comparación con la corriente de diseño"],
    tabla: { cols: ["Estado (IN_A, IN_B)", "Sentido", "I motor medida (mA)", "V motor (V)", "Observación"],
      rows: [["1, 0", "A", "", "", ""], ["0, 1", "B", "", "", ""], ["0, 0", "libre", "", "", ""], ["1, 0 frenado a mano", "—", "", "", "corriente máxima"]] },
    body: R => {
      const H = R.puente_h;
      return `
      <div class="tip">El enunciado remite al «Anexo: Teoría del Puente H», que no viene en el PDF de la práctica. Este es un <b>diseño de referencia propio</b> con la nomenclatura de la rúbrica (IB1, IB5, IC4, VB5, R3). Compáralo con el del anexo.</div>
      <h3>Funcionamiento</h3>
      <p>Cuatro transistores de potencia forman una «H» con el motor en el centro: <b>Q1 y Q2</b> (BD140, PNP) arriba y <b>Q3 y Q4</b> (BD139, NPN) abajo. El driver <b>Q5</b> (2N3904) enciende a la vez la diagonal <b>Q1–Q4</b>: su colector tira de la base de Q1 a través de R3, y su emisor alimenta la base de Q4. El driver <b>Q6</b> enciende la diagonal <b>Q2–Q3</b>. Las resistencias de 1 kΩ base-emisor apagan con seguridad los transistores sin excitación, y D1–D4 (1N4007) devuelven a la fuente la corriente de la bobina del motor al conmutar.</p>
      <table class="tbl"><thead><tr><th>IN_A</th><th>IN_B</th><th>Conducen</th><th>Motor</th></tr></thead>
        <tr><td>0</td><td>0</td><td>ninguno</td><td>libre (se detiene por inercia)</td></tr>
        <tr><td>1</td><td>0</td><td>Q1 + Q4</td><td>giro A (I de MA a MB)</td></tr>
        <tr><td>0</td><td>1</td><td>Q2 + Q3</td><td>giro B (I de MB a MA)</td></tr>
        <tr class="bad"><td>1</td><td>1</td><td>Q1, Q2, Q3, Q4</td><td><b>PROHIBIDO</b>: Q1–Q3 y Q2–Q4 cortocircuitan la fuente (${H["I_corto_prohibido (A)"].toFixed(1)} A en la simulación)</td></tr></table>
      <h3>Cálculos (V<sub>m</sub> = 9 V, motor de 0.5 A, β<sub>BD13x</sub> ≥ 25)</h3>
      <div class="eq">IC4 = I motor ≈ 0.5 A</div>
      <div class="eq">IB1 = IB4 = 2 · IC / β = 2 · 0.5 / 25 = 40 mA   (sobreexcitación ×2 para asegurar la saturación)</div>
      <div class="eq">IC5 = IB1 + V_EB1/R5 = 40 + 0.7 = 41 mA ;   IE5 = IB4</div>
      <div class="eq">IB5 = IC5 / β_forzada(10) = 4 mA</div>
      <div class="eq">VB5 = V_BE5 + V_BE4 = 0.8 + 0.85 ≈ 1.6 V</div>
      <div class="eq">R1 = (5 V − VB5) / IB5 = 3.4 / 4 mA = 850 Ω → 820 Ω</div>
      <div class="eq">R3 = (Vm − V_EB1 − V_CE5sat − V_BE4) / IC5 = (9 − 0.9 − 0.2 − 0.85) / 41 mA = 172 Ω → 180 Ω, P = IC5²·R3 = 0.3 W → ½ W</div>
      <h3>Comparación con ngspice</h3>
      <table class="tbl"><thead><tr><th>Magnitud</th><th>Diseño</th><th>ngspice</th></tr></thead>
        <tr><td>IB1</td><td>40 mA</td><td>${H["IB1 (mA)"].toFixed(1)} mA</td></tr>
        <tr><td>IB5</td><td>4 mA</td><td>${H["IB5 (mA)"].toFixed(2)} mA</td></tr>
        <tr><td>IC4 (motor)</td><td>~500 mA</td><td>${H["IC4 (mA)"].toFixed(0)} mA</td></tr>
        <tr><td>VB5</td><td>1.6 V</td><td>${H["VB5 (V)"].toFixed(2)} V</td></tr>
        <tr><td>I motor, giro B</td><td>−500 mA</td><td>${H["I_motor_B (mA)"].toFixed(0)} mA</td></tr></table>
      <h3>Medición de la corriente máxima</h3>
      <ol class="steps"><li>Multímetro en serie con el motor, en escala de 10 A (el borne de 10 A).</li>
        <li>Fuente <b>sin límite de corriente</b>, como pide la guía, solo durante esta medida. Ten la mano en el interruptor de la fuente.</li>
        <li>Con el motor girando (IN_A = 1), frénalo con la mano hasta detenerlo; lee la corriente justo antes de que se pare. Esa es la corriente de bloqueo ≈ V<sub>m</sub>/R<sub>bobinado</sub>.</li>
        <li>Si es mucho mayor que 0.5 A, recalcula IB1 e IB4 (y R3 y R1) para esa corriente: si no, los BD13x salen de saturación y se calientan.</li>
        <li><b>Nunca</b> pongas IN_A = IN_B = 1. Lo más seguro es manejar las entradas con un interruptor de tres posiciones, o con lógica que impida el 1-1.</li></ol>`;
    },
  },
];

const fmt = v => (typeof v === "number" ? (Math.abs(v) < 1e-3 ? "≈ 0" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : v);
const fmtC = c => c >= 1e-6 ? `${c * 1e6} µF` : c >= 1e-9 ? `${+(c * 1e9).toFixed(1)} nF` : `${+(c * 1e12).toFixed(0)} pF`;

export const P5_RUBRICA_PRACTICA = [
  ["Montaje limpio", "6.67 %", "Protoboard ordenada, cables cortos y bien ubicados, componentes fáciles de identificar, sin cruces innecesarios."],
  ["Código de colores del cableado", "6.67 %", "Rojo: alimentación. Negro y verde: tierra. Cualquier otro color: señal, puentes, etc. Debe respetarse en todo el montaje."],
  ["Uso de los equipos del laboratorio", "6.67 %", "Osciloscopio (escalas, acople, sondas), multímetro (función y rango adecuados, en serie o en paralelo según la medida) y fuente DC (voltaje y límite de corriente según la hoja de datos)."],
];

/** Tabla de mediciones editable (se guarda en este equipo y se exporta a CSV). */
export function measureTable(el, id, tabla, esc) {
  const key = "p5med:" + id;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
  el.innerHTML = `<div class="tbl"><table class="meas"><thead><tr>${tabla.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
    ${tabla.rows.map((r, i) => `<tr>${r.map((v, j) => v !== "" ? `<td>${esc(v)}</td>` : `<td><input data-k="${i}:${j}" value="${esc(saved[i + ":" + j] || "")}" placeholder="—"></td>`).join("")}</tr>`).join("")}
  </tbody></table></div><button class="btn ghost" data-csv>Descargar tabla (CSV)</button> <span class="muted small">Se guarda sola en este equipo.</span>`;
  el.querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
    saved[inp.dataset.k] = inp.value;
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch {}
  }));
  el.querySelector("[data-csv]").onclick = () => {
    const rows = [tabla.cols, ...tabla.rows.map((r, i) => r.map((v, j) => v !== "" ? v : (saved[i + ":" + j] || "")))];
    const blob = new Blob(["﻿" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `mediciones_${id}.csv`; a.click();
  };
}
