#!/usr/bin/env node
// Servidor de la aplicación de escritorio (sin dependencias: solo Node).
//   node server.js            -> sirve el proyecto en http://127.0.0.1:8642/web/ y abre la ventana
//   node server.js --no-open  -> solo el servidor
// La web es estática; este servidor añade solo /api/* para abrir los proyectos en KiCad.
// Se cierra solo cuando la ventana deja de enviar latidos.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");

const ROOT = __dirname;
const PORT = +process.env.PORT || 8642;
const HOST = "127.0.0.1";
const KICAD = path.join(process.env.LOCALAPPDATA || "", "Programs", "KiCad", "10.0", "bin", "kicad.exe");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpeg": "image/jpeg", ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary", ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".zip": "application/zip",
  ".cir": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

let lastBeat = Date.now();
const modDir = m => (/^m\d_[a-z_]+$/.test(m || "") ? path.join(ROOT, "hardware", m) : null);

function api(req, res, url) {
  const send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/api/info") return send(200, { desktop: true, kicad: fs.existsSync(KICAD) });
  if (url.pathname === "/api/ping") { lastBeat = Date.now(); return send(200, { ok: true }); }
  if (req.method !== "POST") return send(405, { error: "POST" });
  const dir = modDir(url.searchParams.get("mod"));
  if (!dir || !fs.existsSync(dir)) return send(404, { error: "módulo desconocido" });
  if (url.pathname === "/api/kicad") {
    if (!fs.existsSync(KICAD)) return send(500, { error: "KiCad no encontrado en " + KICAD });
    const pro = path.join(dir, path.basename(dir) + ".kicad_pro");
    spawn(KICAD, [pro], { detached: true, stdio: "ignore" }).unref();
    return send(200, { ok: true });
  }
  if (url.pathname === "/api/folder") {
    spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
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

function openWindow() {
  const app = `http://${HOST}:${PORT}/web/`;
  const edges = [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  const exe = edges.find(e => fs.existsSync(e));
  const profile = path.join(process.env.LOCALAPPDATA || ROOT, "ComputadoraAnalogica", "perfil");
  if (exe) spawn(exe, [`--app=${app}`, `--user-data-dir=${profile}`, "--start-maximized", "--no-first-run"], { detached: true, stdio: "ignore" }).unref();
  else spawn("cmd", ["/c", "start", "", app], { detached: true, stdio: "ignore" }).unref();
}

server.on("error", e => {
  if (e.code === "EADDRINUSE") { console.log("Ya está en marcha; abro otra ventana."); if (!process.argv.includes("--no-open")) openWindow(); setTimeout(() => process.exit(0), 500); }
  else throw e;
});
server.listen(PORT, HOST, () => {
  console.log(`Computadora analógica: http://${HOST}:${PORT}/web/`);
  if (!process.argv.includes("--no-open")) {
    openWindow();
    // Se apaga cuando ya no queda ninguna ventana de la app (Edge con el perfil
    // ComputadoraAnalogica). No depende de latidos: Edge frena los temporizadores de las
    // ventanas minimizadas y el servidor se cerraba con la app aún abierta.
    let empty = 0;
    setInterval(() => {
      execFile("powershell", ["-NoProfile", "-Command",
        "(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*ComputadoraAnalogica*' }).Count"],
        { windowsHide: true }, (err, out) => {
          if (err) return;
          empty = (parseInt(out, 10) || 0) === 0 ? empty + 1 : 0;
          if (empty >= 3) process.exit(0);     // ~3 min sin ventanas
        });
    }, 60000);
  }
});
