import { MODULES, PROGRAMS, PAPER } from "./data.js";
import { plot } from "./plot.js";
import { SIMS } from "./sims.js";
import { viewBoard, disposeViewer } from "./viewer3d.js";
import { systemSvg, wireList, SYSTEMS } from "./sistema.js";
import { protoSystemSvg, protoWireList } from "./sistema_proto.js";

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
  fetch(`${A("sim")}/kicad/prog_lorenz.json`).then(r => r.json()).then(j => {
    const c = $("#heroScope"); if (!c) return;
    const X = j.puntos[0].y.map(v => -v), Z = j.puntos[2].y;
    plot(c, { series: [{ x: X.slice(300), y: Z.slice(300), width: 1 }], xlabel: "X (V)", ylabel: "Z (V)", equal: true, xlim: [-2.6, 2.6], ylim: [-0.3, 5.3] });
  });
}

// ---------------------------------------------------------------- módulo
const TABS = [["res", "Resumen"], ["sch", "Esquemático"], ["pcb", "PCB y 3D"], ["sim", "Simulación"], ["mat", "Materiales"], ["proto", "Protoboard"], ["test", "Prueba"], ["files", "Archivos"]];

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
    ({ res: tabRes, sch: tabSch, pcb: tabPcb, sim: tabSim, mat: tabMat, proto: (t, m) => montajeView(t, m), test: tabTest, files: tabFiles }[k])(t, m);
    history.replaceState(null, "", `#/m/${m.id}/${k}`);
    sessionStorage.setItem("tab", k);
  };
  tabs.forEach(b => b.addEventListener("click", () => show(b.dataset.t)));
  const want = tab || sessionStorage.getItem("tab") || "res";
  show(TABS.some(([k]) => k === want) ? want : "res");
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
  const box = document.createElement("div"); t.append(box); t = box;
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

async function tabSch(t, m, sub) {
  sub = sub || sessionStorage.getItem("schsub") || "partes";
  t.append(h(`<nav class="subtabs"><button data-s="partes">Por partes</button><button data-s="completo">Completo</button></nav><div id="schsub"></div>`));
  const box = $("#schsub");
  t.querySelectorAll(".subtabs button").forEach(b => {
    b.classList.toggle("act", b.dataset.s === sub);
    b.onclick = () => { sessionStorage.setItem("schsub", b.dataset.s); t.innerHTML = ""; tabSch(t, m, b.dataset.s); };
  });
  if (sub === "completo") {
    zoomable(box, `${A(m.id)}/completo.svg`, `Esquemático completo: <b>cada conexión es un cable dibujado</b>, sin etiquetas de red que se unen por su nombre.
      Lo genera <code>hardware/gen_completos.py</code>, y el netlist de KiCad confirma que tiene exactamente las mismas conexiones que la placa (ERC sin errores).
      <a href="${A(m.id)}/completo.pdf" target="_blank">PDF</a>. Rueda = zoom, arrastrar = mover.`);
    return;
  }
  const parts = await (await fetch(`${A(m.id)}/partes/partes.json`)).json();
  box.append(h(`<p class="muted small">El módulo dividido en sus bloques funcionales, uno por recuadro del esquemático KiCad (<code>hardware/gen_schematics.py</code>).
    Entre bloques, las etiquetas con el mismo nombre (p. ej. <code>SUMIN</code>) son el mismo cable: en la pestaña «Completo» están dibujados.
    Clic en un bloque para verlo en grande.</p>
    <div class="parts">${parts.map((p, i) => `<figure class="part"><figcaption><span class="step">${i + 1}</span>${esc(p.titulo)}</figcaption>
      <a href="${A(m.id)}/partes/${p.img}" target="_blank"><img src="${A(m.id)}/partes/${p.img}" loading="lazy"></a></figure>`).join("")}</div>`));
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
  t.append(h(`<div id="ksim"></div>
    <details class="live"><summary>Simulador interactivo aproximado (en el navegador)</summary>
      <p class="muted small">Modelo ideal con la saturación del LF412 (±13.5 V), para mover los controles. La simulación de verdad es la de KiCad, arriba.</p><div id="live"></div></details>`));
  SIMS[m.sim]($("#live"));
  if (m.id === "m1_fuente") {
    $("#ksim").innerHTML = `<div class="tip">M1 es la fuente y la lógica de control (regulador, LED e interruptor): no tiene una señal que simular.
      Su salida OP aparece como fuente en las simulaciones de M3 y de los programas.</div>`;
    return;
  }
  await kicadSim($("#ksim"), m.id);
}

