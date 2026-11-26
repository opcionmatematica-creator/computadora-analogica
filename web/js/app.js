import { MODULES, PROGRAMS, PAPER } from "./data.js";
import { plot } from "./plot.js";
import { SIMS } from "./sims.js";
import { viewBoard, disposeViewer } from "./viewer3d.js";
import { systemSvg, wireList, SYSTEMS } from "./sistema.js";
import { protoSystemSvg, protoWireList } from "./sistema_proto.js";
import { layout as protoLayout, render as protoRender } from "./protoboard.js";
import { P5, P5_DOC, P5_RUBRICA_PRACTICA, measureTable } from "./practica5.js";

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main");
const A = id => `assets/${id}`;
let desktop = false;           // true si corre dentro de la app de escritorio (server.js)

fetch("/api/info").then(r => r.ok && r.json()).then(j => {
  if (j && j.desktop) {
    desktop = true; document.body.classList.add("desktop");
    // vigila la conexión: si el servidor se cae, avisa en vez de mostrar páginas vacías
    const check = () => fetch("/api/ping", { cache: "no-store" })
      .then(r => { if (!r.ok) throw 0; offline(false); }).catch(() => offline(true));
    setInterval(check, 20000);
    window.addEventListener("focus", check);
  }
}).catch(() => {});

function offline(on) {
  const b = document.getElementById("offline");
  if (!b) return;
  b.hidden = !on;
  b.innerHTML = on ? `⚠ Se perdió la conexión con la aplicación (el servidor local está cerrado).
    Cierra esta ventana y vuelve a abrir <b>Computadora Analogica</b> desde el Escritorio.` : "";
}
window.addEventListener("unhandledrejection", e => {
  if (String(e.reason).includes("fetch")) offline(true);
});

function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

