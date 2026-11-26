// Visor 3D de la placa (GLB exportado por KiCad) con three.js.
// Sobre el modelo de KiCad se añade lo que se ve en una placa de verdad: bandas de color de las
// resistencias, rotulado de condensadores, integrados y relé, las piezas cuyo modelo no trae la
// biblioteca de KiCad (interruptor, potenciómetros) y una etiqueta por componente con su ficha
// (qué es, valor, encapsulado y a qué redes va cada pin). Datos: assets/<módulo>/componentes.json.
import * as THREE from "three";
import { GLTFLoader } from "../vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "../vendor/three/examples/jsm/controls/OrbitControls.js";

let current = null;
const MM = 0.001;                       // el GLB de KiCad está en metros: x = X/1000, z = Y/1000, y = altura

export function disposeViewer() {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  current.ro.disconnect();
  current.renderer.dispose();
  current = null;
}

// ---------------------------------------------------------------- información de cada pieza
const BAND = ["#111111", "#7a3b12", "#d01818", "#f07a10", "#f2d21a", "#1f9a3a", "#1d4fd8", "#7b2fbe", "#8a8a8a", "#f4f4f4"];
const BAND_NAME = ["negro", "marrón", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "gris", "blanco"];

function ohms(v) {
  const m = String(v).replace(",", ".").match(/^([\d.]+)\s*([kKmMR]?)/);
  if (!m) return null;
  return parseFloat(m[1]) * ({ k: 1e3, K: 1e3, M: 1e6, m: 1e6, R: 1, "": 1 }[m[2]]);
}

/** Código de 5 bandas (1 %): tres cifras, multiplicador y tolerancia marrón. */
function bands(v) {
  const r = ohms(v);
  if (!r) return null;
  let e = Math.floor(Math.log10(r)) - 2, d = Math.round(r / 10 ** e);
  if (d >= 1000) { d = Math.round(d / 10); e += 1; }
  const s = String(d).padStart(3, "0");
  return [+s[0], +s[1], +s[2], e, "tol"];
}

function kind(c) {
  const p = c.ref.replace(/\d+$/, ""), f = c.huella, v = c.valor;
  if (p === "R") return { tipo: "Resistencia", det: `${v}Ω, película metálica, 1 %, 1/4 W` };
  if (p === "RV") return { tipo: "Potenciómetro", det: v.includes("multivuelta") ? "trimmer de ajuste fino" : v.includes("lineal") ? "potenciómetro lineal con eje" : "trimmer" };
  if (p === "C" && f.startsWith("CP_")) return { tipo: "Condensador electrolítico", det: `${v}: polarizado, la banda marca el negativo` };
  if (p === "C" && f.startsWith("C_Rect")) return { tipo: "Condensador de película", det: `${v}: poliéster/polipropileno, estable para integrar` };
  if (p === "C") return { tipo: "Condensador cerámico", det: `${v}: desacoplo junto al integrado` };
  if (p === "U" && v.includes("LF412")) return { tipo: "Amplificador operacional doble", det: "LF412 (entradas JFET), en zócalo DIP-8" };
  if (p === "U" && v.includes("AD633")) return { tipo: "Multiplicador analógico", det: "AD633: W = (X1−X2)(Y1−Y2)/10 + Z, en zócalo DIP-8" };
  if (p === "U") return { tipo: "Regulador de tensión", det: `${v} (TO-220): da los +12 V de la señal OP` };
  if (p === "K") return { tipo: "Relé DPDT", det: "Omron G5V-2, bobina de 12 V: conmuta IC / OPERAR" };
  if (p === "D" && f.startsWith("LED")) return { tipo: "LED", det: v };
  if (p === "D") return { tipo: "Diodo", det: `${v}: rueda libre de la bobina del relé` };
  if (p === "SW") return { tipo: "Interruptor deslizante SPDT", det: v };
  if (p === "J" && f.includes("BNC")) return { tipo: "Conector BNC", det: `${v}: al osciloscopio` };
  if (p === "J") return { tipo: "Conector", det: v };
  if (p === "H") return { tipo: "Agujero de montaje", det: "M3" };
  return { tipo: p, det: v };
}