// simulación hecha en KiCad (simulaciones/kicad/*): esquemático + un apartado por punto de prueba
async function kicadSim(box, id) {
  const j = await (await fetch(`${A("sim")}/kicad/${id}.json`)).json();
  const sch = j.esquematico.split("/").pop();
  box.append(h(`<div class="tip"><b>Simulación hecha en KiCad.</b> El circuito, las fuentes de prueba, los modelos SPICE y la directiva
      <code>.${j.analisis}</code> están en el esquemático <code>${esc(sch)}</code>: descárgalo, ábrelo en KiCad 10 y pulsa
      <i>Inspeccionar → Simulador → Ejecutar</i>; después pulsa en cada punto de prueba (TP) para ver su señal.
      <div class="sim-btns"><a class="btn" href="${A(id)}/simulacion_kicad.zip" download>Descargar la simulación (KiCad)</a>
      <button class="btn ghost desk-only" data-open="${id}">Abrir en KiCad</button>
      <a class="btn ghost" href="../${j.carpeta}/" target="_blank">Carpeta: netlist, datos.csv y gráfica</a></div><p class="muted small simmsg"></p></div>
    <h3>Esquemático de la simulación</h3><div class="simsch"></div>
    <h3>Dónde medir y qué se debe ver</h3>
    <p class="muted small">Cada apartado es un punto de prueba del esquemático: a la izquierda, la parte del circuito donde va la punta del osciloscopio
      (o del multímetro); a la derecha, la señal que da la simulación de KiCad en ese punto.</p>
    <div class="tps"></div>`));
  zoomable(box.querySelector(".simsch"), j.imagen, "Las fuentes V son el banco de prueba (en el montaje real son la fuente del laboratorio y las señales de entrada). Rueda = zoom, arrastrar = mover.");
  box.querySelectorAll("[data-open]").forEach(b => b.onclick = async () => {
    const r = await fetch(`/api/kicad?sim=${id}`, { method: "POST" });
    box.querySelector(".simmsg").textContent = r.ok ? "Abierto en KiCad." : "No se pudo abrir: " + (await r.text());
  });
  const T = box.querySelector(".tps");
  for (const p of j.puntos) {
    T.append(h(`<section class="tp"><div class="tp-img"><a href="${p.recorte}" target="_blank"><img src="${p.recorte}" loading="lazy"></a></div>
      <div class="tp-b"><h4><span class="tpn">${esc(p.ref)}</span> ${esc(p.que)}</h4><canvas class="scope sm"></canvas>
      <p class="small"><b>Qué se debe ver:</b> ${esc(p.esperado)}</p>
      <p class="small muted">KiCad: mínimo ${p.min.toFixed(3)} V · máximo ${p.max.toFixed(3)} V · al final ${p.final.toFixed(3)} V</p></div></section>`));
    plot(T.lastElementChild.querySelector("canvas"), { series: [{ name: p.nombre, x: j.x, y: p.y }], xlabel: j.xlabel, ylabel: "V" });
  }
  if (j.xy) {
    const [a, b] = j.xy.map(r => j.puntos.find(p => p.ref === r));
    const sg = p => (j.invertir || []).includes(p.ref) ? -1 : 1;
    const xs = a.y.map(v => v * sg(a)), ys = b.y.map(v => v * sg(b));
    const xl = sg(a) < 0 ? `X (${a.ref} con el signo cambiado)` : a.nombre;
    box.append(h(`<h3>Osciloscopio en modo X-Y</h3><canvas class="scope xy"></canvas>
      <p class="caption">${esc(xl)} en el eje horizontal y ${esc(b.nombre)} en el vertical, como en el osciloscopio del artículo.</p>`));
    plot(box.querySelector("canvas.xy"), { series: [{ name: "KiCad", x: xs, y: ys, width: 1 }], xlabel: xl, ylabel: b.nombre, equal: true });
  }
  return j;
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

async function tabMat(t, m) {
  t.append(h(`<h3>Materiales de un módulo</h3><div id="bom" class="tbl"></div>
    <p class="muted small">Sale del esquemático KiCad (<code>kicad-cli sch export bom</code>). Para la máquina completa, ver
      <a href="#/bom">Lista total de materiales</a>: este módulo se fabrica ×${m.qty}.</p>`));
  const rows = await csv(`${A(m.id)}/bom.csv`);
  const tot = rows.slice(1).reduce((a, r) => a + +r[3], 0);
  $("#bom").innerHTML = `<table><thead><tr><th>Cant.</th><th>Valor</th><th>Referencias</th><th>Encapsulado</th><th>Para ×${m.qty}</th></tr></thead><tbody>
    ${rows.slice(1).map(r => `<tr><td>${r[3]}</td><td><b>${esc(r[1])}</b></td><td>${esc(r[0])}</td><td class="small">${esc(r[2].split(":")[1] || r[2])}</td><td>${+r[3] * m.qty}</td></tr>`).join("")}
    <tr><td><b>${tot}</b></td><td colspan="3" class="muted">piezas en total</td><td><b>${tot * m.qty}</b></td></tr></tbody></table>`;
}

function tabTest(t, m) {
  t.append(h(`<h3>Prueba del módulo</h3><ol class="steps check">${m.test.map(s => `<li><label><input type="checkbox"> ${esc(s)}</label></li>`).join("")}</ol>
    <div id="expect"></div>`));
  if (m.id === "m1_fuente") return;
  fetch(`${A("sim")}/kicad/${m.id}.json`).then(r => r.json()).then(j => {
    $("#expect").innerHTML = `<h3>Valores de referencia (simulación KiCad)</h3><ol class="steps check">${j.puntos.map(p =>
      `<li><label><input type="checkbox"> <b>${esc(p.ref)}</b> ${esc(p.que)}: ${esc(p.esperado)}
        <span class="muted small">(KiCad: ${p.min.toFixed(2)} a ${p.max.toFixed(2)} V)</span></label></li>`).join("")}</ol>
      <p class="muted small">Dónde está cada TP: pestaña «Simulación».</p>`;
  });
}

function tabFiles(t, m) {
  const f = [
    ["kicad.zip", "Proyecto KiCad completo (esquemático, completo y PCB)"], ["esquematico.pdf", "Esquemático en PDF"],
    ["completo.pdf", "Esquemático completo (todo con cables) en PDF"],
    ...(m.id === "m1_fuente" ? [] : [["simulacion_kicad.zip", "Simulación KiCad (esquemático + modelos)"]]),
    ["bom.csv", "Lista de materiales (CSV)"], ["placa.glb", "Modelo 3D (GLB)"], ["render.png", "Render Blender"], ["pcb_top.svg", "PCB, capa superior (SVG)"],
  ];
  t.append(h(`<div class="files">${f.map(([n, d]) => `<a class="file" href="${A(m.id)}/${n}" download><b>${n}</b><span>${d}</span></a>`).join("")}
    ${m.id === "m1_fuente" ? "" : `<a class="file" href="../simulaciones/kicad/" target="_blank"><b>simulaciones/kicad/</b><span>Simulaciones KiCad: esquemático, netlist, datos y gráfica</span></a>`}</div>
    <div class="desk-only"><h3>Abrir con las herramientas</h3>
      <button class="btn" data-a="kicad">Abrir en KiCad</button> <button class="btn ghost" data-a="folder">Abrir la carpeta</button>
      <p class="muted small" id="actmsg"></p></div>
    <p class="muted small web-only">Abre la aplicación de escritorio (<code>Computadora Analogica.vbs</code>) para abrir los proyectos directamente en KiCad.</p>`));
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
    <h2>Simulación en KiCad del programa completo</h2>
    ${p.id === "prog_lorenz" ? "" : `<div class="sys-bar"><button class="toggle on" data-g="prog_caida_libre">g = 9.8 m/s² (Fig. 13)</button>
      <button class="toggle" data-g="prog_caida_libre_g12">g = 12 m/s² (Fig. 15)</button></div>`}
    <p class="muted small">Cada módulo es un bloque cuyo modelo SPICE es su circuito completo (resistencias, relé y LF412); los bloques se unen con cables como en la máquina.</p>
    <div id="spice"></div>
    <details class="live"><summary>Simulador interactivo aproximado (en el navegador)</summary><div id="live"></div></details>`));
  SIMS[p.id]($("#live"));
  const draw = async id => {
    const box = $("#spice"); box.innerHTML = "";
    const j = await kicadSim(box, id);
    if (j.teoria) {
      const t = j.teoria, ymax = j.puntos.find(q => q.ref === "TP2").max, teo = t.y0 + t.vy ** 2 / (2 * t.g);
      box.append(h(`<table class="tbl"><thead><tr><th>Medida</th><th>Artículo (circuito real)</th><th>KiCad</th><th>Teoría</th></tr></thead><tbody>
        <tr><td>Altura máxima desde el suelo</td><td>${t.g === 9.8 ? "2 + 2.3 = 4.3 m" : "—"}</td><td>${ymax.toFixed(3)} m</td><td>${teo.toFixed(3)} m</td></tr>
        <tr><td>Error</td><td>${t.g === 9.8 ? "≈ 10 % (Tabla 1)" : "—"}</td><td>${(Math.abs(ymax - teo) / teo * 100).toFixed(2)} %</td><td>—</td></tr></tbody></table>
        <p class="muted small">El artículo atribuye su 10 % a la tolerancia acumulada de las resistencias de 1 % y a una fuente que variaba un 10 %. La simulación usa valores exactos.</p>`));
    }
  };
  main.querySelectorAll("[data-g]").forEach(b => b.onclick = () => {
    main.querySelectorAll("[data-g]").forEach(x => x.classList.toggle("on", x === b)); draw(b.dataset.g);
  });
  draw(p.id);
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
    <div><b>1 · KiCad 10</b><code>hardware/gen_schematics.py</code><p>Esquemático de cada módulo por bloques (schlib), verificado contra el netlist de KiCad y el ERC.</p></div>
    <div><b>2 · Completo</b><code>hardware/gen_completos.py</code><p>El mismo circuito con todas las conexiones dibujadas con cable, y la hoja de simulación de cada módulo.</p></div>
    <div><b>3 · KiCad PCB</b><code>hardware/gen_pcb.py</code><p>Placa por módulo: colocación, contorno, agujeros M3, serigrafía y DRC.</p></div>
    <div><b>4 · Simulación KiCad</b><code>simulaciones/ejecutar_todo.py</code><p>Esquemáticos de simulación de KiCad (módulos y programas) simulados con el ngspice de KiCad.</p></div>
    <div><b>5 · Exportar</b><code>hardware/export_assets.py</code><p>SVG, PDF, BOM, partes, GLB 3D y ZIP de cada módulo; <code>export_componentes.py</code> para el visor 3D.</p></div>
    <div><b>6 · Blender</b><code>blender/render_all.sh</code><p>Render Cycles de cada placa a partir del GLB.</p></div>
    <div><b>7 · App</b><code>app/</code> · <code>web/</code><p>La web (HTML, JS y three.js, sin compilación) y la app de escritorio, un ejecutable de Rust sin dependencias.</p></div>
  </div>
  <h3>Regenerar todo</h3><pre>cd computadora-analogica
python hardware/gen_schematics.py
python hardware/gen_completos.py
"%LOCALAPPDATA%\\Programs\\KiCad\\10.0\\bin\\python.exe" hardware/gen_pcb.py
python simulaciones/ejecutar_todo.py
python hardware/export_assets.py
"%LOCALAPPDATA%\\Programs\\KiCad\\10.0\\bin\\python.exe" hardware/export_componentes.py
bash blender/render_all.sh
cargo build --release --manifest-path app/Cargo.toml</pre>
  <h3>Estado del diseño</h3><ul class="steps">
    <li><b>Hecho:</b> esquemáticos por partes y completos (netlist verificado y ERC sin errores), colocación de las PCB (DRC sin errores de colocación), simulación en KiCad de cada módulo y de los programas, modelos 3D y renders.</li>
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
