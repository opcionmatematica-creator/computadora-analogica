// "Sistema completo → Protoboards": todas las protoboards de un programa (las capturas de los montajes paso a
// paso de web/montaje/, ver tools/capturar_protoboards.mjs) y los cables que las unen, borne a borne.
// Los cables van por canales entre filas y columnas, sin pasar por encima de ninguna protoboard.
import { SYSTEMS } from "./sistema.js";

const ID = { m1: "m1_fuente", m2: "m2_condicion_inicial", m3: "m3_integrador", m4: "m4_sumador",
  m5: "m5_coeficientes", m6: "m6_filtro_salida", m7: "m7_multiplicador" };
const NAME = { m1: "M1 Fuente", m2: "M2 Cond. inicial", m3: "M3 Integrador", m4: "M4 Sumador",
  m5: "M5 Coeficientes", m6: "M6 Filtro", m7: "M7 Multiplicador" };

// Disposición de las protoboards de cada programa (filas de la imagen), en el orden de la señal.
export const GRIDS = {
  prog_caida_libre: [["m1", "m5", "m2#1", "m2#2"], ["m3#1", "m3#2", "m3#3", "m6", "osc"]],
  prog_lorenz: [["m1", "m2", "m6", "osc"], ["m3#1", "m3#2", "m3#3"], ["m7#1", "m7#2", "m4"]],
};

// Pin del sistema (nombre de sistema.js) -> borne del montaje: [lado, columna]. s = salida (arriba), e = entrada
// (abajo), r = riel (lado derecho de la protoboard).
const TERM = {
  m1: { "BUS OP": ["s", 10] },
  m2: { IC_OUT: ["s", 22] },
  m3: { "X1 (1M)": ["e", 3], "X10 (100k)": ["e", 6], "X100A (10k)": ["e", 9], "X100B (10k)": ["e", 12], "X1000 (1k)": ["e", 15],
    SUMIN: ["e", 18], OP: ["e", 21], OUT: ["s", 28], IC_IN: ["s", 34] },
  m4: { "X10 (1k)": ["e", 3], "X1A (10k)": ["e", 6], "X1B (10k)": ["e", 9], "X01A (100k)": ["e", 12], "X01B (100k)": ["e", 15],
    SUMIN: ["e", 18], OUT: ["s", 34] },
  m5: { CIN1: ["s", 4], COUT1: ["s", 16], COUT2: ["s", 22], CIN2: ["s", 28], CIN3: ["s", 34], COUT3: ["s", 46], COUT4: ["s", 52],
    CIN4: ["s", 58], "REF −15": ["r", "B-"], "REF +15": ["r", "T+"] },
  m6: { X_IN: ["s", 4], "BNC X": ["s", 10], Y_IN: ["s", 16], "BNC Y": ["s", 22] },
  m7: { X1: ["e", 6], X2: ["e", 9], Y1: ["e", 18], Y2: ["e", 22], W: ["s", 16], Z: ["s", 22] },
  osc: { "CH1 (X)": ["s", 0], "CH2 (Y)": ["s", 1] },
};
const OSC = { vb: [0, 0, 420, 300] };
const COLORS = ["#d7263d", "#2f6fdc", "#2e9b4f", "#f08a24", "#8e44c9", "#0e9aa7", "#b8860b", "#e0457b", "#5a6b7d", "#7b4a24", "#1f8f6a"];
const BUS = [["+15 V", "#d7263d", "T+"], ["GND", "#202124", "T-"], ["−15 V", "#2f6fdc", "B-"]];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const key = i => i.split("#")[0];
const cxCol = c => 110 + 24 + (c - 1) * 18;          // misma geometría que la plantilla de montaje

/** Lista de cables del programa, con la línea OP de M1 a cada integrador añadida. */
function wiresOf(prog) {
  const W = SYSTEMS[prog].wires.map(w => [...w]);
  for (const inst of GRIDS[prog].flat()) if (key(inst) === "m3") W.push(["m1", "BUS OP", inst, "OP", "OP"]);
  return W;
}

