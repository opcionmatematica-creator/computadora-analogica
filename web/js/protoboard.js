// Montaje en protoboard generado del netlist de KiCad (assets/<proyecto>/netlist.json).
// Coloca las piezas en una protoboard de 830 puntos (63 columnas, filas a-j y 4 rieles), une cada
// net con puentes y dibuja el resultado en SVG con el código de colores de la rúbrica:
//   rojo = alimentación, negro/verde = tierra, cualquier otro color = señal.
// También produce la lista de pasos con la coordenada de cada pata (p. ej. "R1: a12 → a17").

const ROWS = "abcdefghij";
const POWER = n => /^[+-]?\d+(\.\d+)?V$/i.test(n) || /^GND$/i.test(n) || n === "VCC";
const isGnd = n => /^GND$/i.test(n);
const SIGNAL_COLORS = ["#f2c230", "#2e86de", "#ff8c1a", "#9b59b6", "#f5f5f5", "#1abc9c", "#c0392b80", "#8e6e53", "#e84393", "#7f8c8d"];

function kind(p) {
  const fp = p.fp || "", lib = p.lib || "";
  if (/DIP-8/.test(fp)) return "dip8";
  if (/G5V-2/.test(fp)) return "relay";
  if (/TO-92|TO-126|TO-220/.test(fp)) return "to";
  if (/Potentiometer/.test(fp)) return "pot";
  if (/SW_|Switch/.test(fp) || /Switch:/.test(lib)) return "sw";
  if (/PinHeader|TerminalBlock|BNC/.test(fp)) return Object.keys(p.pins).length >= 3 || /PinHeader/.test(fp) ? "hdr" : "two";
  if (/Motor/.test(lib)) return "two";
  return "two";
}
const twoKind = p => /LED/.test(p.lib) ? "led" : /Device:D$|Diode:/.test(p.lib) ? "diode" : /C_Polarized/.test(p.lib) ? "cpol"
  : /Device:C$/.test(p.lib) ? "cap" : /Buzzer/.test(p.lib) ? "buzzer" : /Motor/.test(p.lib) ? "motor"
  : /BNC|Coaxial/.test(p.fp + p.lib) ? "bnc" : /Device:R$/.test(p.lib) ? "res" : "gen";

