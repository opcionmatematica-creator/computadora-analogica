// Prueba la app como un usuario: UNA ventana, clic en cada enlace del menú y en cada pestaña,
// registrando errores de consola, peticiones fallidas (404) e imágenes rotas, con captura de cada página.
//   node tools/probar_app.mjs [carpeta_capturas]
// Requiere el servidor en marcha (node server.js --no-open).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || "capturas_prueba";
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9333;
const EDGE = [
  path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
  path.join(process.env.ProgramFiles || "", "Microsoft/Edge/Application/msedge.exe"),
].find(f => fs.existsSync(f));
const PROFILE = process.env.PROBAR_PERFIL || path.join(process.env.LOCALAPPDATA, "ComputadoraAnalogica", "perfil");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--start-maximized",
  "--no-first-run", "--app=http://127.0.0.1:8642/web/"], { stdio: "ignore" });

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(500);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === "page"); } catch {}
}
if (!target) { console.error("No pude conectar con Edge"); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const problems = [];
let current = "inicio";
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") problems.push(`[${current}] EXCEPCIÓN: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(`[${current}] console.error: ${m.params.args.map(a => a.value ?? a.description).join(" ")}`);
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400) problems.push(`[${current}] HTTP ${m.params.response.status}: ${m.params.response.url}`);
  if (m.method === "Network.loadingFailed" && !m.params.canceled) problems.push(`[${current}] FALLÓ: ${m.params.errorText} (${m.params.requestId})`);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Network.enable"); await send("Page.enable");
await sleep(2500);

async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
}
async function brokenImages() {
  return await evalJS(`Promise.all([...document.images].filter(i => i.loading !== "lazy").map(i => i.complete ? i : new Promise(r => { i.onload = i.onerror = () => r(i); setTimeout(() => r(i), 3000); })))
    .then(imgs => imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')))`);
}

const links = await evalJS(`[...document.querySelectorAll('#nav a')].map(a => a.getAttribute('href'))`);
console.log("Enlaces del menú:", links.length);
for (const href of links) {
  current = href;
  await evalJS(`document.querySelector('#nav a[href="${href}"]').click()`);
  await sleep(1800);
  const info = await evalJS(`({ hash: location.hash, h1: document.querySelector('#main h1')?.textContent || '(sin título)', len: document.querySelector('#main').innerText.length })`);
  const broken = await brokenImages();
  if (info.len < 50) problems.push(`[${href}] PÁGINA VACÍA (hash ${info.hash})`);
  for (const b of broken || []) problems.push(`[${href}] IMAGEN ROTA: ${b}`);
  console.log(`${href.padEnd(28)} -> ${info.h1.slice(0, 50)}  (${info.len} car.)${broken?.length ? "  imágenes rotas: " + broken.length : ""}`);
  await shot(href.replace(/[#/]+/g, "_").replace(/^_|_$/g, "") || "inicio");
  const tabs = await evalJS(`[...document.querySelectorAll('.tabs button')].map(b => b.dataset.t)`);
  for (const t of tabs || []) {
    current = `${href} > ${t}`;
    await evalJS(`document.querySelector('.tabs button[data-t="${t}"]').click()`);
    await sleep(t === "pcb" ? 3500 : 1500);
    const broken2 = await brokenImages();
    for (const b of broken2 || []) problems.push(`[${current}] IMAGEN ROTA: ${b}`);
    const len = await evalJS(`document.querySelector('#tab').innerText.length + document.querySelectorAll('#tab canvas, #tab img, #tab svg').length`);
    if (len < 5) problems.push(`[${current}] PESTAÑA VACÍA`);
    await shot(`${href.replace(/[#/]+/g, "_").replace(/^_|_$/g, "")}__${t}`);
  }
}
console.log("\n=== PROBLEMAS ===");
console.log(problems.length ? [...new Set(problems)].join("\n") : "ninguno");
ws.close(); browser.kill();
process.exit(0);
