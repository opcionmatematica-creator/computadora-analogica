#!/usr/bin/env node
// Servidor de la aplicación de escritorio (sin dependencias: solo Node).
//   node server.js            -> sirve el proyecto en http://127.0.0.1:8642/web/ y abre la ventana
//   node server.js --no-open  -> solo el servidor
// La web es estática; este servidor añade solo /api/* para abrir los proyectos en KiCad.
// Funciona en Windows y Linux. Se cierra solo cuando ya no queda ninguna ventana de la app
// (si se abrió en el navegador predeterminado, sigue en marcha y se reutiliza).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");

const ROOT = __dirname;
const PORT = +process.env.PORT || 8642;
const HOST = "127.0.0.1";
const WIN = process.platform === "win32";
// Busca un ejecutable en el PATH (Linux/macOS).
const which = name => (process.env.PATH || "").split(path.delimiter).map(d => path.join(d, name)).find(f => fs.existsSync(f));
const KICAD = WIN
  ? path.join(process.env.LOCALAPPDATA || "", "Programs", "KiCad", "10.0", "bin", "kicad.exe")
  : which("kicad") || "/usr/bin/kicad";
const OPEN_FOLDER = WIN ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary", ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".zip": "application/zip",
  ".cir": "text/plain; charset=utf-8", ".lib": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

let lastBeat = Date.now();
// Carpeta y nombre del proyecto KiCad: módulo (?mod=), su esquemático completo (?mod=&completo) o una simulación (?sim=id).
function project(q) {
  const ok = v => /^[a-z0-9_]+$/i.test(v || "");
  const m = q.get("mod"), sim = q.get("sim");
  if (ok(m)) return q.has("completo") ? [path.join(ROOT, "hardware", m, "completo"), m + "_completo"] : [path.join(ROOT, "hardware", m), m];
  if (ok(sim)) {
    const kdir = path.join(ROOT, "simulaciones", "kicad");
    for (const d of fs.existsSync(kdir) ? fs.readdirSync(kdir) : []) {
      const med = path.join(kdir, d, "medidas.json");
      if (!fs.existsSync(med)) continue;
      const j = JSON.parse(fs.readFileSync(med, "utf8"));
      if (j.id === sim || j.modulo === sim) {
        const pro = fs.readdirSync(path.join(kdir, d)).find(f => f.endsWith(".kicad_pro"));
        if (pro) return [path.join(kdir, d), pro.replace(/\.kicad_pro$/, "")];
      }
    }
  }
  return null;
}