/** Calcula el montaje. Devuelve {cols, rails, items, wires, steps}. */
export function layout(netlist) {
  const parts = netlist.parts.map(p => ({ ...p, kind: kind(p) }));
  const nets = new Set(parts.flatMap(p => Object.values(p.pins)));
  const power = [...nets].filter(POWER);
  const pos = power.filter(n => n.startsWith("+") || /VCC/.test(n)).sort((a, b) => parseFloat(b) - parseFloat(a));
  const neg = power.filter(n => n.startsWith("-"));
  const gnd = power.find(isGnd) || "GND";
  // rieles: arriba [+V (exterior), GND (interior)], abajo [GND (interior), −V o segundo +V (exterior)]
  const rails = { T0: pos[0] || gnd, T1: gnd, B0: gnd, B1: neg[0] || pos[1] || pos[0] || gnd };
  const railFor = n => Object.keys(rails).filter(k => rails[k] === n);

  const strips = new Map();                      // "col|half" -> {net, used:Set(rows)}
  const S = (c, h) => { const k = c + "|" + h; if (!strips.has(k)) strips.set(k, { col: c, half: h, net: null, used: new Set() }); return strips.get(k); };
  const homes = new Map();                       // net -> [strip]
  const items = [], wires = [], railUse = new Set();
  let cur = [3, 3];                              // cursor de columna por mitad (0 arriba, 1 abajo)

  const prefRows = half => half === 0 ? [2, 1, 3, 0, 4] : [7, 8, 6, 9, 5];
  function freeRow(st, prefer) {
    for (const r of prefer || prefRows(st.half)) if (!st.used.has(r)) return r;
    return null;
  }
  function claim(st, net, row) {
    if (st.net && st.net !== net) throw new Error(`tira ${st.col}${st.half} ya es ${st.net}, no ${net}`);
    st.net = net; st.used.add(row);
    if (!POWER(net)) { if (!homes.has(net)) homes.set(net, []); if (!homes.get(net).includes(st)) homes.get(net).push(st); }
    return [st.col, row];
  }
  const isFree = (c, h) => { const k = c + "|" + h; return c >= 2 && !(strips.has(k) && (strips.get(k).net || strips.get(k).used.size)) && !reserved.has(k); };
  const reserved = new Set();
  function newStrip(net, half, near) {
    half = half ?? (cur[0] <= cur[1] ? 0 : 1);
    let c = null;
    if (near !== undefined) {
      for (const d of [2, 3, -2, -3, 4, -4, 1, -1, 5, -5, 6, -6, 7, -7, 8, -8]) if (isFree(near + d, half)) { c = near + d; break; }
    }
    if (c === null) { while (!isFree(cur[half], half)) cur[half]++; c = cur[half]; cur[half] += 2; }
    const st = S(c, half);
    st.net = net;
    return st;
  }
  // un agujero libre conectado a `net` (crea tira y puente si hace falta)
  function holeFor(net, half, near, row) {
    let list = (homes.get(net) || []).filter(s => half === undefined || s.half === half);
    if (near !== undefined) list = list.filter(s => Math.abs(s.col - near[0]) <= 6).sort((a, b) => Math.abs(a.col - near[0]) - Math.abs(b.col - near[0]));
    for (const st of list) {
      const r = row !== undefined && !st.used.has(row) && (row < 5) === (st.half === 0) ? row : freeRow(st);
      if (r !== null) return claim(st, net, r);
    }
    const st = newStrip(net, near ? (near[1] < 5 ? 0 : 1) : half, near ? near[0] : undefined);
    const home = (homes.get(net) || [])[0];
    const r = row !== undefined && (row < 5) === (st.half === 0) ? row : freeRow(st);
    const hole = claim(st, net, r);
    if (home && home !== st) jumper(net, home, st);
    return hole;
  }
  function jumper(net, a, b) {
    const ra = freeRow(a, a.half === 0 ? [0, 1, 2, 3, 4] : [9, 8, 7, 6, 5]), rb = freeRow(b, b.half === 0 ? [0, 1, 2, 3, 4] : [9, 8, 7, 6, 5]);
    a.used.add(ra); b.used.add(rb);
    wires.push({ net, from: [a.col, ra], to: [b.col, rb] });
  }
  function toRail(net, st) {
    const rk = railFor(net);
    const near = rk.find(k => (k[0] === "T") === (st.half === 0)) || rk[0];
    if (!near) return;
    const r = freeRow(st, st.half === 0 ? [0, 1, 2, 3, 4] : [9, 8, 7, 6, 5]);
    st.used.add(r);
    let c = st.col; while (railUse.has(near + c)) c++;
    railUse.add(near + c);
    wires.push({ net, from: [st.col, r], to: [c, near], rail: true });
  }
  // pin de una pieza grande en un agujero fijo
  function fixedPin(part, num, col, row) {
    const net = part.pins[num];
    const st = S(col, row < 5 ? 0 : 1);
    if (!net) { st.used.add(row); return [col, row]; }
    if (POWER(net)) { claim(st, net, row); toRail(net, st); return [col, row]; }
    const home = (homes.get(net) || [])[0];
    claim(st, net, row);
    if (home && home !== st) jumper(net, home, st);
    return [col, row];
  }

  // 1) piezas grandes, de izquierda a derecha: integrados, relé, transistores, pots, interruptores, conectores
  const order = { dip8: 0, relay: 1, to: 2, pot: 3, sw: 4, hdr: 5 };
  const big = parts.filter(p => p.kind in order).sort((a, b) => order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref, "es", { numeric: true }));
  for (const p of big) {
    const pins = {};
    if (p.kind === "dip8" || p.kind === "relay") {
      const c = Math.max(cur[0], cur[1]) + 1;
      const offs = p.kind === "dip8" ? { bot: ["1", "2", "3", "4"], top: ["8", "7", "6", "5"], dx: [0, 1, 2, 3] }
        : { bot: ["1", "4", "6", "8"], top: ["16", "13", "11", "9"], dx: [0, 3, 5, 7] };
      offs.bot.forEach((n, i) => (pins[n] = fixedPin(p, n, c + offs.dx[i], 5)));
      offs.top.forEach((n, i) => (pins[n] = fixedPin(p, n, c + offs.dx[i], 4)));
      const w = offs.dx[3] + 1;
      cur = [c + w + 3, c + w + 3];
      items.push({ ...p, at: pins, span: [c, c + w - 1] });
    } else {
      const nums = Object.keys(p.pins).sort((a, b) => a - b);
      if (p.kind === "to" || p.kind === "pot" || p.kind === "sw") nums.splice(0, nums.length, ...["1", "2", "3"].filter(n => p.pins[n] !== undefined || p.kind !== "to"));
      // reparte transistores, pots y conectores entre las dos mitades (la que vaya más atrasada)
      const half = cur[0] <= cur[1] ? 0 : 1;
      const c = cur[half] + (p.kind === "hdr" ? 0 : 1);
      const row = half === 0 ? (p.kind === "hdr" ? 0 : 2) : (p.kind === "hdr" ? 9 : 7);
      nums.forEach((n, i) => (pins[n] = fixedPin(p, n, c + i, row)));
      cur[half] = c + nums.length + 4;
      items.push({ ...p, at: pins, half });
    }
  }
  // 2) piezas de dos patas entre las tiras de sus nets (o directo al riel)
  for (const p of parts.filter(p => !(p.kind in order))) {
    const nums = Object.keys(p.pins).sort();
    const [n1, n2] = nums.map(n => p.pins[n]);
    const at = {};
    if (POWER(n1) && POWER(n2)) {                // condensador de desacoplo entre rieles
      const r1 = railFor(n1), r2 = railFor(n2);
      const pair = ["T", "B"].find(s => r1.some(k => k[0] === s) && r2.some(k => k[0] === s)) || "T";
      const k1 = r1.find(k => k[0] === pair) || r1[0], k2 = r2.find(k => k[0] === pair) || r2[0];
      let c = 4; while (railUse.has(k1 + c) || railUse.has(k2 + c)) c += 2;
      railUse.add(k1 + c); railUse.add(k2 + c);
      at[nums[0]] = [c, k1]; at[nums[1]] = [c, k2];
    } else {
      // primero la pata de señal, luego la de alimentación junto a ella
      const idx = POWER(n1) ? [1, 0] : [0, 1];
      for (const i of idx) {
        const n = [n1, n2][i];
        if (POWER(n)) {
          const otherHole = at[nums[1 - i]];
          const rk = railFor(n);
          const half = otherHole ? (otherHole[1] < 5 ? "T" : "B") : "T";
          const kk = rk.find(x => x[0] === half) || rk[0];
          let c = otherHole ? otherHole[0] : 3; while (railUse.has(kk + c)) c++;
          railUse.add(kk + c);
          at[nums[i]] = [c, kk];
        } else {
          const otherHole = at[nums[1 - i]];
          at[nums[i]] = otherHole && typeof otherHole[1] === "number" ? holeFor(n, undefined, otherHole, otherHole[1]) : holeFor(n);
        }
      }
    }
    items.push({ ...p, at, kind: "two", sub: twoKind(p) });
  }
  const cols = Math.max(63, ...[...strips.values()].map(s => s.col + 2), ...wires.map(w => w.to[0] + 2));
  // colores de los cables
  const netColor = {}; let k = 0;
  for (const w of wires) {
    if (isGnd(w.net)) w.color = "#111";
    else if (POWER(w.net)) w.color = "#d62828";
    else w.color = netColor[w.net] || (netColor[w.net] = SIGNAL_COLORS[k++ % SIGNAL_COLORS.length]);
  }
  return { cols, rails, items, wires, steps: steps(items, wires, rails) };
}

