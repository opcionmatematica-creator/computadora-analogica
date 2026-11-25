// "Sistema completo": todos los módulos con sus conectores reales (los de KiCad) y el
// cableado pin a pin de cada programa, más el esquemático completo de la máquina.
import { MODULES } from "./data.js";

// Conectores de cada módulo (nombres de pin = serigrafía de la PCB). o = salida.
export const PINS = {
  m1_fuente: { name: "M1 Fuente", out: ["BUS +15", "BUS GND", "BUS −15", "BUS OP"], in: ["Fuente lab ±15 V"] },
  m2_condicion_inicial: { name: "M2 Cond. inicial", in: [], out: ["IC_OUT"] },
  m3_integrador: { name: "M3 Integrador", in: ["X1 (1M)", "X10 (100k)", "X100A (10k)", "X100B (10k)", "X1000 (1k)", "SUMIN", "IC_IN"], out: ["OUT"] },
  m4_sumador: { name: "M4 Sumador", in: ["X10 (1k)", "X1A (10k)", "X1B (10k)", "X01A (100k)", "X01B (100k)", "SUMIN"], out: ["OUT"] },
  m5_coeficientes: { name: "M5 Coeficientes", in: ["CIN1", "CIN2", "CIN3", "CIN4"], out: ["COUT1", "COUT2", "COUT3", "COUT4", "REF +15", "REF −15"] },
  m6_filtro_salida: { name: "M6 Filtro", in: ["X_IN", "Y_IN"], out: ["BNC X", "BNC Y"] },
  m7_multiplicador: { name: "M7 Multiplicador", in: ["X1", "X2", "Y1", "Y2", "Z"], out: ["W"] },
};

// Cableado de cada programa.  Instancia = "m3#1".  [desde, pin] -> [hasta, pin], etiqueta opcional
// (p. ej. una resistencia externa).  "GND" como origen = puente a masa.
export const SYSTEMS = {
  prog_caida_libre: {
    name: "Caída libre",
    cols: [["m1"], ["m5", "m2#1", "m2#2"], ["m3#1", "m3#3"], ["m3#2"], ["m6"], ["osc"]],
    wires: [
      ["m5", "REF −15", "m5", "CIN1", "puente"], ["m5", "REF −15", "m5", "CIN2", "puente"],
      ["m5", "COUT1", "m3#1", "X1 (1M)", "−9.8 V (g)"], ["m2#1", "IC_OUT", "m3#1", "IC_IN", "+7.07 V"],
      ["m3#1", "OUT", "m3#2", "X1 (1M)", "−vy"], ["m2#2", "IC_OUT", "m3#2", "IC_IN", "−2.00 V"],
      ["m5", "COUT2", "m3#3", "X1 (1M)", "−7.07 V (vx)"], ["GND", "", "m3#3", "IC_IN", "x0 = 0"],
      ["m3#3", "OUT", "m6", "X_IN", "x"], ["m3#2", "OUT", "m6", "Y_IN", "y"],
      ["m6", "BNC X", "osc", "CH1 (X)"], ["m6", "BNC Y", "osc", "CH2 (Y)"],
    ],
  },
  prog_lorenz: {
    name: "Atractor de Lorenz",
    cols: [["m1", "m2"], ["m3#1", "m3#3"], ["m7#1", "m7#2", "m4"], ["m3#2"], ["m6"], ["osc"]],
    wires: [
      ["m2", "IC_OUT", "m3#1", "IC_IN", "+0.1 V"], ["m2", "IC_OUT", "m3#2", "IC_IN"], ["m2", "IC_OUT", "m3#3", "IC_IN"],
      ["m3#2", "OUT", "m3#1", "X10 (100k)", "Y"], ["m3#1", "OUT", "m3#1", "SUMIN", "100k ext."],
      ["m3#1", "OUT", "m3#2", "SUMIN", "35.7k ext."], ["m3#2", "OUT", "m3#2", "X1 (1M)", "Y"],
      ["m7#1", "W", "m3#2", "X100A (10k)", "XZ/10"],
      ["m3#3", "OUT", "m3#3", "SUMIN", "374k ext."], ["m7#2", "W", "m3#3", "X100A (10k)", "XY/10"],
      ["m3#3", "OUT", "m4", "X1A (10k)", "−Z"],
      ["m3#1", "OUT", "m7#1", "X2", "−X"], ["m4", "OUT", "m7#1", "Y1", "Z"],
      ["GND", "", "m7#1", "X1"], ["GND", "", "m7#1", "Y2"], ["GND", "", "m7#1", "Z"],
      ["m3#1", "OUT", "m7#2", "X2", "−X"], ["m3#2", "OUT", "m7#2", "Y1", "Y"],
      ["GND", "", "m7#2", "X1"], ["GND", "", "m7#2", "Y2"], ["GND", "", "m7#2", "Z"],
      ["m3#1", "OUT", "m6", "X_IN", "−X"], ["m4", "OUT", "m6", "Y_IN", "Z"],
      ["m6", "BNC X", "osc", "CH1 (X)"], ["m6", "BNC Y", "osc", "CH2 (Y)"],
    ],
  },
};