function api(req, res, url) {
  const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/api/info") return send(200, { desktop: true, kicad: fs.existsSync(KICAD) });
  if (url.pathname === "/api/ping") { lastBeat = Date.now(); return send(200, { ok: true }); }
  if (req.method !== "POST") return send(405, { error: "POST" });
  const pr = project(url.searchParams);
  if (!pr || !fs.existsSync(pr[0])) return send(404, { error: "proyecto desconocido" });
  const [dir, stem] = pr;
  if (url.pathname === "/api/kicad") {
    if (!fs.existsSync(KICAD)) return send(500, { error: "KiCad no encontrado en " + KICAD });
    const pro = path.join(dir, stem + (fs.existsSync(path.join(dir, stem + ".kicad_pro")) ? ".kicad_pro" : ".kicad_sch"));
    spawn(KICAD, [pro], { detached: true, stdio: "ignore" }).unref();
    return send(200, { ok: true });
  }
  if (url.pathname === "/api/folder") {
    spawn(OPEN_FOLDER, [dir], { detached: true, stdio: "ignore" }).unref();
    return send(200, { ok: true });
  }
  send(404, { error: "?" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (url.pathname.startsWith("/api/")) return api(req, res, url);
  if (url.pathname === "/") { res.writeHead(302, { Location: "/web/" }); return res.end(); }
  let p = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    if (!fs.existsSync(path.join(p, "index.html"))) {     // listado de carpeta (p. ej. simulaciones/)
      if (!url.pathname.endsWith("/")) { res.writeHead(302, { Location: url.pathname + "/" }); return res.end(); }
      const items = fs.readdirSync(p, { withFileTypes: true }).filter(d => !d.name.startsWith(".") && d.name !== "__pycache__");
      const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta charset="utf-8"><title>${esc(url.pathname)}</title>
        <style>body{font:15px system-ui;background:#0e1512;color:#dbe9e1;padding:24px}a{color:#39d98a;text-decoration:none}li{margin:4px 0}img{max-width:720px;display:block;margin:6px 0 18px;border-radius:8px}</style>
        <h2>${esc(decodeURIComponent(url.pathname))}</h2><p><a href="../">⬑ subir</a></p><ul>${items.map(d =>
          `<li><a href="${encodeURIComponent(d.name)}${d.isDirectory() ? "/" : ""}">${d.isDirectory() ? "📁 " : "📄 "}${esc(d.name)}</a>${/\.png$/.test(d.name) ? `<img src="${encodeURIComponent(d.name)}">` : ""}</li>`).join("")}</ul>`);
    }
    p = path.join(p, "index.html");
  }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(p).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
});

// Devuelve true si abrió una ventana propia (Edge/Chrome/Chromium con --app), que se puede vigilar
// para apagar el servidor; false si tuvo que usar el navegador predeterminado.
function openWindow() {
  const app = `http://${HOST}:${PORT}/web/`;
  const edges = WIN ? [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  ] : ["microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map(which);
  const exe = edges.find(e => e && fs.existsSync(e));
  const base = WIN ? process.env.LOCALAPPDATA || ROOT : process.env.XDG_CONFIG_HOME || path.join(require("os").homedir(), ".config");
  const profile = path.join(base, "ComputadoraAnalogica", "perfil");
  const bg = { detached: true, stdio: "ignore" };
  if (exe) { spawn(exe, [`--app=${app}`, `--user-data-dir=${profile}`, "--start-maximized", "--no-first-run"], bg).unref(); return true; }
  if (WIN) spawn("cmd", ["/c", "start", "", app], bg).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [app], bg).unref();
  return false;
}

// Cuenta las ventanas de la app (navegador lanzado con el perfil ComputadoraAnalogica).
function countWindows(cb) {
  if (WIN) return execFile("powershell", ["-NoProfile", "-Command",
    "(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*ComputadoraAnalogica*' }).Count"],
    { windowsHide: true }, (err, out) => cb(err, parseInt(out, 10) || 0));
  // pgrep sale con código 1 cuando no encuentra nada: eso es «0 ventanas», no un error.
  execFile("pgrep", ["-fc", "user-data-dir=.*ComputadoraAnalogica"], (err, out) =>
    cb(err && err.code !== 1 ? err : null, parseInt(out, 10) || 0));
}

server.on("error", e => {
  if (e.code === "EADDRINUSE") { console.log("Ya está en marcha; abro otra ventana."); if (!process.argv.includes("--no-open")) openWindow(); setTimeout(() => process.exit(0), 500); }
  else throw e;
});
server.listen(PORT, HOST, () => {
  console.log(`Computadora analógica: http://${HOST}:${PORT}/web/`);
  if (!process.argv.includes("--no-open")) {
    // Se apaga cuando ya no queda ninguna ventana de la app (Edge/Chrome con el perfil
    // ComputadoraAnalogica). No depende de latidos: Edge frena los temporizadores de las
    // ventanas minimizadas y el servidor se cerraba con la app aún abierta.
    // Si se abrió en el navegador predeterminado (p. ej. Firefox en Linux) no hay forma de
    // saber cuándo se cierra la pestaña: el servidor sigue en marcha y se reutiliza.
    if (!openWindow()) return;
    let empty = 0;
    setInterval(() => countWindows((err, n) => {
      if (err) return;
      empty = n === 0 ? empty + 1 : 0;
      if (empty >= 3) process.exit(0);     // ~3 min sin ventanas
    }), 60000);
  }
});