let RAILS = {};
const hole = ([c, r]) => typeof r === "string" ? `riel ${RAILS[r] || ""} ${r[0] === "T" ? "superior" : "inferior"} (col. ${c})` : `${ROWS[r]}${c}`;

function steps(items, wires, rails) {
  RAILS = rails;
  const name = { T0: "superior exterior", T1: "superior interior", B0: "inferior interior", B1: "inferior exterior" };
  const out = [`Rieles: ${Object.entries(rails).map(([k, n]) => `${name[k]} = ${n}`).join(" · ")}. Conecta la fuente a los rieles (cable rojo a la alimentación y negro a GND) y une los GND de arriba y de abajo.`];
  const pinName = (it, n) => {
    if (it.kind !== "to") return n;
    const names = /BD13|TIP/.test(it.value) ? ["E", "C", "B"] : /78\d\d|79\d\d/.test(it.value) ? ["IN", "GND", "OUT"] : ["E", "B", "C"];
    return names[+n - 1] || n;
  };
  for (const it of items.filter(i => i.kind !== "two")) {
    const desc = Object.entries(it.at).sort((a, b) => a[0] - b[0]).map(([n, h]) => `${pinName(it, n)}→${hole(h)}`).join(", ");
    const extra = it.kind === "dip8" ? " (muesca hacia la izquierda, a caballo del canal central)" : it.kind === "relay" ? " (a caballo del canal central)" : it.kind === "to" ? " (cara plana hacia ti)" : "";
    out.push(`${it.ref} ${it.value}${extra}: ${desc}`);
  }
  for (const it of items.filter(i => i.kind === "two")) {
    const [a, b] = Object.keys(it.at).sort();
    const pol = it.sub === "led" ? ` (ánodo, pata larga, en ${hole(it.at["2"])})` : it.sub === "diode" ? ` (franja = cátodo en ${hole(it.at["1"])})` : it.sub === "cpol" ? ` (+ en ${hole(it.at["1"])})` : "";
    out.push(`${it.ref} ${it.value}: ${hole(it.at[a])} – ${hole(it.at[b])}${pol}`);
  }
  for (const w of wires) out.push(`Cable ${w.color === "#111" ? "negro" : w.color === "#d62828" ? "rojo" : "de señal"} (${w.net}): ${hole(w.from)} → ${hole(w.to)}`);
  return out;
}