async function csv(url) {
  const txt = await (await fetch(url)).text();
  return txt.trim().split(/\r?\n/).map(l => l.match(/("([^"]*)"|[^,]+)/g).map(c => c.replace(/^"|"$/g, "")));
}

// ---------------------------------------------------------------- navegación
function nav() {
  const n = $("#nav");
  n.innerHTML = `
    <a href="#/" data-r="/">Inicio</a>
    <div class="nav-h">Módulos</div>
    ${MODULES.map(m => `<a href="#/m/${m.id}" data-r="/m/${m.id}"><span class="ico">${m.icon}</span>${m.short}<em>×${m.qty}</em></a>`).join("")}
    <div class="nav-h">Programas</div>
    ${PROGRAMS.map(p => `<a href="#/p/${p.id}" data-r="/p/${p.id}"><span class="ico">${p.icon}</span>${p.name.split(" (")[0]}</a>`).join("")}
    <div class="nav-h">Práctica 5 · Transistores</div>
    <a href="#/p5" data-r="/p5"><span class="ico">✎</span>Guía y rúbrica</a>
    ${P5.map(p => `<a href="#/p5/${p.id}" data-r="/p5/${p.id}"><span class="ico">${p.icon}</span>${p.n}. ${p.short}<em>${p.peso}%</em></a>`).join("")}
    <div class="nav-h">Proyecto</div>
    <a href="#/sistema" data-r="/sistema"><span class="ico">⧉</span>Sistema completo</a>
    <a href="#/unidad" data-r="/unidad"><span class="ico">▦</span>Unidad del artículo</a>
    <a href="#/bom" data-r="/bom"><span class="ico">☰</span>Lista total de materiales</a>
    <a href="#/herramientas" data-r="/herramientas"><span class="ico">⚙</span>Herramientas y archivos</a>
    <a href="#/articulo" data-r="/articulo"><span class="ico">📄</span>Artículo original</a>`;
}

function route() {
  disposeViewer();
  const r = location.hash.replace(/^#/, "") || "/";
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("act", r === a.dataset.r || (a.dataset.r.length > 1 && r.startsWith(a.dataset.r + "/"))));
  main.scrollTo(0, 0);
  document.body.classList.remove("menu-open");
  if (r.startsWith("/m/")) {
    const [id, tab] = r.slice(3).split("/");
    return pageModule(MODULES.find(m => m.id === id) || MODULES[0], tab);
  }
  if (r.startsWith("/p/")) return pageProgram(PROGRAMS.find(p => p.id === r.slice(3)) || PROGRAMS[0]);
  if (r.startsWith("/sistema")) return pageSystem(r.split("/")[2]);
  if (r === "/p5") return pageP5Home();
  if (r.startsWith("/p5/")) { const [, , id, tab] = r.split("/"); return pageP5(P5.find(p => p.id === id) || P5[0], tab); }
  ({ "/bom": pageBom, "/herramientas": pageTools, "/articulo": pagePaper, "/unidad": pageUnit }[r] || pageHome)();
}

// ---------------------------------------------------------------- inicio
function pageHome() {
  main.innerHTML = "";
  main.append(h(`
  <section class="hero">
    <div>
      <p class="kicker">Construye tu propia</p>
      <h1>Computadora analógica</h1>
      <p class="lead">Una máquina que resuelve ecuaciones diferenciales <b>en tiempo real</b> con amplificadores operacionales:
      el voltaje <i>es</i> la variable del problema. El proyecto del artículo de <b>${PAPER.author}</b> (${PAPER.year}) está
      dividido aquí en <b>${MODULES.length} módulos</b> que se montan y prueban uno por uno y luego se conectan con cables,
      como en el <i>patch panel</i> de las máquinas de los años 60.</p>
      <div class="hero-btns"><a class="btn" href="#/m/m1_fuente">Empezar por el módulo 1 →</a>
      <a class="btn ghost" href="#/p/prog_caida_libre">Ver un programa</a></div>
    </div>
    <canvas id="heroScope" class="scope hero-scope"></canvas>
  </section>
  <h2>Ruta de montaje</h2>
  <p class="muted">Cada tarjeta tiene esquemático KiCad, PCB, modelo 3D, render de Blender, simulación ngspice, simulador interactivo, lista de piezas, pasos de montaje y prueba.</p>
  <div class="cards">
    ${MODULES.map(m => `
      <a class="card" href="#/m/${m.id}">
        <div class="card-img"><img loading="lazy" src="${A(m.id)}/render.png" onerror="this.src='${A(m.id)}/pcb_top.svg'"></div>
        <div class="card-b"><span class="step">${m.n}</span><h3>${m.short}</h3><p>${esc(m.role.split(". ")[0])}.</p>
        <span class="qty">fabricar ×${m.qty}</span></div>
      </a>`).join("")}
  </div>
  <h2>Cómo funciona, en 3 circuitos</h2>
  <div class="trio">
    <div><b>Σ Sumador</b><p>−Rf·ΣVi/Ri. Suma, resta y multiplica por constantes.</p></div>
    <div><b>∫ Integrador</b><p>−(1/RC)∫Vin dt + Vc. Integra en el tiempo: con él se resuelven ecuaciones diferenciales.</p></div>
    <div><b>× Multiplicador</b><p>X·Y/10. Para términos no lineales, como los de Lorenz.</p></div>
  </div>
  <h2>Pasos para usar la máquina <span class="muted small">(pág. 5 del artículo)</span></h2>
  <ol class="steps">
    <li>Identificar las ecuaciones del problema.</li><li>Dibujar el diagrama de bloques (el «programa»).</li>
    <li>Estimar rangos y escalar magnitudes y tiempo para no pasar de ±13 V.</li><li>Cablear los módulos según el diagrama.</li>
    <li>Pasar a OPERAR y registrar con el osciloscopio.</li><li>Comparar con la solución y repetir.</li>
  </ol>`));
  // traza decorativa: lorenz precalculado por ngspice
  fetch(`${A("sim")}/prog_lorenz.json`).then(r => r.json()).then(j => {
    const c = $("#heroScope"); if (!c) return;
    plot(c, { series: [{ x: j.data.X.slice(300), y: j.data.Z.slice(300), width: 1 }], xlabel: "X (V)", ylabel: "Z (V)", equal: true, xlim: [-2.6, 2.6], ylim: [-0.3, 5.3] });
  });
}

// ---------------------------------------------------------------- módulo
const TABS = [["res", "Resumen"], ["sch", "Esquemático"], ["pcb", "PCB y 3D"], ["sim", "Simulación"], ["mon", "Montaje PCB"], ["proto", "Protoboard"], ["test", "Prueba"], ["files", "Archivos"]];

function pageModule(m, tab) {
  const idx = MODULES.indexOf(m);
  main.innerHTML = "";
  main.append(h(`
    <header class="phead"><span class="step big">${m.n}</span><div><h1>${esc(m.name)}</h1>
    <p class="muted">Fabricar ×${m.qty} · ${esc(m.paper)}</p></div></header>
    <nav class="tabs">${TABS.map(([k, t]) => `<button data-t="${k}">${t}</button>`).join("")}</nav>
    <div id="tab"></div>
    <footer class="pager">
      ${idx > 0 ? `<a href="#/m/${MODULES[idx - 1].id}">← ${MODULES[idx - 1].short}</a>` : "<span></span>"}
      ${idx < MODULES.length - 1 ? `<a href="#/m/${MODULES[idx + 1].id}">${MODULES[idx + 1].short} →</a>` : `<a href="#/p/prog_caida_libre">Programas →</a>`}
    </footer>`));
  const tabs = main.querySelectorAll(".tabs button");
  const show = k => {
    disposeViewer();
    tabs.forEach(b => b.classList.toggle("act", b.dataset.t === k));
    const t = $("#tab"); t.innerHTML = "";
    ({ res: tabRes, sch: tabSch, pcb: tabPcb, sim: tabSim, mon: tabMon, proto: (t, m) => montajeView(t, m), test: tabTest, files: tabFiles }[k])(t, m);
    history.replaceState(null, "", `#/m/${m.id}/${k}`);
    sessionStorage.setItem("tab", k);
  };
  tabs.forEach(b => b.addEventListener("click", () => show(b.dataset.t)));
  show(tab || sessionStorage.getItem("tab") || "res");
}

function tabRes(t, m) {
  t.append(h(`
    <div class="two">
      <div><p class="lead">${esc(m.role)}</p>
        <h3>Ecuaciones</h3>${m.equations.map(e => `<div class="eq">${esc(e)}</div>`).join("")}
        <h3>Conexión al bus</h3><p>Conector de 4 pines: <code>1 +15 V · 2 GND · 3 −15 V · 4 OP</code>. Usa cable plano o dupont desde M1.</p>
      </div>
      <figure class="render"><img src="${A(m.id)}/render.png" onerror="this.src='${A(m.id)}/pcb_top.svg'">
      <figcaption>Render Blender Cycles a partir del modelo 3D exportado de KiCad.</figcaption></figure>
    </div>`));
}

function zoomable(t, src, caption, dark = false) {
  const wrap = h(`<div class="zoom${dark ? " dark" : ""}"><div class="zoom-tools"><button data-z="1.25">＋</button><button data-z="0.8">－</button><button data-z="0">ajustar</button>
    <a href="${src}" target="_blank">abrir</a></div><div class="zoom-view"><img src="${src}" draggable="false"></div>${caption ? `<p class="muted small">${caption}</p>` : ""}</div>`);
  t.append(wrap);
  const view = t.querySelector(".zoom-view:last-of-type") || t.querySelector(".zoom-view"), img = view.querySelector("img");
  let s = 1, x = 0, y = 0, drag = null;
  const ap = () => (img.style.transform = `translate(${x}px,${y}px) scale(${s})`);
  t.querySelectorAll(".zoom-tools button").forEach(b => b.onclick = () => { const z = +b.dataset.z; if (!z) { s = 1; x = y = 0; } else s *= z; ap(); });
  view.addEventListener("wheel", e => { e.preventDefault(); s *= e.deltaY < 0 ? 1.15 : 0.87; ap(); }, { passive: false });
  view.addEventListener("pointerdown", e => { drag = [e.clientX - x, e.clientY - y]; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", e => { if (drag) { x = e.clientX - drag[0]; y = e.clientY - drag[1]; ap(); } });
  view.addEventListener("pointerup", () => (drag = null));
}

// pan + zoom genérico sobre cualquier contenido
function panZoom(view) {
  const inner = view.firstElementChild;
  let s = 1, x = 0, y = 0, drag = null;
  const ap = () => (inner.style.transform = `translate(${x}px,${y}px) scale(${s})`);
  view.addEventListener("wheel", e => {
    e.preventDefault();
    const r = view.getBoundingClientRect(), f = e.deltaY < 0 ? 1.15 : 0.87;
    const px = e.clientX - r.left, py = e.clientY - r.top;      // zoom hacia el cursor
    x = px - (px - x) * f; y = py - (py - y) * f; s *= f; ap();
  }, { passive: false });
  view.addEventListener("pointerdown", e => { if (e.target.closest("a")) return; drag = [e.clientX - x, e.clientY - y]; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", e => { if (drag) { x = e.clientX - drag[0]; y = e.clientY - drag[1]; ap(); } });
  view.addEventListener("pointerup", () => (drag = null));
  return { zoom: f => { s *= f; ap(); }, reset: () => { s = 1; x = y = 0; ap(); } };
}

// ---------------------------------------------------------------- sistema completo
function pageSystem(tab) {
  tab = tab || "cableado";
  main.innerHTML = "";
  main.append(h(`
    <header class="phead"><span class="step big">⧉</span><div><h1>Sistema completo</h1>
    <p class="muted">La máquina entera: todos los módulos, su bus de alimentación y el cableado pin a pin de cada programa, y el esquemático completo.</p></div></header>
    <nav class="tabs"><button data-t="cableado">Conexión de módulos</button><button data-t="protoboards">Protoboards conectadas</button><button data-t="esquematico">Esquemático completo</button></nav>
    <div id="tab"></div>`));
  main.querySelectorAll(".tabs button").forEach(b => {
    b.classList.toggle("act", b.dataset.t === tab);
    b.onclick = () => { location.hash = `#/sistema/${b.dataset.t}`; };
  });
  const t = $("#tab");
  if (tab === "esquematico") return systemSchematic(t);
  if (tab === "protoboards") return systemProto(t);
  const progs = Object.keys(SYSTEMS);
  let prog = sessionStorage.getItem("sysprog") || progs[0];
  t.append(h(`
    <div class="sys-bar">${progs.map(p => `<button class="toggle${p === prog ? " on" : ""}" data-p="${p}">${SYSTEMS[p].name}</button>`).join("")}
      <span class="grow"></span><button class="iconbtn" data-z="1.25">＋</button><button class="iconbtn" data-z="0.8">－</button><button class="iconbtn" data-z="0">⤢</button></div>
    <div class="sys-view"><div id="sysSvg"></div></div>
    <p class="muted small">Cada caja es un módulo con los nombres de pin de su serigrafía (clic en el título para ir al módulo). Los colores identifican cada señal; pasa el ratón por un cable para ver su origen y destino. Las líneas grises de arriba son el bus de alimentación que sale de M1.</p>
    <h3>Lista de conexiones</h3><ol class="steps check" id="wl"></ol>`));
  const pz = panZoom($(".sys-view"));
  const draw = () => {
    $("#sysSvg").innerHTML = systemSvg(prog);
    $("#wl").innerHTML = wireList(prog).map(w => `<li><label><input type="checkbox"> ${esc(w)}</label></li>`).join("");
    t.querySelectorAll("[data-p]").forEach(b => b.classList.toggle("on", b.dataset.p === prog));
    pz.reset();
  };
  t.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { prog = b.dataset.p; sessionStorage.setItem("sysprog", prog); draw(); });
  t.querySelectorAll("[data-z]").forEach(b => b.onclick = () => (+b.dataset.z ? pz.zoom(+b.dataset.z) : pz.reset()));
  // resaltar una señal entera al pasar el ratón
  $("#sysSvg").addEventListener("mouseover", e => {
    const n = e.target.dataset && e.target.dataset.net;
    $("#sysSvg").querySelectorAll("path.w").forEach(p => p.classList.toggle("dim", !!n && p.dataset.net !== n));
  });
  draw();
}

// todas las protoboards de un programa, con los cables que las unen (capturas de los montajes paso a paso)
async function systemProto(t) {
  const progs = Object.keys(SYSTEMS);
  let prog = sessionStorage.getItem("sysprog") || progs[0];
  t.append(h(`
    <div class="sys-bar">${progs.map(p => `<button class="toggle${p === prog ? " on" : ""}" data-p="${p}">${SYSTEMS[p].name}</button>`).join("")}
      <span class="grow"></span><a class="btn ghost" id="psDl" download>Descargar imagen (SVG)</a>
      <button class="iconbtn" data-z="1.25">＋</button><button class="iconbtn" data-z="0.8">－</button><button class="iconbtn" data-z="0">⤢</button></div>
    <div class="sys-view paper ps-view"><div id="psSvg"></div></div>
    <p class="muted small">Cada protoboard es la del montaje paso a paso de su módulo, ya terminada (clic en una para abrir su animación).
      Los cables salen de los bornes de arriba (salidas) y de abajo (entradas) y van por los pasillos entre protoboards; pasa el ratón por un cable
      para resaltar su señal. Arriba, el <b>bus de alimentación</b> de M1 une los rieles +15 V, GND y −15 V de todas; la línea naranja <b>OP</b>
      lleva el modo IC/OPERAR a cada integrador. Rueda = zoom hacia el cursor, arrastrar = mover.</p>
    <h3>Cables entre protoboards</h3><ol class="steps check" id="psl"></ol>`));
  const geo = await (await fetch(`${A("sistema")}/proto/geometria.json`)).json();
  const pz = panZoom($(".ps-view"));
  const draw = () => {
    const svg = protoSystemSvg(prog, geo);
    $("#psSvg").innerHTML = svg;
    $("#psl").innerHTML = protoWireList(prog, geo).map(w => `<li><label><input type="checkbox"> ${esc(w)}</label></li>`).join("");
    t.querySelectorAll("[data-p]").forEach(b => b.classList.toggle("on", b.dataset.p === prog));
    // descarga: la imagen con las protoboards incrustadas, para abrirla fuera de la app
    const a = $("#psDl");
    a.download = `protoboards_${prog}.svg`; a.removeAttribute("href");
    Promise.all([...new Set([...svg.matchAll(/href="([^"]+\.png)"/g)].map(m => m[1]))].map(async u =>
      [u, await new Promise(async r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(await (await fetch(u)).blob()); })]))
      .then(list => { let s = svg; for (const [u, d] of list) s = s.split(`href="${u}"`).join(`href="${d}"`);
        a.href = URL.createObjectURL(new Blob([s.replace(/<a href="#[^"]*">/g, "<a>")], { type: "image/svg+xml" })); });
    pz.reset();
    requestAnimationFrame(() => {   // encajar la imagen entera en la vista
      const v = $(".ps-view"), w = $("#psSvg svg").viewBox.baseVal.width;
      if (w) pz.zoom(Math.min(1, v.clientWidth / w));
    });
  };
  t.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { prog = b.dataset.p; sessionStorage.setItem("sysprog", prog); draw(); });
  t.querySelectorAll("[data-z]").forEach(b => b.onclick = () => (+b.dataset.z ? pz.zoom(+b.dataset.z) : pz.reset()));
  $("#psSvg").addEventListener("mouseover", e => {
    const n = e.target.dataset && e.target.dataset.net;
    $("#psSvg").querySelectorAll("[data-net]").forEach(p => p.classList.toggle("dim", !!n && p.dataset.net !== n));
  });
  draw();
}

function systemSchematic(t) {
  t.append(h(`
    <div class="sys-bar"><a class="btn" href="assets/sistema/esquematico_completo.pdf" target="_blank">PDF del esquemático completo</a>
      <span class="grow"></span><button class="iconbtn" data-z="1.25">＋</button><button class="iconbtn" data-z="0.8">－</button><button class="iconbtn" data-z="0">⤢</button></div>
    <div class="sys-view paper"><div class="sch-grid">
      ${MODULES.map(m => `<figure><figcaption><a href="#/m/${m.id}/sch">${esc(m.name)}</a> <span>×${m.qty}</span></figcaption>
        <img src="${A(m.id)}/esquematico.svg" draggable="false"></figure>`).join("")}
    </div></div>
    <p class="muted small">Los 7 esquemáticos KiCad de la máquina juntos. Los módulos se unen entre sí solo por el <b>bus de 4 hilos</b> (+15 V, GND, −15 V, OP) y por los cables de cada programa (pestaña «Conexión de módulos»). Rueda = zoom hacia el cursor, arrastrar = mover.</p>`));
  const pz = panZoom($(".sys-view"));
  t.querySelectorAll("[data-z]").forEach(b => b.onclick = () => (+b.dataset.z ? pz.zoom(+b.dataset.z) : pz.reset()));
}

function tabSch(t, m) {
  zoomable(t, `${A(m.id)}/esquematico.svg`, "Esquemático KiCad 10 generado por <code>hardware/gen_schematics.py</code> y verificado contra el netlist de KiCad y el ERC (0 errores). Rueda = zoom, arrastrar = mover.");
}

function tabPcb(t, m) {
  t.append(h(`<div class="two">
    <div><h3>Modelo 3D interactivo</h3><div class="v3d" id="v3d"><div class="v3d-msg" id="v3dmsg"></div></div>
      <p class="muted small">Arrastra para girar, rueda para zoom. Modelo GLB exportado por <code>kicad-cli pcb export glb</code>, con los modelos 3D de KiCad.</p></div>
    <div><h3>Capa superior</h3><div id="pcbz"></div></div></div>`));
  zoomable($("#pcbz"), `${A(m.id)}/pcb_top.svg`, "Colocación por bloques en el orden de la señal. Serigrafía con el nombre de cada pin. <b>Sin rutear todavía</b>: ver «Herramientas».", true);
  viewBoard($("#v3d"), `${A(m.id)}/placa.glb`, s => { const e = $("#v3dmsg"); if (e) e.textContent = s; });
}

async function tabSim(t, m) {
  t.append(h(`<h3>Simulador interactivo</h3><p class="muted small">Modelo ideal con la saturación del LF412 (±13.5 V). Mueve los controles.</p><div id="live"></div>
    <h3>Simulación ngspice del circuito</h3><div id="spice"></div>`));
  SIMS[m.sim]($("#live"));
  const box = $("#spice");
  try {
    if (m.id === "m1_fuente") throw 0;      // M1 es lógica de control: no tiene simulación SPICE
    const j = await (await fetch(`${A("sim")}/${m.id}.json`)).json();
    spicePlot(box, j, m.id);
  } catch { box.innerHTML = `<p class="muted">Este módulo no tiene simulación SPICE (es lógica de control). Prueba el simulador de arriba.</p>`; }
}

// ---------------------------------------------------------------- Práctica 5
async function p5Results() {
  if (!p5Results.cache) p5Results.cache = await (await fetch(`${A("sim")}/p5_resumen.json`)).json();
  return p5Results.cache;
}

function pageP5Home() {
  main.innerHTML = "";
  main.append(h(`
    <header class="phead"><span class="step big">✎</span><div><h1>Práctica 5: aplicaciones de los transistores</h1>
    <p class="muted">Taller IV: Electrónica Análoga (3006875) · Departamento de Física · UNAL Medellín · 2026-II</p></div></header>
    <p class="lead">Práctica <b>evaluada oralmente</b>: el profesor pregunta por el comportamiento de los componentes y por las señales de cada punto. Todo dato, tabla, gráfica, foto del montaje, simulación y análisis cuenta, pero <b>solo si queda registrado en el documento</b>. Aquí tienes, para cada punto, la teoría, los cálculos, el esquemático KiCad, la simulación ngspice, el montaje en protoboard y una tabla para tus mediciones.</p>
    <div class="cards">${P5.map(p => `<a class="card" href="#/p5/${p.id}"><div class="card-b"><span class="step">${p.n}</span><h3>${esc(p.short)}</h3>
      <p>${esc(p.enunciado.split(". ")[0])}.</p><span class="qty">${p.peso} % de la nota</span></div></a>`).join("")}</div>
    <h2>Rúbrica</h2>
    <h3>A. Puntos de la práctica: 80 %</h3>
    <div class="tbl"><table><thead><tr><th>Punto</th><th>Peso</th><th>Debe evidenciar</th></tr></thead>
      ${P5.map(p => `<tr><td><a href="#/p5/${p.id}">${p.n}. ${esc(p.short)}</a></td><td>${p.peso} %</td><td>${p.rubrica.map(esc).join("; ")}.</td></tr>`).join("")}</table></div>
    <h3>B. Desempeño práctico en el laboratorio: 20 % (debe verse en las fotos y en el documento)</h3>
    <div class="tbl"><table><thead><tr><th>Criterio</th><th>Peso</th><th>Qué se evalúa</th></tr></thead>
      ${P5_RUBRICA_PRACTICA.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table></div>
    <h3>Materiales</h3>
    <p>Transistores 2N3904 (×6) y 2N3906 (×1); BD139 (×2) y BD140 (×2); diodos 1N4007 (×5); LED rojos (×3); condensadores electrolíticos de 10 µF (×2); potenciómetros de 10 kΩ (×1) y 50 kΩ (×2); buzzer de 5 V; motor DC de 6–9 V. Resistencias: 24 Ω o el buzzer, 33 Ω, 68 Ω, 100 Ω, 180 Ω ½ W (×2), 200 Ω, 220 Ω, 330 Ω, 470 Ω, 680 Ω, 820 Ω (×2), 1 kΩ (×12), 2.2 kΩ (×2), 10 kΩ (×3) y 15 kΩ. También protoboard, cables (rojo, negro o verde y otros colores), fuente DC doble, multímetro y osciloscopio.</p>
    <p><a class="btn ghost" href="${P5_DOC}" target="_blank">Ver el enunciado original (PDF)</a></p>`));
}

const P5TABS = [["guia", "Guía y respuestas"], ["sch", "Esquemático"], ["sim", "Simulación"], ["proto", "Protoboard"], ["med", "Mediciones"], ["rub", "Rúbrica"], ["files", "Archivos"]];
async function pageP5(p, tab) {
  tab = tab || "guia";
  const R = await p5Results();
  main.innerHTML = "";
  main.append(h(`<header class="phead"><span class="step big">${p.n}</span><div><h1>${esc(p.name)}</h1><p class="muted">${p.peso} % de la nota · Práctica 5</p></div></header>
    <div class="tip"><b>Enunciado:</b> ${esc(p.enunciado)}</div>
    <nav class="tabs">${P5TABS.map(([k, n]) => `<button data-t="${k}" class="${k === tab ? "act" : ""}">${n}</button>`).join("")}</nav><div id="tab"></div>
    <footer class="pager">${p.n > 1 ? `<a href="#/p5/${P5[p.n - 2].id}">← Punto ${p.n - 1}</a>` : `<a href="#/p5">← Guía</a>`}
      ${p.n < P5.length ? `<a href="#/p5/${P5[p.n].id}">Punto ${p.n + 1} →</a>` : "<span></span>"}</footer>`));
  main.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { location.hash = `#/p5/${p.id}/${b.dataset.t}`; });
  const t = $("#tab");
  if (tab === "guia") t.append(h(p.body(R)));
  if (tab === "sch") zoomable(t, `${A(p.id)}/esquematico.svg`, "Esquemático KiCad 10 generado por <code>hardware/gen_practica5.py</code>, verificado contra el netlist de KiCad, con ERC sin errores.");
  if (tab === "sim") for (const s of p.sims) spicePlot(t, await (await fetch(`${A("sim")}/${s}.json`)).json(), s);
  if (tab === "proto") protoView(t, p.id);
  if (tab === "med") { t.append(h(`<p>Anota aquí lo que midas en el laboratorio y compáralo con la simulación. Para la nota, cópialo a tu documento con fotos del montaje y capturas del osciloscopio.</p><div id="mt"></div>`)); measureTable($("#mt"), p.id, p.tabla, esc); }
  if (tab === "rub") {
    t.append(h(`<h3>Lo que debe evidenciar este punto (${p.peso} %)</h3><ol class="steps check">${p.rubrica.map(r => `<li><label><input type="checkbox" data-r> ${esc(r)}</label></li>`).join("")}</ol>
      <h3>Desempeño práctico (20 % de la práctica)</h3><ol class="steps check">${P5_RUBRICA_PRACTICA.map(r => `<li><label><input type="checkbox"> <b>${r[0]}:</b> ${r[2]}</label></li>`).join("")}</ol>`));
    t.querySelectorAll("input").forEach((c, i) => {
      const k = `p5rub:${p.id}:${i}`;
      try { c.checked = localStorage.getItem(k) === "1"; } catch {}
      c.onchange = () => { try { localStorage.setItem(k, c.checked ? "1" : "0"); } catch {} };
    });
  }
  if (tab === "files") t.append(h(`<div class="files">
    ${[["kicad.zip", "Proyecto KiCad (esquemático)"], ["esquematico.pdf", "Esquemático en PDF"], ["bom.csv", "Lista de materiales (CSV)"]].map(([n, d]) => `<a class="file" href="${A(p.id)}/${n}" download><b>${n}</b><span>${d}</span></a>`).join("")}
    <a class="file" href="${P5_DOC}" target="_blank"><b>Enunciado (PDF)</b><span>Práctica 5 original</span></a></div>
    <p class="muted small">Las simulaciones de este punto (netlist <code>.cir</code>, datos <code>.csv</code> y gráfica <code>.png</code>) están en <code>simulaciones/practica5/</code>.</p>`));
}

function spicePlot(box, j, id) {
  const c = document.createElement("canvas"); c.className = "scope"; box.append(c);
  const series = j.data.series.map(s => ({ name: s.name, x: s.xs || j.data.x, y: s.y, dash: s.xs ? [6, 4] : undefined }));
  plot(c, { series, xlabel: j.meta.xlabel, ylabel: j.meta.ylabel, logx: j.data.logx, equal: j.data.xy });
  box.append(h(`<p class="caption"><b>${esc(j.meta.title)}</b> ${esc(j.meta.note || "")} <a href="../${j.meta.carpeta}/circuito.cir" download>netlist (.cir)</a> · <a href="../${j.meta.carpeta}/datos.csv" download>datos (.csv)</a> · <code>${esc(j.meta.carpeta)}</code></p>`));
}

// montaje en protoboard paso a paso (web/montaje/, hecho con la skill protoboard-paso-a-paso y verificado contra el netlist)
function montajeView(t, m) {
  const src = `montaje/montaje_${m.id}.html`;
  t.append(h(`<div class="sys-bar"><span class="muted small">Animación paso a paso: ▶ o las flechas ← → avanzan; toca cualquier pieza o cable para ver
      su ficha (qué es, en qué huecos va y a qué se une). Al final hay una prueba interactiva.</span><span class="grow"></span>
      <a class="btn ghost" href="${src}" target="_blank">Abrir en pantalla completa</a></div>
    <iframe class="montaje" src="${src}" title="Montaje en protoboard de ${esc(m.name)}" loading="lazy"></iframe>
    <p class="muted small">Las conexiones de esta protoboard se compararon automáticamente con el netlist del esquemático KiCad
      (<code>web/montaje/${m.id}.redes.json</code>): mismos nodos, sin huecos repetidos y cables rectos.
      Cómo se une con las demás protoboards: <a href="#/sistema/protoboards">Sistema completo → Protoboards conectadas</a>.</p>`));
}

// montaje en protoboard (generado del netlist de KiCad)
export async function protoView(t, id, intro = "") {
  t.append(h(`<div class="tip"><b>Código de colores</b> (rúbrica): <span class="cc r">rojo</span> = alimentación ·
    <span class="cc k">negro</span>/<span class="cc g">verde</span> = tierra · cualquier otro color = señal. Cables cortos y pegados a la protoboard; arma primero los rieles.</div>
    ${intro}
    <div class="sys-bar"><span class="muted small">Pasa el ratón por un cable para resaltar su conexión. Rueda = zoom, arrastrar = mover.</span><span class="grow"></span>
      <button class="iconbtn" data-z="1.25">＋</button><button class="iconbtn" data-z="0.8">－</button><button class="iconbtn" data-z="0">⤢</button></div>
    <div class="sys-view proto-view"><div id="pbx"></div></div>
    <h3>Paso a paso (coordenadas: fila + columna, p. ej. <code>c12</code>)</h3><ol class="steps check" id="pbs"></ol>
    <p class="muted small">Disposición calculada automáticamente del netlist de KiCad, así que las conexiones son las del esquemático. Antes de energizar, comprueba con el multímetro en continuidad que no haya cortos entre los rieles.</p>`));
  try {
    const net = await (await fetch(`${A(id)}/netlist.json`)).json();
    const L = protoLayout(net);
    $("#pbx").innerHTML = protoRender(L);
    $("#pbs").innerHTML = L.steps.map(s => `<li><label><input type="checkbox"> ${esc(s)}</label></li>`).join("");
    const pz = panZoom($(".proto-view"));
    t.querySelectorAll("[data-z]").forEach(b => b.onclick = () => (+b.dataset.z ? pz.zoom(+b.dataset.z) : pz.reset()));
    $("#pbx").addEventListener("mouseover", e => {
      const n = e.target.dataset && e.target.dataset.net;
      $("#pbx").querySelectorAll("path.wire").forEach(p => p.classList.toggle("dim", !!n && p.dataset.net !== n));
    });
  } catch (e) { $("#pbx").innerHTML = `<p class="muted" style="padding:20px">No se pudo generar el montaje: ${esc(e.message)}</p>`; }
}

async function tabMon(t, m) {
  t.append(h(`<h3>Lista de materiales</h3><div id="bom" class="tbl"></div><h3>Pasos de montaje</h3>
    <ol class="steps">${m.build.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    <div class="tip"><b>Consejo:</b> monta y prueba los módulos en orden (M1 → M7). Así, si algo falla, sabes que es el último módulo montado.</div>`));
  const rows = await csv(`${A(m.id)}/bom.csv`);
  $("#bom").innerHTML = `<table><thead><tr><th>Cant.</th><th>Valor</th><th>Referencias</th><th>Encapsulado</th></tr></thead><tbody>
    ${rows.slice(1).map(r => `<tr><td>${r[3]}</td><td><b>${esc(r[1])}</b></td><td>${esc(r[0])}</td><td class="small">${esc(r[2].split(":")[1] || r[2])}</td></tr>`).join("")}</tbody></table>`;
}

function tabTest(t, m) {
  t.append(h(`<h3>Prueba del módulo</h3><ol class="steps check">${m.test.map(s => `<li><label><input type="checkbox"> ${esc(s)}</label></li>`).join("")}</ol>
    <div id="expect"></div>`));
  fetch(`${A("sim")}/resumen.json`).then(r => r.json()).then(r => {
    const map = {
      m2_condicion_inicial: `Rango simulado de IC_OUT: ${r.m2_ic_range.map(v => v.toFixed(1)).join(" a ")} V.`,
      m3_integrador: `ngspice: nivel IC ${r.m3_ic_level.toFixed(3)} V (esperado −2 V), pendiente ${r.m3_slope_V_per_s.toFixed(4)} V/s (esperado −1 V/s).`,
      m4_sumador: `ngspice: error máximo de la suma ${r.m4_err_mV.toFixed(3)} mV.`,
      m6_filtro_salida: `ngspice: −3 dB a ${r.m6_fc_Hz.toFixed(0)} Hz.`,
    };
    if (map[m.id]) $("#expect").innerHTML = `<div class="tip"><b>Valor de referencia:</b> ${map[m.id]}</div>`;
  });
}

function tabFiles(t, m) {
  const f = [
    ["kicad.zip", "Proyecto KiCad completo (esquemático + PCB)"], ["esquematico.pdf", "Esquemático en PDF"],
    ["bom.csv", "Lista de materiales (CSV)"], ["placa.glb", "Modelo 3D (GLB)"], ["render.png", "Render Blender"], ["pcb_top.svg", "PCB, capa superior (SVG)"],
  ];
  t.append(h(`<div class="files">${f.map(([n, d]) => `<a class="file" href="${A(m.id)}/${n}" download><b>${n}</b><span>${d}</span></a>`).join("")}
    ${m.id === "m1_fuente" ? "" : `<a class="file" href="../simulaciones/" target="_blank"><b>simulaciones/</b><span>Netlist, datos CSV y gráfica de la simulación</span></a>`}</div>
    <div class="desk-only"><h3>Abrir con las herramientas</h3>
      <button class="btn" data-a="kicad">Abrir en KiCad</button> <button class="btn ghost" data-a="folder">Abrir la carpeta</button>
      <p class="muted small" id="actmsg"></p></div>
    <p class="muted small web-only">Abre la aplicación de escritorio (<code>Computadora Analogica.bat</code>) para abrir los proyectos directamente en KiCad.</p>`));
  t.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
    const r = await fetch(`/api/${b.dataset.a}?mod=${m.id}`, { method: "POST" });
    $("#actmsg").textContent = r.ok ? "Abierto." : "No se pudo abrir: " + (await r.text());
  });
}

// ---------------------------------------------------------------- programas
function patchSvg(p) {
  const bw = 150, bh = 52;
  const W = 900, H = Math.max(...p.nodes.map(n => n.y)) + bh + 30;
  const N = Object.fromEntries(p.nodes.map(n => [n.id, n]));
  const C = n => [n.x + bw / 2, n.y + bh / 2];
  // punto del borde de la caja n en la dirección (dx, dy)
  const side = (n, dx, dy) => {
    const [cx, cy] = C(n);
    if (Math.abs(dx) * bh > Math.abs(dy) * bw) return [cx + Math.sign(dx) * bw / 2, cy];
    return [cx, cy + Math.sign(dy) * bh / 2];
  };
  let s = `<svg viewBox="0 0 ${W} ${H}" class="patch"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="currentColor"/></marker></defs>`;
  let labels = "";
  for (const [a, b, lab, bend = 0, sideHint] of p.edges) {
    const A_ = N[a], B_ = N[b];
    if (a === b) {
      const x = A_.x + bw - 26, y = A_.y;
      s += `<path class="wire" d="M${x},${y} C${x + 40},${y - 48} ${x - 60},${y - 48} ${x - 34},${y}" marker-end="url(#ar)"/>`;
      labels += `<text class="wl" x="${x - 8}" y="${y - 40}" text-anchor="middle">${esc(lab)}</text>`;
      continue;
    }
    const [ax0, ay0] = C(A_), [bx0, by0] = C(B_);
    const [x1, y1] = side(A_, bx0 - ax0, by0 - ay0), [x2, y2] = side(B_, ax0 - bx0, ay0 - by0);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const qx = (x1 + x2) / 2 + nx * bend * 2, qy = (y1 + y2) / 2 + ny * bend * 2;
    s += `<path class="wire" d="M${x1},${y1} Q${qx},${qy} ${x2},${y2}" marker-end="url(#ar)"/>`;
    const lx = 0.25 * x1 + 0.5 * qx + 0.25 * x2, ly = 0.25 * y1 + 0.5 * qy + 0.25 * y2;
    const off = Math.abs(nx) > Math.abs(ny) ? 0 : 1;       // líneas horizontales: etiqueta encima
    const right = sideHint ? sideHint === "R" : nx > 0;
    labels += `<text class="wl" x="${lx + (off ? 0 : (right ? 8 : -8))}" y="${ly + (off ? -7 : 4)}" text-anchor="${off ? "middle" : (right ? "start" : "end")}">${esc(lab)}</text>`;
  }
  for (const n of p.nodes) {
    const [l1, l2] = n.label.split("\n");
    s += `<g class="blk"><rect x="${n.x}" y="${n.y}" width="${bw}" height="${bh}" rx="8"/><text x="${n.x + bw / 2}" y="${n.y + 22}" class="b1">${esc(l1)}</text><text x="${n.x + bw / 2}" y="${n.y + 40}" class="b2">${esc(l2 || "")}</text></g>`;
  }
  return s + labels + "</svg>";
}

async function pageProgram(p) {
  main.innerHTML = "";
  main.append(h(`
    <header class="phead"><span class="step big">${p.icon}</span><div><h1>Programa: ${esc(p.name)}</h1><p class="muted">${esc(p.paper)}</p></div></header>
    <div class="two"><div><h3>Ecuaciones</h3>${p.equations.map(e => `<div class="eq">${esc(e)}</div>`).join("")}</div>
    <div><h3>Módulos necesarios</h3><ul class="needs">${Object.entries(p.needs).map(([id, q]) => {
      const m = MODULES.find(x => x.id === id); return `<li><a href="#/m/${id}">${m.icon} ${m.short}</a> <b>×${q}</b></li>`; }).join("")}</ul></div></div>
    <h3>Diagrama de cableado (el «programa»)</h3>${patchSvg(p)}
    <h3>Conexiones paso a paso</h3><ol class="steps check">${p.wiring.map(w => `<li><label><input type="checkbox"> ${esc(w)}</label></li>`).join("")}</ol>
    <div class="tip">${esc(p.note)}</div>
    <h3>Simulador interactivo</h3><div id="live"></div>
    <h3>Simulación ngspice del circuito completo</h3><div id="spice"></div>`));
  SIMS[p.id]($("#live"));
  const box = $("#spice");
  if (p.id === "prog_lorenz") {
    const j = await (await fetch(`${A("sim")}/prog_lorenz.json`)).json();
    const c = document.createElement("canvas"); c.className = "scope"; box.append(c);
    plot(c, { series: [{ name: "X vs Z (ngspice, 30 s)", x: j.data.X, y: j.data.Z, width: 1 }], xlabel: j.meta.xlabel, ylabel: j.meta.ylabel, equal: true });
    box.append(h(`<p class="caption">${esc(j.meta.note)} <a href="../${j.meta.carpeta}/circuito.cir" download>netlist (.cir)</a> · <code>${esc(j.meta.carpeta)}</code></p>`));
  } else {
    for (const id of ["prog_caida_libre", "prog_caida_libre_g12"]) spicePlot(box, await (await fetch(`${A("sim")}/${id}.json`)).json(), id);
    const r = await (await fetch(`${A("sim")}/resumen.json`)).json();
    const c = r.caida_libre;
    box.append(h(`<table class="tbl"><thead><tr><th>Medida</th><th>Artículo (circuito real)</th><th>ngspice</th><th>Teoría</th></tr></thead><tbody>
      <tr><td>Altura máxima desde el suelo</td><td>2 + 2.3 = 4.3 m</td><td>${c.Hmax_sim.toFixed(3)} m</td><td>${c.Hmax_teo.toFixed(3)} m</td></tr>
      <tr><td>Error</td><td>≈ 10 % (Tabla 1)</td><td>${(Math.abs(c.Hmax_sim - c.Hmax_teo) / c.Hmax_teo * 100).toFixed(3)} %</td><td>—</td></tr></tbody></table>
      <p class="muted small">El artículo atribuye su 10 % a la tolerancia acumulada de las resistencias de 1 % y a una fuente que variaba un 10 %. La simulación usa valores exactos: monta con resistencias de 0.1 % en las entradas de 1 MΩ si quieres acercarte.</p>`));
  }
}

// ---------------------------------------------------------------- unidad del artículo
function pageUnit() {
  main.innerHTML = "";
  main.append(h(`<header class="phead"><span class="step big">▦</span><div><h1>La placa del artículo = M2 + M3 + M4</h1>
    <p class="muted">Fig. 5, 7 y 8: cada una de las 3 placas originales tenía un integrador, un seguidor de condición inicial y un sumador.</p></div></header>
    <div class="two"><div><p class="lead">Johnson metió en cada placa <b>dos LF412</b>: IC1 (integrador + buffer de salida) e IC2 (sumador + seguidor de condición inicial),
    con borneras como patch panel y conectores D para unir las 3 placas. Aquí cada función es un módulo propio:</p>
    <table class="tbl"><thead><tr><th>Artículo (Fig. 5)</th><th>Este proyecto</th></tr></thead><tbody>
    <tr><td>IC1A + R1–R7 + C1/C2 + relé I.C.</td><td><a href="#/m/m3_integrador">M3 Integrador</a> (U1A, K1, SW1)</td></tr>
    <tr><td>IC1B (seguidor de salida)</td><td>M3 (U1B, buffer)</td></tr>
    <tr><td>IC2B + R8 (potenciómetro de IC)</td><td><a href="#/m/m2_condicion_inicial">M2 Condición inicial</a></td></tr>
    <tr><td>IC2A + R9–R15</td><td><a href="#/m/m4_sumador">M4 Sumador</a></td></tr>
    <tr><td>J12/J13 (DB9, ±15 V y relé)</td><td>Bus de 4 pines + <a href="#/m/m1_fuente">M1</a></td></tr>
    <tr><td>Potenciómetros externos</td><td><a href="#/m/m5_coeficientes">M5 Coeficientes</a></td></tr>
    <tr><td>Filtro RC de salida (pág. 15)</td><td><a href="#/m/m6_filtro_salida">M6</a></td></tr>
    <tr><td>AD633 de Lorenz (Fig. 18)</td><td><a href="#/m/m7_multiplicador">M7</a></td></tr></tbody></table>
    <h3>Cambios respecto al original</h3><ul class="steps">
      <li>Las ganancias de las entradas se nombran por su valor real (k = 1/RC); el artículo llamaba «x0.1» a la entrada de 1 MΩ.</li>
      <li>Diodo 1N4148 en la bobina del relé (el original no lo lleva) y un control OP común para todos los relés.</li>
      <li>Mitades de LF412 sin usar conectadas como seguidor a GND.</li>
      <li>Conectores de pines de 2.54 mm en vez de borneras: se cablea con dupont, como en una protoboard.</li></ul></div>
    <figure class="render"><img src="${A("ref")}/fig5_esquema_original.png"><figcaption>Fig. 5 del artículo: esquemático original (Eagle 7.2).</figcaption></figure></div>`));
}

// ---------------------------------------------------------------- BOM total
async function pageBom() {
  main.innerHTML = `<header class="phead"><span class="step big">☰</span><div><h1>Lista total de materiales</h1><p class="muted">Para una máquina completa capaz de correr los dos programas (cantidades × número de módulos).</p></div></header><div id="tb" class="tbl"></div>`;
  const tot = {};
  for (const m of MODULES) {
    const rows = (await csv(`${A(m.id)}/bom.csv`)).slice(1);
    for (const r of rows) {
      const k = r[1] + "|" + (r[2].split(":")[1] || r[2]);
      tot[k] = tot[k] || { v: r[1], fp: r[2].split(":")[1] || r[2], n: 0, where: [] };
      tot[k].n += +r[3] * m.qty; tot[k].where.push(`M${m.n}×${+r[3] * m.qty}`);
    }
  }
  const rows = Object.values(tot).sort((a, b) => a.fp.localeCompare(b.fp));
  $("#tb").innerHTML = `<table><thead><tr><th>Total</th><th>Valor</th><th>Encapsulado</th><th>Dónde</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${r.n}</b></td><td>${esc(r.v)}</td><td class="small">${esc(r.fp)}</td><td class="small">${r.where.join(" · ")}</td></tr>`).join("")}</tbody></table>
    <p class="muted small">Además: fuente de laboratorio doble ±15 V, osciloscopio con modo X-Y (o una tarjeta de adquisición, como el myDAQ del artículo), cables dupont y, para Lorenz, resistencias externas de 100 kΩ, 35.7 kΩ y 374 kΩ (1 %).</p>`;
}

// ---------------------------------------------------------------- herramientas
function pageTools() {
  main.innerHTML = "";
  main.append(h(`<header class="phead"><span class="step big">⚙</span><div><h1>Herramientas y flujo de trabajo</h1><p class="muted">Todo se genera con scripts: si cambias un valor, lo vuelves a generar.</p></div></header>
  <div class="pipeline">
    <div><b>1 · KiCad 10</b><code>hardware/gen_schematics.py</code><p>Esquemáticos (schlib), verificados contra el netlist de KiCad y el ERC.</p></div>
    <div><b>2 · KiCad PCB</b><code>hardware/gen_pcb.py</code><p>Placa por módulo: colocación, contorno, agujeros M3, serigrafía y DRC.</p></div>
    <div><b>3 · ngspice</b><code>simulaciones/ejecutar_todo.py</code><p>Simulación del circuito con modelos del LF412 y del AD633 y el ngspice.dll de KiCad.</p></div>
    <div><b>4 · Exportar</b><code>hardware/export_assets.py</code><p>SVG, PDF, BOM, GLB 3D y ZIP de cada módulo para la web.</p></div>
    <div><b>5 · Blender 5.3</b><code>blender/render_all.sh</code><p>Render Cycles de cada placa a partir del GLB.</p></div>
    <div><b>6 · Web</b><code>web/</code><p>Esta aplicación: HTML, JS y three.js, sin compilación. Se publica tal cual en cualquier hosting estático.</p></div>
  </div>
  <h3>Regenerar todo</h3><pre>cd computadora-analogica
python hardware/gen_schematics.py
"%LOCALAPPDATA%\\Programs\\KiCad\\10.0\\bin\\python.exe" hardware/gen_pcb.py
python simulaciones/ejecutar_todo.py
python hardware/export_assets.py
bash blender/render_all.sh</pre>
  <h3>Estado del diseño</h3><ul class="steps">
    <li><b>Hecho:</b> esquemáticos (netlist verificado y ERC sin errores), colocación de las PCB (DRC sin errores de colocación), simulación, modelos 3D y renders.</li>
    <li><b>Pendiente: el ruteo de las pistas.</b> Las placas están colocadas y con las conexiones (ratsnest), pero sin pistas. Opciones: rutearlas a mano en KiCad (son placas pequeñas de agujero pasante) o con Freerouting, que necesita Java.</li>
    <li>Mientras tanto, cada módulo se puede montar en una placa perforada o una protoboard siguiendo el esquemático.</li></ul>
  <h3>Publicar como página web</h3><p>La carpeta <code>web/</code> (más <code>docs/</code> y <code>simulaciones/</code>) es un sitio estático: súbela a GitHub Pages, Netlify o cualquier servidor. Lo único que no funciona fuera de la app de escritorio son los botones «Abrir en KiCad».</p>`));
}

function pagePaper() {
  main.innerHTML = `<header class="phead"><span class="step big">📄</span><div><h1>${esc(PAPER.title)}</h1><p class="muted">${PAPER.author}, ${PAPER.year}</p></div></header>
    <iframe class="pdf" src="${PAPER.pdf}"></iframe>`;
}

// ---------------------------------------------------------------- arranque
nav();
window.addEventListener("hashchange", route);
$("#menuBtn").onclick = () => document.body.classList.toggle("menu-open");
$("#themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = t; try { localStorage.setItem("theme", t); } catch {}
  route();
};
try { const t = localStorage.getItem("theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
route();
