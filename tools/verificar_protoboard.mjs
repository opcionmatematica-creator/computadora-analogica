// Comprueba que cada montaje en protoboard tenga EXACTAMENTE las conexiones del netlist de KiCad:
// reconstruye la conectividad (tiras de 5 agujeros, rieles y cables) y la compara net por net.
//   node tools/verificar_protoboard.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { layout } = await import(pathToFileURL(path.join(ROOT, "web/js/protoboard.js")).href);
const assets = path.join(ROOT, "web/assets");
let bad = 0;
for (const m of fs.readdirSync(assets).filter(d => /^(m\d|p5)_/.test(d)).sort()) {
  const net = JSON.parse(fs.readFileSync(path.join(assets, m, "netlist.json")));
  const L = layout(net);
  const parent = {};
  const find = x => (parent[x] ??= x) === x ? x : (parent[x] = find(parent[x]));
  const union = (a, b) => { parent[find(a)] = find(b); };
  const node = ([c, r]) => typeof r === "string" ? "R:" + r : `S:${c}:${r < 5 ? 0 : 1}`;
  // rieles con la misma net están unidos por la fuente (se pide unir los GND de arriba y abajo)
  const rk = Object.entries(L.rails);
  for (const [k1, n1] of rk) for (const [k2, n2] of rk) if (n1 === n2) union("R:" + k1, "R:" + k2);
  for (const w of L.wires) union(node(w.from), node(w.to));
  const pinNode = {};
  for (const it of L.items) for (const [num, h] of Object.entries(it.at)) pinNode[it.ref + "." + num] = node(h);
  // net -> grupos donde están sus pines
  const errs = [];
  const nets = {};
  for (const p of net.parts) for (const [num, n] of Object.entries(p.pins)) (nets[n] ??= []).push(p.ref + "." + num);
  const groupNet = {};
  for (const [n, pins] of Object.entries(nets)) {
    const missing = pins.filter(k => !pinNode[k]);
    if (missing.length) errs.push(`${n}: pines sin colocar ${missing.join(", ")}`);
    const groups = new Set(pins.filter(k => pinNode[k]).map(k => find(pinNode[k])));
    if (groups.size > 1) errs.push(`${n}: ABIERTO (${groups.size} grupos) ${pins.join(" ")}`);
    for (const g of groups) {
      if (groupNet[g] && groupNet[g] !== n) errs.push(`CORTO entre ${groupNet[g]} y ${n}`);
      groupNet[g] = n;
    }
  }
  // físico: cada agujero lleva una sola pata o punta de cable
  const used = {};
  const take = (h, who) => { const k = h.join(","); if (used[k]) errs.push(`agujero ${k} ocupado por ${used[k]} y ${who}`); used[k] = who; };
  for (const it of L.items) for (const [num, h] of Object.entries(it.at)) take(h, it.ref + "." + num);
  L.wires.forEach((w, i) => { take(w.from, "cable" + i); take(w.to, "cable" + i); });
  console.log(`${m.padEnd(24)} ${errs.length ? "✗ " + errs.length + " error(es)" : "✓ conexiones idénticas al netlist"}  (${L.wires.length} cables)`);
  errs.slice(0, 8).forEach(e => console.log("    " + e));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
