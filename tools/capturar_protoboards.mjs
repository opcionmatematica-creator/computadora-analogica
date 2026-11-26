// Captura cada montaje en protoboard (web/montaje/montaje_<módulo>.html) ya terminado, como PNG, y guarda la
// geometría de sus bornes de entrada/salida y rieles. «Sistema completo → Protoboards» usa ambos para dibujar
// cómo se cablean todas las protoboards de un programa.
//   node tools/capturar_protoboards.mjs
// Salida: web/assets/sistema/proto/<módulo>.png y web/assets/sistema/proto/geometria.json
// Necesita playwright-core (PW_CORE=ruta/al/paquete si no está instalado) y un Chromium (CHROMIUM=ruta al binario
// si Playwright no tiene el suyo descargado).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "web/assets/sistema/proto");
const MODS = ["m1_fuente", "m2_condicion_inicial", "m3_integrador", "m4_sumador", "m5_coeficientes", "m6_filtro_salida", "m7_multiplicador"];

function loadPw() {
  const req = createRequire(import.meta.url);
  const cands = [process.env.PW_CORE, "playwright-core", "playwright"].filter(Boolean);
  const npx = path.join(os.homedir(), ".npm/_npx");
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) cands.push(path.join(npx, d, "node_modules/playwright-core"));
  for (const c of cands) { try { return req(c); } catch {} }
  throw new Error("No encuentro playwright-core: instálalo (npm i -D playwright-core) o pasa PW_CORE=ruta");
}
function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const base = path.join(os.homedir(), ".cache/ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter(d => d.startsWith("chromium-")).sort().reverse()) {
    const f = path.join(base, d, "chrome-linux64/chrome");
    if (fs.existsSync(f)) return f;
  }
}

const { chromium } = loadPw();
const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({ colorScheme: "light", deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
fs.mkdirSync(OUT, { recursive: true });
const geo = {};
for (const id of MODS) {
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(ROOT, `web/montaje/montaje_${id}.html`)).href);
  const g = await page.evaluate(esFuente => {
    // último paso de montaje (el de prueba enciende y resalta piezas: no se usa)
    let n = STEPS.length; while (n > 1 && STEPS[n - 1].test) n--;
    go(n, false);
    const lab = document.getElementById("labels"); if (lab && lab.checked) lab.click();
    // en el sistema las protoboards se alimentan del bus de M1: se quita la fuente de laboratorio dibujada
    // (salvo en M1, que es la que recibe la fuente)
    if (!esFuente) {
      document.getElementById("psu")?.remove();
      for (const p of PARTS) if (p.type === "wire" && p.pts.some(q => q && q.fuente !== undefined)) p.el.style.display = "none";
    }
    document.getElementById("rings")?.remove();
    document.getElementById("tags")?.remove();
    const svg = document.getElementById("bb");
    const bg = getComputedStyle(document.body).getPropertyValue("--bench").trim() || "#e3e8ee";
    Object.assign(svg.style, { position: "fixed", left: "0", top: "0", zIndex: 9999, width: VBW + "px", height: VYH + "px", maxWidth: "none", background: bg });
    const it = (S, y) => (S ? S.items : []).map(i => ({ c: i.c, txt: i.txt, x: cx(i.c), y }));
    return {
      vb: [0, VY0, VBW, VYH], tableros: NB, columnas: NC, BX, BW,
      sal: it(CONFIG.salidas, 14),                              // borde superior de la caja del borne
      ent: it(CONFIG.entradas, 464 + dyB(NB)),                  // borde inferior de la caja del borne
      rieles: [1, ...(NB > 1 ? [2] : [])].map(b => ({ b, nombres: rielesDe(b), y: Object.fromEntries(["T-", "T+", "B-", "B+"].map(r => [r, ROW[r] + dyB(b)])) })),
    };
  }, id === "m1_fuente");
  await page.waitForTimeout(300);
  await page.locator("#bb").screenshot({ path: path.join(OUT, `${id}.png`) });
  geo[id] = g;
  console.log(`${id}: ${g.vb[2]}×${g.vb[3]}, ${g.sal.length} salidas, ${g.ent.length} entradas`);
  await page.close();
}
fs.writeFileSync(path.join(OUT, "geometria.json"), JSON.stringify(geo, null, 1));
await browser.close();