// ------------------------------------------------------------------ dibujo
const BAND = ["#000", "#7b3f00", "#d00", "#f80", "#ff0", "#0a0", "#00f", "#80f", "#888", "#fff"];
function bands(v) {
  const m = String(v).match(/([\d.]+)\s*([kKMm]?)/);
  if (!m) return null;
  let x = parseFloat(m[1]) * ({ k: 1e3, K: 1e3, M: 1e6, m: 1e-3 }[m[2]] || 1);
  if (!(x >= 1)) return null;
  const e = Math.floor(Math.log10(x)) - 1, d = Math.round(x / 10 ** e);
  const s = String(Math.min(d, 99)).padStart(2, "0");
  return [BAND[+s[0]], BAND[+s[1]], BAND[Math.max(0, e)] || "#000", "#c9a227"];
}

export function render(L) {
  const P = 14, X0 = 34, cols = L.cols;
  const W = X0 * 2 + (cols - 1) * P;
  const railY = { T0: 18, T1: 18 + P, B1: 0, B0: 0 };
  const rowY = r => 18 + 2 * P + 22 + r * P + (r >= 5 ? 22 : 0);
  railY.B0 = rowY(9) + 22; railY.B1 = railY.B0 + P;
  const H = railY.B1 + 22;
  const XY = ([c, r]) => [X0 + (c - 1) * P, typeof r === "string" ? railY[r] : rowY(r)];
  const railColor = n => isGnd(n) ? "#1d4ed8" : "#d62828";
  let s = `<svg viewBox="0 0 ${W} ${H}" class="proto" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="10" class="pb"/>`;
  s += `<rect x="10" y="${rowY(4) + 8}" width="${W - 20}" height="${22 - 2}" class="gap"/>`;
  for (const [k, n] of Object.entries(L.rails)) {
    const y = railY[k];
    s += `<line x1="${X0 - 8}" x2="${W - X0 + 8}" y1="${y + (k.endsWith("0") === k.startsWith("T") ? -7 : 7)}" y2="${y + (k.endsWith("0") === k.startsWith("T") ? -7 : 7)}" stroke="${railColor(n)}" stroke-width="1.5" opacity=".7"/>`;
    s += `<text class="rl" x="8" y="${y + 3}" fill="${railColor(n)}">${n}</text>`;
    for (let c = 1; c <= cols; c++) if (c % 6) s += `<rect class="h" x="${X0 + (c - 1) * P - 2.5}" y="${y - 2.5}" width="5" height="5" rx="1"/>`;
  }
  for (let r = 0; r < 10; r++) {
    s += `<text class="rl" x="${X0 - 18}" y="${rowY(r) + 3}">${ROWS[r]}</text>`;
    for (let c = 1; c <= cols; c++) s += `<rect class="h" x="${X0 + (c - 1) * P - 2.5}" y="${rowY(r) - 2.5}" width="5" height="5" rx="1"/>`;
  }
  for (let c = 1; c <= cols; c += (c === 1 ? 4 : 5)) s += `<text class="cn" x="${X0 + (c - 1) * P}" y="${rowY(0) - 9}">${c}</text><text class="cn" x="${X0 + (c - 1) * P}" y="${rowY(9) + 15}">${c}</text>`;
  // cables (debajo de las piezas)
  let wires = "";
  for (const w of L.wires) {
    const [x1, y1] = XY(w.from), [x2, y2] = XY(w.to);
    const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 10 - Math.abs(x2 - x1) * 0.08;
    wires += `<path class="wire" data-net="${w.net}" d="M${x1},${y1} Q${mx},${w.rail ? (y1 + y2) / 2 : my} ${x2},${y2}" stroke="${w.color}"><title>${w.net}</title></path>`;
    wires += `<circle cx="${x1}" cy="${y1}" r="2.6" fill="${w.color}"/><circle cx="${x2}" cy="${y2}" r="2.6" fill="${w.color}"/>`;
  }
  // piezas
  let parts = "";
  for (const it of L.items) {
    const t = `<title>${it.ref} ${it.value}</title>`;
    if (it.kind === "dip8" || it.kind === "relay") {
      const xs = Object.values(it.at).map(h => XY(h)[0]);
      const x0 = Math.min(...xs) - 7, x1 = Math.max(...xs) + 7, y0 = rowY(4) - 6, y1 = rowY(5) + 6;
      parts += `<g class="part" data-ref="${it.ref}">${t}<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="${it.kind === "relay" ? "#1b1b1b" : "#222"}"/>
        ${it.kind === "dip8" ? `<path d="M${x0},${(y0 + y1) / 2 - 5} a5,5 0 0 1 0,10" fill="#555"/><circle cx="${x0 + 5}" cy="${y1 - 5}" r="1.6" fill="#aaa"/>` : ""}
        <text class="pl" x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 - 1}">${it.ref}</text><text class="pv" x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 + 9}">${it.value.slice(0, 12)}</text></g>`;
    } else if (it.kind !== "two") {
      const pts = Object.values(it.at).map(XY), xs = pts.map(p => p[0]), y = pts[0][1];
      const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6;
      const fill = { to: "#151515", pot: "#1f5fbf", sw: "#444", hdr: "#111" }[it.kind];
      const body = it.kind === "to" ? `<path d="M${x0},${y + 6} L${x0},${y - 2} Q${(x0 + x1) / 2},${y - 18} ${x1},${y - 2} L${x1},${y + 6} Z" fill="${fill}"/>`
        : it.kind === "pot" ? `<rect x="${x0}" y="${y - 22}" width="${x1 - x0}" height="${26}" rx="3" fill="${fill}"/><circle cx="${(x0 + x1) / 2}" cy="${y - 10}" r="6" fill="#e8e8e8"/>`
        : `<rect x="${x0}" y="${y - 5}" width="${x1 - x0}" height="10" rx="2" fill="${fill}"/>`;
      parts += `<g class="part" data-ref="${it.ref}">${t}${body}${pts.map(([x, yy]) => `<circle cx="${x}" cy="${yy}" r="2" fill="#d4af37"/>`).join("")}
        <text class="pl dark" x="${(x0 + x1) / 2}" y="${it.kind === "pot" ? y - 26 : y - (it.kind === "to" ? 20 : 9)}">${it.ref}</text></g>`;
    } else {
      const [a, b] = Object.keys(it.at).sort();
      const [x1, y1] = XY(it.at[a]), [x2, y2] = XY(it.at[b]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      let body;
      if (it.sub === "res") {
        const bd = bands(it.value) || ["#888", "#888", "#888", "#c9a227"];
        body = `<rect x="-11" y="-4.5" width="22" height="9" rx="4" fill="#e4c99a"/>${bd.map((c, i) => `<rect x="${-7 + i * 4 + (i === 3 ? 2 : 0)}" y="-4.5" width="2" height="9" fill="${c}"/>`).join("")}`;
      } else if (it.sub === "led") body = `<circle r="6" fill="${/verde/i.test(it.value) ? "#33dd55" : /amar/i.test(it.value) ? "#ffcc22" : "#ff3344"}" stroke="#fff8" /><circle r="2.5" cx="-1.5" cy="-1.5" fill="#fff9"/>`;
      else if (it.sub === "diode") body = `<rect x="-9" y="-3.5" width="18" height="7" rx="2" fill="${/4148/.test(it.value) ? "#e0603a" : "#222"}"/><rect x="${-8}" y="-3.5" width="2.5" height="7" fill="#ddd"/>`;
      else if (it.sub === "cpol") body = `<circle r="8" fill="#1f4fa8"/><path d="M-8,0 a8,8 0 0 1 3,-6.2 v12.4 a8,8 0 0 1 -3,-6.2z" fill="#cfd8e6"/>`;
      else if (it.sub === "cap") body = `<ellipse rx="7" ry="5" fill="${/film/i.test(it.value) ? "#b22" : "#e7a43a"}"/>`;
      else if (it.sub === "buzzer") body = `<circle r="11" fill="#111"/><circle r="2.5" fill="#333"/>`;
      else if (it.sub === "motor") body = `<circle r="11" fill="#999"/><text class="pv" y="3">M</text>`;
      else if (it.sub === "bnc") body = `<rect x="-9" y="-7" width="18" height="14" rx="3" fill="#777"/>`;
      else body = `<rect x="-8" y="-4" width="16" height="8" fill="#666"/>`;
      parts += `<g class="part" data-ref="${it.ref}">${t}<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="lead"/>
        <g transform="translate(${mx},${my}) rotate(${Math.abs(ang) > 90 ? ang + 180 : ang})">${body}</g>
        <text class="pl dark" x="${mx}" y="${my - 11}">${it.ref}</text></g>`;
    }
  }
  return s + wires + parts + "</svg>";
}