const ID = { m1: "m1_fuente", m2: "m2_condicion_inicial", m3: "m3_integrador", m4: "m4_sumador",
  m5: "m5_coeficientes", m6: "m6_filtro_salida", m7: "m7_multiplicador" };
const COLORS = ["#39d98a", "#f5b942", "#5aa9ff", "#ff6b8a", "#c38bff", "#4fd6d6", "#ff9b54", "#b5e655"];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function boxOf(inst) {
  if (inst === "osc") return { title: "Osciloscopio X-Y", in: ["CH1 (X)", "CH2 (Y)"], out: [], mod: null };
  const key = inst.split("#")[0], p = PINS[ID[key]];
  const n = inst.includes("#") ? " #" + inst.split("#")[1] : "";
  return { title: p.name + n, in: p.in, out: p.out, mod: ID[key], bus: key !== "m1" && key !== "m6" };
}

/** SVG del sistema para un programa. */
export function systemSvg(progId) {
  const S = SYSTEMS[progId];
  const BW = 170, PH = 19, HEAD = 40, COLW = 300, GAPY = 46, X0 = 30, Y0 = 70;
  const boxes = {};
  let H = 0;
  S.cols.forEach((col, ci) => {
    let y = Y0;
    for (const inst of col) {
      const b = boxOf(inst), rows = Math.max(b.in.length, b.out.length, 1);
      b.x = X0 + ci * COLW; b.y = y; b.h = HEAD + rows * PH + 10; b.inst = inst;
      boxes[inst] = b; y += b.h + GAPY;
    }
    H = Math.max(H, y);
  });
  const W = X0 * 2 + (S.cols.length - 1) * COLW + BW;
  const pinPos = (inst, pin, side) => {
    const b = boxes[inst];
    const list = side === "out" ? b.out : b.in;
    const i = list.indexOf(pin);
    if (i < 0) return null;
    return [side === "out" ? b.x + BW : b.x, b.y + HEAD + i * PH + PH / 2];
  };
  const used = new Set(S.wires.flatMap(w => [`${w[0]}|${w[1]}`, `${w[2]}|${w[3]}`]));
  let s = `<svg viewBox="0 0 ${W} ${H + 10}" class="system" xmlns="http://www.w3.org/2000/svg">`;
  // bus de alimentación: riel común desde M1
  const busY = 34;
  s += `<line class="bus" x1="${X0}" y1="${busY}" x2="${W - X0}" y2="${busY}"/><text class="bus-t" x="${X0 + 4}" y="${busY - 8}">BUS 4 hilos desde M1: +15 V · GND · −15 V · OP (cable plano a cada módulo)</text>`;
  for (const b of Object.values(boxes)) if (b.bus || b.mod === "m1_fuente") s += `<line class="bus-drop" x1="${b.x + BW / 2}" y1="${busY}" x2="${b.x + BW / 2}" y2="${b.y}"/>`;
  // cables
  let wires = "", labels = "", k = 0;
  const netColor = {};
  for (const [fi, fp, ti, tp, lab] of S.wires) {
    const dst = pinPos(ti, tp, "in");
    if (!dst) { console.warn("pin no encontrado", ti, tp); continue; }
    if (fi === "GND") {
      const [x, y] = dst;
      wires += `<path class="gnd" d="M${x},${y} h-14 m0,-6 v12 m-4,-9 v6"/>`;
      labels += `<text class="wl gl" x="${x - 22}" y="${y + 4}" text-anchor="end">${esc(lab || "GND")}</text>`;
      continue;
    }
    const src = pinPos(fi, fp, "out");
    if (!src) { console.warn("pin no encontrado", fi, fp); continue; }
    const key = fi + "|" + fp;
    const col = netColor[key] || (netColor[key] = COLORS[k++ % COLORS.length]);
    const [x1, y1] = src, [x2, y2] = dst;
    let d;
    if (x2 <= x1) {   // hacia atrás o al mismo módulo: rodea por abajo/arriba
      const b = boxes[fi], loopY = Math.max(b.y + b.h, boxes[ti].y + boxes[ti].h) + 14 + (k % 4) * 6;
      d = `M${x1},${y1} C${x1 + 40},${y1} ${x1 + 40},${loopY} ${x1},${loopY} L${x2},${loopY} C${x2 - 40},${loopY} ${x2 - 40},${y2} ${x2},${y2}`;
    } else {
      const dx = Math.max(40, (x2 - x1) * 0.45);
      d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    wires += `<path class="w" stroke="${col}" d="${d}" data-net="${esc(key)}"><title>${esc(`${fi} ${fp} → ${ti} ${tp}${lab ? " · " + lab : ""}`)}</title></path>`;
    if (lab) labels += `<text class="wl" x="${x2 - 8}" y="${y2 - 5}" text-anchor="end" fill="${col}">${esc(lab)}</text>`;
  }
  // cajas
  for (const b of Object.values(boxes)) {
    const href = b.mod ? `#/m/${b.mod}` : null;
    s += `<g class="mod">${href ? `<a href="${href}">` : ""}<rect x="${b.x}" y="${b.y}" width="${BW}" height="${b.h}" rx="9"/>
      <text class="mt" x="${b.x + BW / 2}" y="${b.y + 22}">${esc(b.title)}</text>${href ? "</a>" : ""}`;
    b.in.forEach((p, i) => {
      const y = b.y + HEAD + i * PH + PH / 2, on = used.has(`${b.inst}|${p}`);
      s += `<circle class="pin${on ? " on" : ""}" cx="${b.x}" cy="${y}" r="3.5"/><text class="pn${on ? " on" : ""}" x="${b.x + 8}" y="${y + 4}">${esc(p)}</text>`;
    });
    b.out.forEach((p, i) => {
      const y = b.y + HEAD + i * PH + PH / 2, on = used.has(`${b.inst}|${p}`);
      s += `<circle class="pin${on ? " on" : ""}" cx="${b.x + BW}" cy="${y}" r="3.5"/><text class="pn${on ? " on" : ""}" x="${b.x + BW - 8}" y="${y + 4}" text-anchor="end">${esc(p)}</text>`;
    });
    s += `</g>`;
  }
  return s + wires + labels + "</svg>";
}

/** Lista de conexiones en texto (para imprimir y cablear marcando). */
export function wireList(progId) {
  return SYSTEMS[progId].wires.map(([fi, fp, ti, tp, lab]) => {
    const name = i => i === "GND" ? "GND" : i === "osc" ? "Osciloscopio" : boxOf(i).title;
    return `${name(fi)}${fp ? " · " + fp : ""}  →  ${name(ti)} · ${tp}${lab ? "   (" + lab + ")" : ""}`;
  });
}

export { MODULES };