function marking(c) {
  const f = c.huella, v = c.valor.replace("uF", "µF").replace(" film", "");
  if (c.ref.startsWith("C") && f.startsWith("C_Disc")) return { t: { "100nF": "104", "330nF": "334" }[c.valor] || v, bg: "#d88a2a", fg: "#2a1600" };
  if (c.ref.startsWith("C") && f.startsWith("C_Rect")) return { t: `WIMA\n${v.replace("F", "")}\nMKS2 63V`, bg: "#c8202a", fg: "#ffffff" };
  if (c.ref.startsWith("C") && f.startsWith("CP_")) return { t: v.replace(" ", "\n"), bg: "#1d2a50", fg: "#dfe8ff" };
  if (c.ref.startsWith("K")) return { t: "OMRON\nG5V-2\n12VDC", bg: "#1c1c1c", fg: "#e8e8e8" };
  if (c.ref.startsWith("RV")) return { t: "103", bg: "#2a55c8", fg: "#ffffff" };
  return null;
}

function textTexture(text, wmm, hmm, bg, fg) {
  const k = 48, cv = document.createElement("canvas");
  cv.width = Math.max(64, Math.round(wmm * k)); cv.height = Math.max(32, Math.round(hmm * k));
  const g = cv.getContext("2d");
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); }
  const lines = text.split("\n");
  const fs = Math.min(cv.height / (lines.length * 1.25), cv.width / (Math.max(...lines.map(l => l.length)) * 0.62));
  g.fillStyle = fg; g.font = `600 ${fs}px "Segoe UI", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, cv.width / 2, cv.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.15));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });

/** Caja (en mm) centrada en (x, y) de la placa, desde la altura z0, girada `deg` alrededor de la vertical. */
function box(group, w, d, h, x, y, z0, deg, m) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w * MM, h * MM, d * MM), m);
  o.position.set(x * MM, (z0 + h / 2) * MM, y * MM); o.rotation.y = THREE.MathUtils.degToRad(deg);
  group.add(o); return o;
}

function cyl(group, r, h, x, y, z0, m) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r * MM, r * MM, h * MM, 32), m);
  o.position.set(x * MM, (z0 + h / 2) * MM, y * MM); group.add(o); return o;
}

function topLabel(group, text, cx, cy, ztop, w, d, deg, bg, fg) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w * MM, d * MM),
    new THREE.MeshStandardMaterial({ map: textTexture(text, w, d, bg, fg), roughness: 0.7, transparent: !bg }));
  p.rotation.x = -Math.PI / 2; p.rotation.z = THREE.MathUtils.degToRad(deg);
  p.position.set(cx * MM, ztop * MM + 0.00005, cy * MM); group.add(p); return p;
}

/** Caja que ocupan en el GLB las mallas de la pieza (por su courtyard), en mm. */
function measure(meshes, c) {
  const [x1, y1, x2, y2] = c.courtyard, b = new THREE.Box3();
  let any = false;
  for (const { box: bb, cx, cz } of meshes) {
    if (cx < x1 || cx > x2 || cz < y1 || cz > y2) continue;
    if ((bb.max.x - bb.min.x) / MM > (x2 - x1) * 1.6 + 2 || (bb.max.z - bb.min.z) / MM > (y2 - y1) * 1.6 + 2) continue;
    b.union(bb); any = true;
  }
  return any ? { x1: b.min.x / MM, x2: b.max.x / MM, y1: b.min.z / MM, y2: b.max.z / MM, top: b.max.y / MM } : null;
}

/** Añade al modelo de KiCad todo lo que identifica a cada pieza. */
function dress(root, data) {
  const g = new THREE.Group(); g.name = "detalles"; root.add(g);
  const top = data.placa.grosor;                                  // cara superior de la placa (mm)
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const bb = new THREE.Box3().setFromObject(o);
    meshes.push({ box: bb, cx: (bb.min.x + bb.max.x) / 2 / MM, cz: (bb.min.z + bb.max.z) / 2 / MM });
  });
  const anchors = [];
  for (const c of data.componentes) {
    const m = measure(meshes, c), deg = -c.giro;
    const [x1, y1, x2, y2] = c.courtyard, cw = x2 - x1, ch = y2 - y1, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    let h = m ? m.top : top;
    if (c.ref.startsWith("H")) continue;
    // piezas sin modelo 3D en la biblioteca de KiCad: se dibujan aquí
    if (c.sin_modelo && c.ref.startsWith("SW")) {
      box(g, cw * 0.8, ch * 0.7, 5.5, cx, cy, top, 0, mat("#202020"));
      box(g, cw * 0.55, ch * 0.25, 0.6, cx, cy, top + 5.5, 0, mat("#9aa0a6", { metalness: 0.8, roughness: 0.3 }));
      box(g, 2.2, 2.2, 4.0, cx - cw * 0.12, cy, top + 5.5, 0, mat("#f2f2f2"));
      h = top + 9.5;
    } else if (c.sin_modelo && c.ref.startsWith("RV") && c.huella.includes("RK09")) {
      box(g, Math.min(cw, 10), Math.min(ch, 11), 6.5, cx, cy, top, 0, mat("#5b6168", { metalness: 0.6, roughness: 0.35 }));
      cyl(g, 3, 1.5, cx, cy, top + 6.5, mat("#c9a24a", { metalness: 0.8, roughness: 0.3 }));
      cyl(g, 3, 10, cx, cy, top + 8, mat("#c8ccd0", { metalness: 0.85, roughness: 0.25 }));
      cyl(g, 7, 9, cx, cy, top + 14, mat("#1b1b1b"));
      h = top + 23;
    } else if (c.sin_modelo && c.ref.startsWith("RV")) {
      box(g, 9.5, 4.8, 10, cx, cy, top, deg, mat("#2a55c8"));
      const sc = cyl(g, 1.4, 0.8, cx, cy, top + 10, mat("#d8c070", { metalness: 0.8, roughness: 0.3 }));
      sc.rotation.z = Math.PI / 2;
      topLabel(g, "3386P\n103", cx, cy, top + 10, 7, 3.6, deg, "#2a55c8", "#ffffff");
      h = top + 11;
    }
    const p = c.ref.replace(/\d+$/, "");
    // resistencias: bandas de color sobre el cuerpo
    const bd = p === "R" && c.pads.length === 2 ? bands(c.valor) : null;
    if (bd && m) {
      const [a, b] = c.pads, ax = b.x - a.x, ay = b.y - a.y, L = Math.hypot(ax, ay), ux = ax / L, uy = ay / L;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = (m.top - top) / 2, zc = m.top - r;
      const offs = [-2.15, -1.35, -0.55, 0.25, 2.0];
      bd.forEach((d, i) => {
        const color = d === "tol" ? BAND[1] : d < 0 ? (d === -1 ? "#c9a227" : "#c0c0c0") : BAND[d];
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.07 * MM, r * 1.07 * MM, 0.5 * MM, 32), mat(color, { roughness: 0.45 }));
        ring.position.set((mx + ux * offs[i]) * MM, zc * MM, (my + uy * offs[i]) * MM);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uy));
        g.add(ring);
      });
    }
    // circuitos integrados: el chip sobre el zócalo, con su rótulo y la muesca del pin 1
    if (p === "U" && c.huella.startsWith("DIP")) {
      const z0 = m ? m.top : top + 3, rot = Math.abs(((c.giro % 180) + 180) % 180 - 90) < 1 ? 0 : 90;
      const chip = box(g, rot ? 9.8 : 6.35, rot ? 6.35 : 9.8, 3.3, cx, cy, z0, 0, mat("#17181a", { roughness: 0.7 }));
      const name = c.valor.includes("AD633") ? "AD633JN" : "LF412CN";
      topLabel(g, `${name}\n${c.valor.includes("AD633") ? "ANALOG DEVICES" : "TI  2541"}`, cx, cy, z0 + 3.3, rot ? 8.5 : 5.4, rot ? 5.4 : 8.5, rot ? 0 : 90, null, "#d6d6d6");
      const p1 = c.pads.find(q => q.n === "1");
      if (p1) cyl(g, 0.45, 0.05, cx + (p1.x - cx) * 0.62, cy + (p1.y - cy) * 0.62, z0 + 3.3, mat("#3a3a3a"));
      h = z0 + 3.3;
      chip.userData.ref = c.ref;
    }
    // condensadores, relé y potenciómetros: rótulo en la cara de arriba
    const mk = marking(c);
    if (mk && m && !c.sin_modelo) {
      const w = (m.x2 - m.x1) * 0.82, d = (m.y2 - m.y1) * 0.82;
      topLabel(g, mk.t, (m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, m.top, w, d, 0, mk.bg, mk.fg);
    }
    anchors.push({ c, pos: new THREE.Vector3(cx * MM, (h + 1.5) * MM, cy * MM) });
  }
  return anchors;
}

function card(c) {
  const k = kind(c), bd = c.ref.startsWith("R") && !c.ref.startsWith("RV") ? bands(c.valor) : null;
  const code = bd ? bd.map(d => d === "tol" ? "marrón (1 %)" : d < 0 ? (d === -1 ? "oro" : "plata") : BAND_NAME[d]).join(" · ") : "";
  const sw = bd ? bd.map(d => `<i style="background:${d === "tol" ? BAND[1] : d < 0 ? "#c9a227" : BAND[d]}"></i>`).join("") : "";
  const pins = c.pads.filter(p => p.n).map(p => `<tr><td>${p.n}</td><td>${(p.red || "—").replace(/^\//, "")}</td></tr>`).join("");
  return `<button class="x" title="Cerrar">×</button><h4>${c.ref} <span>${k.tipo}</span></h4>
    <p class="val">${c.valor}</p><p>${k.det}</p>
    ${bd ? `<p class="bands">${sw}</p><p class="small">Bandas: ${code}</p>` : ""}
    <p class="small muted">Huella: ${c.huella}${c.sin_modelo ? " · modelo 3D dibujado por la web (no está en la biblioteca de KiCad)" : ""}</p>
    ${pins ? `<table><thead><tr><th>Pin</th><th>Red</th></tr></thead><tbody>${pins}</tbody></table>` : ""}`;
}