/** SVG con todas las protoboards de un programa y su cableado. geo = web/assets/sistema/proto/geometria.json */
export function protoSystemSvg(prog, geo, base = "assets/sistema/proto") {
  const grid = GRIDS[prog], wires = wiresOf(prog);
  const vbOf = inst => inst === "osc" ? OSC.vb : geo[ID[key(inst)]].vb;
  const pos = {};
  grid.forEach((row, r) => row.forEach((inst, c) => (pos[inst] = { r, c })));
  const nR = grid.length, nC = Math.max(...grid.map(r => r.length));
  const colW = Array.from({ length: nC }, (_, c) => Math.max(...grid.map(row => row[c] ? vbOf(row[c])[2] : 0)));
  const rowH = grid.map(row => Math.max(...row.map(i => vbOf(i)[3])));

  // ---- 1.ª pasada: qué canales usa cada cable y cuántas pistas necesita cada canal
  const ends = (inst, pin) => {
    const t = (TERM[key(inst)] || {})[pin];
    if (!t) { console.warn("borne desconocido", inst, pin); return null; }
    const { r, c } = pos[inst];
    if (t[0] === "s") return { inst, pin, t, ch: r };          // canal horizontal de encima
    if (t[0] === "e") return { inst, pin, t, ch: r + 1 };      // canal horizontal de debajo
    return { inst, pin, t, gut: c + 1 };                       // riel: canal vertical a la derecha
  };
  const chN = Array(nR + 1).fill(0), gutN = Array(nC + 1).fill(0);
  const chTrack = new Map(), gutTrack = new Map();             // (red, canal) -> pista
  const takeCh = (net, k) => { const id = net + "@" + k; if (!chTrack.has(id)) chTrack.set(id, chN[k]++); return chTrack.get(id); };
  const takeGut = (net, j) => { const id = net + "@" + j; if (!gutTrack.has(id)) gutTrack.set(id, gutN[j]++); return gutTrack.get(id); };
  const routes = [];
  const netCol = {};
  let nc = 0;
  for (const [fi, fp, ti, tp, lab] of wires) {
    const B = ends(ti, tp); if (!B) continue;
    if (fi === "GND") { routes.push({ gnd: true, B, lab }); continue; }
    const A = ends(fi, fp); if (!A) continue;
    const net = fi + "|" + fp;
    netCol[net] ??= fp === "BUS OP" ? "#f08a24" : COLORS[nc++ % COLORS.length];
    const R = { net, A, B, lab, fi, fp, ti, tp };
    R.tb = takeCh(net, B.ch);
    if (A.gut !== undefined) R.ga = takeGut(net, A.gut);
    else {
      R.ta = takeCh(net, A.ch);
      if (A.ch !== B.ch) {
        const ca = pos[fi].c, cb = pos[ti].c;
        R.g = cb < ca ? ca : ca + 1;
        R.tg = takeGut(net, R.g);
      }
    }
    routes.push(R);
  }

  // ---- medidas
  const PT = 10, BUS_W = 3 * 9 + 14;
  const BUS_TOP = 92;                                            // franja superior con el bus de alimentación
  const chH = chN.map(n => 40 + n * PT);
  const gutW = gutN.map(n => BUS_W + 26 + n * PT);
  const colX = [], rowY = [];
  let x = gutW[0]; for (let c = 0; c < nC; c++) { colX.push(x); x += colW[c] + gutW[c + 1]; }
  const W = x;
  let y = BUS_TOP + chH[0]; for (let r = 0; r < nR; r++) { rowY.push(y); y += rowH[r] + chH[r + 1]; }
  const H = y;
  const chY0 = k => k === 0 ? BUS_TOP : rowY[k - 1] + rowH[k - 1];       // inicio del canal k
  const trackY = (k, i) => chY0(k) + 20 + i * PT;
  const gutX0 = j => j === 0 ? 0 : colX[j - 1] + colW[j - 1];
  const gutTrackX = (j, i) => gutX0(j) + BUS_W + 16 + i * PT;
  const busX = (j, b) => gutX0(j) + 10 + b * 9;

  const termXY = E => {
    const { r, c } = pos[E.inst], X = colX[c], Y = rowY[r];
    if (E.inst === "osc") return [X + 140 + E.t[1] * 140, Y];
    const g = geo[ID[key(E.inst)]], vy = g.vb[1];
    if (E.t[0] === "r") return [X + g.BX + g.BW - 14, Y + g.rieles[0].y[E.t[1]] - vy];
    const list = E.t[0] === "s" ? g.sal : g.ent, it = list.find(i => i.c === E.t[1]);
    const tx = it ? it.x : cxCol(E.t[1]), ty = it ? it.y : (E.t[0] === "s" ? 14 : 464);
    return [X + tx, Y + ty - vy];
  };

  // ---- dibujo
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="psys" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
  s += `<rect width="${W}" height="${H}" fill="#e9edf1"/>`;
  // bus de alimentación: franja superior, bajadas por los canales verticales y tomas a los rieles de cada protoboard
  const taps = [];   // [gutter, y, x destino, índice bus]
  for (const row of grid) for (const inst of row) {
    if (inst === "osc") continue;
    const g = geo[ID[key(inst)]], { r, c } = pos[inst], X = colX[c], Y = rowY[r] - g.vb[1];
    const rn = g.rieles[0].nombres;
    BUS.forEach(([name, , rail], b) => {
      if (!rn[rail] || rn[rail] === "sin usar") return;
      if (key(inst) === "m1") taps.push([c + 1, Y + g.rieles[0].y[rail], X + g.BX + g.BW - 14, b]);   // M1: sale por la derecha
      else taps.push([c, Y + g.rieles[0].y[rail], X + g.BX + 14, b]);
    });
  }
  const gutUsed = [...new Set(taps.map(t => t[0]))];
  let bus = "";
  const busYs = [BUS_TOP - 52, BUS_TOP - 43, BUS_TOP - 34];
  const gx = gutUsed.flatMap(j => [0, 1, 2].map(b => busX(j, b)));
  BUS.forEach(([name, col], b) => {
    bus += `<line x1="${Math.min(...gx) - 2}" x2="${Math.max(...gx) + 2}" y1="${busYs[b]}" y2="${busYs[b]}" stroke="${col}" stroke-width="3.4" stroke-linecap="round"/>`;
  });
  for (const j of gutUsed) BUS.forEach(([, col], b) => {
    const my = Math.max(...taps.filter(t => t[0] === j && t[3] === b).map(t => t[1]), -1);
    if (my > 0) bus += `<line x1="${busX(j, b)}" x2="${busX(j, b)}" y1="${busYs[b]}" y2="${my}" stroke="${col}" stroke-width="3"/>`;
  });
  for (const [j, ty, tx, b] of taps) bus += `<path d="M${busX(j, b)},${ty} H${tx}" stroke="${BUS[b][1]}" stroke-width="3" fill="none"/><circle cx="${tx}" cy="${ty}" r="4.5" fill="${BUS[b][1]}" stroke="#fff" stroke-width="1.5"/><circle cx="${busX(j, b)}" cy="${ty}" r="3.2" fill="${BUS[b][1]}"/>`;
  s += `<g class="bus">${bus}</g>`;
  s += `<text class="bus-t" x="${Math.min(...gx)}" y="${busYs[0] - 10}">Bus de alimentación desde M1: une los rieles de todas las protoboards (rojo +15 V · negro GND · azul −15 V)</text>`;

  // protoboards
  for (const row of grid) for (const inst of row) {
    const { r, c } = pos[inst], X = colX[c], Y = rowY[r], vb = vbOf(inst);
    const n = inst.includes("#") ? " #" + inst.split("#")[1] : "";
    if (inst === "osc") {
      s += `<g class="osc"><rect x="${X}" y="${Y + 40}" width="${vb[2]}" height="${vb[3] - 40}" rx="14" fill="#2b3139"/>
        <rect x="${X + 24}" y="${Y + 66}" width="${vb[2] - 48}" height="${vb[3] - 130}" rx="6" fill="#0b1410"/>
        <path d="M${X + 60},${Y + 170} q60,-80 120,0 t120,0" stroke="#39d98a" stroke-width="2.5" fill="none"/>
        <text x="${X + vb[2] / 2}" y="${Y + vb[3] - 26}" text-anchor="middle" class="osc-t">OSCILOSCOPIO · modo X-Y</text>`;
      ["CH1 (X)", "CH2 (Y)"].forEach((t, i) => {
        const cx = X + 140 + i * 140;
        s += `<rect x="${cx - 52}" y="${Y}" width="104" height="26" rx="6" fill="#fff" stroke="#c9d1d9"/><text x="${cx}" y="${Y + 18}" text-anchor="middle" class="term-t">${t}</text><line x1="${cx}" x2="${cx}" y1="${Y + 26}" y2="${Y + 40}" stroke="#8a9199" stroke-width="3"/>`;
      });
      s += `</g>`;
      continue;
    }
    const id = ID[key(inst)];
    const t = esc(NAME[key(inst)] + n);
    const title = key(inst) === "m1"
      ? `<text class="ptitle" x="${X + 8}" y="${Y + 60}">${t}</text>`
      : `<text class="ptitle" transform="translate(${X + 62} ${Y + 262 - vb[1]}) rotate(-90)" text-anchor="middle">${t}</text>`;
    s += `<a href="#/m/${id}/proto"><title>Abrir el montaje paso a paso de ${t}</title><image href="${base}/${id}.png" x="${X}" y="${Y}" width="${vb[2]}" height="${vb[3]}"/>${title}</a>`;
  }

  // cables
  let under = "", over = "", labels = "";
  for (const R of routes) {
    if (R.gnd) {
      const [x2, y2] = termXY(R.B), dir = R.B.t[0] === "s" ? -1 : 1, yy = y2 + dir * 18;
      over += `<path class="gndsym" d="M${x2},${y2} V${yy} m-9,0 h18 m-13,${dir * 5} h8 m-5,${dir * 4} h2"/>`;
      labels += `<text class="wl" x="${x2 + 12}" y="${yy + (dir > 0 ? 12 : -4)}" fill="#3b4652">${esc(R.lab || "GND")}</text>`;
      continue;
    }
    const [x1, y1] = termXY(R.A), [x2, y2] = termXY(R.B), col = netCol[R.net];
    const tyB = trackY(R.B.ch, R.tb);
    let d;
    if (R.A.gut !== undefined) {
      const gxA = gutTrackX(R.A.gut, R.ga);
      d = `M${x1},${y1} H${gxA} V${tyB} H${x2} V${y2}`;
    } else {
      const tyA = trackY(R.A.ch, R.ta);
      d = R.A.ch === R.B.ch ? `M${x1},${y1} V${tyA} H${x2} V${y2}` : `M${x1},${y1} V${tyA} H${gutTrackX(R.g, R.tg)} V${tyB} H${x2} V${y2}`;
    }
    const tip = `${R.fi} ${R.fp} → ${R.ti} ${R.tp}${R.lab ? " · " + R.lab : ""}`;
    under += `<path class="halo" d="${d}"/>`;
    over += `<path class="pw" d="${d}" stroke="${col}" data-net="${esc(R.net)}"><title>${esc(tip)}</title></path>`;
    over += `<circle cx="${x1}" cy="${y1}" r="4" fill="${col}"/><circle cx="${x2}" cy="${y2}" r="4" fill="${col}"/>`;
    if (R.lab) labels += `<text class="wl" x="${x2 + 7}" y="${tyB - 4}" fill="${col}" data-net="${esc(R.net)}">${esc(R.lab)}</text>`;
  }
  return s + `<g>${under}</g><g>${over}</g><g>${labels}</g></svg>`;
}

/** Lista de cables de las protoboards en texto: «M3 #1 · SALIDA (col. 28, arriba) → M3 #2 · ×1 (col. 3, abajo)». */
export function protoWireList(prog, geo) {
  const nm = i => i === "osc" ? "Osciloscopio" : NAME[key(i)] + (i.includes("#") ? " #" + i.split("#")[1] : "");
  const where = (inst, pin) => {
    const t = (TERM[key(inst)] || {})[pin];
    if (!t || inst === "osc") return pin;
    if (t[0] === "r") return `riel ${t[1] === "B-" ? "−15 V" : "+15 V"}`;
    const g = geo[ID[key(inst)]], it = (t[0] === "s" ? g.sal : g.ent).find(i => i.c === t[1]);
    return `${it ? it.txt.replace(/[←→]/g, "").trim() : pin} (columna ${t[1]}, ${t[0] === "s" ? "arriba" : "abajo"})`;
  };
  return wiresOf(prog).map(([fi, fp, ti, tp, lab]) =>
    `${fi === "GND" ? "GND (riel negro)" : nm(fi) + " · " + where(fi, fp)}  →  ${nm(ti)} · ${where(ti, tp)}${lab ? "   (" + lab + ")" : ""}`);
}