export function viewBoard(container, url, onStatus = () => {}, infoUrl = url.replace(/placa\.glb$/, "componentes.json")) {
  disposeViewer();
  const W = () => container.clientWidth, H = () => container.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  const tags = document.createElement("div"); tags.className = "v3d-tags"; container.appendChild(tags);
  const info = document.createElement("div"); info.className = "v3d-card"; info.hidden = true; container.appendChild(info);
  const bar = document.createElement("div"); bar.className = "v3d-bar";
  bar.innerHTML = `<label><input type="checkbox" checked data-t> Valores</label><button data-v="top">Arriba</button><button data-v="iso">3/4</button>`;
  container.appendChild(bar);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, W() / H(), 0.0005, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334433, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 2, 1.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x99ccff, 0.8); rim.position.set(-1.5, 1, -1); scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true; controls.autoRotateSpeed = 0.8;
  renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false));

  let anchors = [], dist = 1;
  onStatus("Cargando modelo 3D…");
  const infoP = fetch(infoUrl).then(r => r.ok ? r.json() : null).catch(() => null);
  new GLTFLoader().load(url, async gltf => {
    const root = gltf.scene;
    const data = await infoP;
    if (data) {
      try { anchors = dress(root, data); } catch (e) { console.warn("detalles 3D:", e); }
    }
    const box_ = new THREE.Box3().setFromObject(root);
    const size = box_.getSize(new THREE.Vector3()), c = box_.getCenter(new THREE.Vector3());
    root.position.sub(c);
    scene.add(root);
    root.updateMatrixWorld(true);
    anchors.forEach(a => a.pos.sub(c));
    const r = size.length() / 2;
    dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.8;
    camera.position.copy(new THREE.Vector3(0.35, 1.0, 0.85).normalize().multiplyScalar(dist));
    camera.near = r / 100; camera.far = r * 50; camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0); controls.update();
    tags.innerHTML = anchors.map((a, i) => `<button class="v3d-tag" data-i="${i}">${a.c.ref}<span>${a.c.valor.replace(" film", "")}</span></button>`).join("");
    tags.querySelectorAll("button").forEach(b => b.onclick = e => {
      e.stopPropagation(); controls.autoRotate = false;
      info.innerHTML = card(anchors[+b.dataset.i].c); info.hidden = false;
      info.querySelector(".x").onclick = () => (info.hidden = true);
    });
    onStatus("");
  }, ev => {
    if (ev.total) onStatus(`Cargando modelo 3D… ${Math.round(ev.loaded / ev.total * 100)} %`);
  }, err => onStatus("No se pudo cargar el modelo 3D: " + err.message));

  bar.querySelector("[data-t]").onchange = e => tags.classList.toggle("off", !e.target.checked);
  bar.querySelectorAll("[data-v]").forEach(b => b.onclick = () => {
    controls.autoRotate = false;
    const v = b.dataset.v === "top" ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0.35, 1.0, 0.85).normalize();
    camera.position.copy(v.multiplyScalar(camera.position.length())); controls.target.set(0, 0, 0); controls.update();
  });

  const ro = new ResizeObserver(() => {
    renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix();
  });
  ro.observe(container);
  const v = new THREE.Vector3();
  const place = () => {
    const els = tags.children;
    for (let i = 0; i < anchors.length && i < els.length; i++) {
      v.copy(anchors[i].pos).project(camera);
      const hide = v.z > 1;
      els[i].style.transform = `translate(-50%,-100%) translate(${(v.x + 1) / 2 * W()}px,${(1 - v.y) / 2 * H()}px)`;
      els[i].style.visibility = hide ? "hidden" : "";
    }
  };
  const loop = () => { current.raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); place(); };
  current = { renderer, ro, raf: 0, controls };
  loop();
  return {
    resetView: () => { controls.autoRotate = true; },
    topView: () => { const d = camera.position.length(); camera.position.set(0, d, 0.0001); controls.update(); controls.autoRotate = false; },
  };
}
