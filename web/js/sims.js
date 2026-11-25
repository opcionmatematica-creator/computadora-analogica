// Simuladores interactivos en el navegador (modelo ideal + saturación ±13.5 V del LF412).
// Complementan las simulaciones de ngspice (que son las que validan el circuito real).
import { plot } from "./plot.js";

const SAT = 13.5;
const clamp = v => Math.max(-SAT, Math.min(SAT, v));

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
}

function slider(label, min, max, step, value, unit, onInput) {
  const out = el("output", {}, "");
  const inp = el("input", { type: "range", min, max, step, value });
  const upd = () => { out.textContent = (+inp.value).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0) + " " + unit; onInput(+inp.value); };
  inp.addEventListener("input", upd);
  const w = el("label", { class: "ctl" }, el("span", {}, label), inp, out);
  w.init = upd; w.input = inp;
  return w;
}

function select(label, options, value, onChange) {
  const s = el("select", {});
  for (const [v, t] of options) { const o = el("option", { value: v }, t); if (v == value) o.selected = true; s.append(o); }
  s.addEventListener("change", () => onChange(s.value));
  return el("label", { class: "ctl" }, el("span", {}, label), s);
}

function frame(title, controls, readout) {
  const canvas = el("canvas", { class: "scope" });
  const box = el("div", { class: "sim" },
    el("div", { class: "sim-head" }, el("strong", {}, title), readout || ""),
    el("div", { class: "sim-ctl" }, ...controls), canvas);
  return { box, canvas };
}

// ------------------------------------------------------------------- M1
function simM1(root) {
  let op = false;
  const st = el("div", { class: "m1state" });
  const btn = el("button", { class: "toggle", onclick: () => { op = !op; draw(); } }, "");
  const draw = () => {
    btn.textContent = op ? "SW1: OPERAR" : "SW1: IC (reset)";
    btn.classList.toggle("on", op);
    st.innerHTML = `
      <div class="led ${"on"} g"></div> +15 V &nbsp; <div class="led on r"></div> −15 V &nbsp;
      <div class="led ${op ? "on" : ""} y"></div> OP = <b>${op ? "+12 V" : "0 V"}</b>
      <p>${op ? "Relés activados: los integradores <b>integran</b> sus entradas."
                : "Relés en reposo: cada integrador carga <b>Vout = −Vic</b> y sus entradas quedan a GND."}</p>`;
  };
  draw();
  root.append(el("div", { class: "sim" }, el("div", { class: "sim-head" }, el("strong", {}, "Control IC / OPERAR")), btn, st));
}

// ------------------------------------------------------------------- M2
function simM2(root) {
  const ro = el("span", { class: "readout" });
  let pos = 50;
  const { box, canvas } = frame("Potenciómetro → seguidor", [
    slider("Cursor", 0, 100, 0.5, pos, "%", v => { pos = v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const xs = [], ys = [];
    for (let p = 0; p <= 100; p += 1) { xs.push(p); ys.push(clamp(-15 + 30 * p / 100)); }
    const v = clamp(-15 + 30 * pos / 100);
    ro.textContent = `IC_OUT = ${v.toFixed(2)} V  →  el integrador carga ${(-v).toFixed(2)} V`;
    plot(canvas, { series: [{ name: "IC_OUT", x: xs, y: ys }, { name: "cursor", x: [pos, pos], y: [-15, 15], dash: [4, 4], glow: false }],
      xlabel: "posición (%)", ylabel: "V", ylim: [-15, 15] });
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  draw();
}

// ------------------------------------------------------------------- M3
function simM3(root) {
  const p = { vin: 1, r: 1e6, c: 1e-6, vic: 2, top: 0.5, T: 4 };
  const ro = el("span", { class: "readout" });
  const { box, canvas } = frame("Integrador: IC y luego OPERAR", [
    slider("Vin", -10, 10, 0.1, p.vin, "V", v => { p.vin = v; draw(); }),
    select("Entrada", [[1e6, "X1 · 1 MΩ"], [1e5, "X10 · 100 kΩ"], [1e4, "X100 · 10 kΩ"], [1e3, "X1000 · 1 kΩ"]], p.r, v => { p.r = +v; draw(); }),
    select("Velocidad (SW1)", [[1e-6, "×1 · C1 = 1 µF"], [1e-7, "×10 · C2 = 100 nF"]], p.c, v => { p.c = +v; draw(); }),
    slider("IC_IN (de M2)", -10, 10, 0.1, p.vic, "V", v => { p.vic = v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const k = 1 / (p.r * p.c), xs = [], ys = [], ops = [];
    let v = -p.vic, tsat = null;
    const T = Math.min(p.T, Math.max(0.05, 2.5 * SAT / Math.max(Math.abs(k * p.vin), 1e-3)) + p.top);
    const dt = T / 800;
    for (let t = 0; t <= T; t += dt) {
      if (t >= p.top) { v = clamp(v - k * p.vin * dt); if (tsat === null && Math.abs(v) >= SAT - 1e-9) tsat = t; }
      xs.push(t); ys.push(v); ops.push(t >= p.top ? 12 : 0);
    }
    ro.textContent = `k = ${k.toFixed(k < 10 ? 1 : 0)} /s · pendiente ${(-k * p.vin).toFixed(2)} V/s` + (tsat ? ` · satura a ${(tsat - p.top).toFixed(3)} s` : "");
    plot(canvas, { series: [{ name: "OUT", x: xs, y: ys }, { name: "OP (relé)", x: xs, y: ops, dash: [5, 4], glow: false }],
      xlabel: "tiempo (s)", ylabel: "V", ylim: [-15, 15] });
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  draw();
}

// ------------------------------------------------------------------- M4
function simM4(root) {
  const p = { a: 2, f: 1, b: 1, ra: 1e4, rb: 1e4, rf: 1e4 };
  const ro = el("span", { class: "readout" });
  const R = [[1e3, "1 kΩ (×10)"], [1e4, "10 kΩ (×1)"], [1e5, "100 kΩ (×0.1)"]];
  const { box, canvas } = frame("Sumador: OUT = −Rf (V1/R1 + V2/R2)", [
    slider("V1 amplitud (seno 1 Hz)", 0, 10, 0.1, p.a, "V", v => { p.a = v; draw(); }),
    select("R1", R, p.ra, v => { p.ra = +v; draw(); }),
    slider("V2 (continua)", -10, 10, 0.1, p.b, "V", v => { p.b = v; draw(); }),
    select("R2", R, p.rb, v => { p.rb = +v; draw(); }),
    slider("Rf (RV1)", 1e3, 1e5, 1e3, p.rf, "Ω", v => { p.rf = v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const xs = [], s1 = [], s2 = [], o = [];
    for (let t = 0; t <= 2; t += 0.004) {
      const v1 = p.a * Math.sin(2 * Math.PI * t);
      xs.push(t); s1.push(v1); s2.push(p.b); o.push(clamp(-p.rf * (v1 / p.ra + p.b / p.rb)));
    }
    ro.textContent = `ganancias: −${(p.rf / p.ra).toFixed(2)} · −${(p.rf / p.rb).toFixed(2)}` + (o.some(v => Math.abs(v) >= SAT) ? " · ¡SATURA!" : "");
    plot(canvas, { series: [{ name: "V1", x: xs, y: s1 }, { name: "V2", x: xs, y: s2 }, { name: "OUT", x: xs, y: o }],
      xlabel: "tiempo (s)", ylabel: "V", ylim: [-15, 15] });
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  draw();
}

// ------------------------------------------------------------------- M5
function simM5(root) {
  const p = { cin: -15, a: 0.6533 };
  const ro = el("span", { class: "readout" });
  const { box, canvas } = frame("Coeficiente: COUT = a · CIN", [
    select("CIN", [[-15, "REF −15 V"], [15, "REF +15 V"], [10, "señal de 10 V"]], p.cin, v => { p.cin = +v; draw(); }),
    slider("a (potenciómetro)", 0, 1, 0.0001, p.a, "", v => { p.a = v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const xs = [], ys = [];
    for (let a = 0; a <= 1.0001; a += 0.01) { xs.push(a); ys.push(clamp(p.cin * a)); }
    const out = clamp(p.cin * p.a);
    ro.textContent = `COUT = ${out.toFixed(3)} V` + (Math.abs(out + 9.8) < 0.02 ? "  ✓ gravedad" : Math.abs(out + 7.071) < 0.02 ? "  ✓ vx = −7.07" : "");
    plot(canvas, { series: [{ name: "COUT", x: xs, y: ys }, { name: "a", x: [p.a, p.a], y: [-15, 15], dash: [4, 4], glow: false }],
      xlabel: "a", ylabel: "V", ylim: [-15, 15] });
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  draw();
}

// ------------------------------------------------------------------- M6
function simM6(root) {
  const p = { r: 1e4, c: 1e-7 };
  const ro = el("span", { class: "readout" });
  const { box, canvas } = frame("Filtro RC: |H(f)|", [
    select("R", [[1e3, "1 kΩ"], [1e4, "10 kΩ"], [1e5, "100 kΩ"]], p.r, v => { p.r = +v; draw(); }),
    select("C", [[1e-8, "10 nF"], [1e-7, "100 nF"], [1e-6, "1 µF"]], p.c, v => { p.c = +v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const fc = 1 / (2 * Math.PI * p.r * p.c), xs = [], ys = [];
    for (let e = 0; e <= 5; e += 0.02) { const f = 10 ** e; xs.push(f); ys.push(-10 * Math.log10(1 + (f / fc) ** 2)); }
    ro.textContent = `fc = ${fc.toFixed(1)} Hz`;
    plot(canvas, { series: [{ name: "|H| dB", x: xs, y: ys }], xlabel: "frecuencia (Hz)", ylabel: "dB", logx: true, ylim: [-45, 3] });
  };
  draw();
}

// ------------------------------------------------------------------- M7
function simM7(root) {
  const p = { ax: 5, ay: 8 };
  const ro = el("span", { class: "readout" });
  const { box, canvas } = frame("AD633: W = X·Y/10", [
    slider("X (seno 1 Hz) amplitud", 0, 10, 0.1, p.ax, "V", v => { p.ax = v; draw(); }),
    slider("Y (seno 3 Hz) amplitud", 0, 10, 0.1, p.ay, "V", v => { p.ay = v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const xs = [], X = [], Y = [], Wv = [];
    for (let t = 0; t <= 1; t += 0.002) {
      const x = p.ax * Math.sin(2 * Math.PI * t), y = p.ay * Math.sin(6 * Math.PI * t);
      xs.push(t); X.push(x); Y.push(y); Wv.push(x * y / 10);
    }
    ro.textContent = `pico de W = ${(p.ax * p.ay / 10).toFixed(2)} V`;
    plot(canvas, { series: [{ name: "X", x: xs, y: X }, { name: "Y", x: xs, y: Y }, { name: "W", x: xs, y: Wv }],
      xlabel: "tiempo (s)", ylabel: "V", ylim: [-11, 11] });
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  draw();
}

// ------------------------------------------------------------------- caída libre
function simFalling(root) {
  const p = { g: 9.8, v0: 10, ang: 45, y0: 2 };
  const ro = el("span", { class: "readout" });
  const { box, canvas } = frame("Osciloscopio X-Y (1 V = 1 m)", [
    slider("g", 1, 20, 0.1, p.g, "m/s²", v => { p.g = v; draw(); }),
    slider("v0", 0, 14, 0.1, p.v0, "m/s", v => { p.v0 = v; draw(); }),
    slider("ángulo", 0, 90, 1, p.ang, "°", v => { p.ang = v; draw(); }),
    slider("y0", 0, 10, 0.1, p.y0, "m", v => { p.y0 = v; draw(); }),
  ], ro);
  root.append(box);
  const draw = () => {
    const vx = p.v0 * Math.cos(p.ang * Math.PI / 180), vy0 = p.v0 * Math.sin(p.ang * Math.PI / 180);
    // integradores (Euler fino) con saturación, como el circuito
    let nvy = -vy0, y = p.y0, x = 0;
    const X = [x], Y = [y], dt = 1e-3;
    let sat = false;
    for (let t = 0; t < 10 && y >= 0; t += dt) {
      nvy = clamp(nvy + p.g * dt); y = clamp(y - nvy * dt); const xn = clamp(x + vx * dt);
      if (xn === x && vx > 0) sat = true;
      x = xn; X.push(x); Y.push(y);
    }
    const hmax = p.y0 + vy0 * vy0 / (2 * p.g);
    const tf = (vy0 + Math.sqrt(vy0 * vy0 + 2 * p.g * p.y0)) / p.g;
    ro.textContent = `Hmax = ${hmax.toFixed(2)} m · alcance = ${(vx * tf).toFixed(2)} m · vuelo = ${tf.toFixed(2)} s` + (sat || hmax > SAT ? " · ¡un integrador satura!" : "");
    plot(canvas, { series: [{ name: "trayectoria", x: X, y: Y }], xlabel: "X (V)", ylabel: "Y (V)", equal: true, xlim: [0, 14], ylim: [0, Math.max(5, hmax * 1.1)] });
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  draw();
}

// ------------------------------------------------------------------- Lorenz (animado)
let lorenzRaf = 0;
function simLorenz(root) {
  cancelAnimationFrame(lorenzRaf);
  const p = { s: 10, r: 28, b: 8 / 3, view: "xz" };
  const { box, canvas } = frame("Osciloscopio X-Y en vivo", [
    slider("σ", 1, 20, 0.1, p.s, "", v => { p.s = v; reset(); }),
    slider("ρ", 1, 50, 0.1, p.r, "", v => { p.r = v; reset(); }),
    slider("β", 0.5, 5, 0.01, p.b, "", v => { p.b = v; reset(); }),
    select("Ejes", [["xz", "X vs Z (mariposa)"], ["xy", "X vs Y"], ["yz", "Y vs Z"]], p.view, v => { p.view = v; reset(); }),
  ]);
  root.append(box);
  let X, Y, Z, trail;
  const reset = () => { X = 0.1; Y = 0.1; Z = 0.1; trail = []; };
  reset();
  const pick = () => p.view === "xz" ? [X, Z] : p.view === "xy" ? [X, Y] : [Y, Z];
  const step = () => {
    const dt = 0.0005;
    for (let i = 0; i < 30; i++) {   // variables escaladas (/10) como en el circuito
      const dX = p.s * (Y - X), dY = p.r * X - Y - 10 * X * Z, dZ = -p.b * Z + 10 * X * Y;
      X = clamp(X + dX * dt); Y = clamp(Y + dY * dt); Z = clamp(Z + dZ * dt);
      trail.push(pick());
    }
    if (trail.length > 9000) trail.splice(0, trail.length - 9000);
    const lim = p.view === "xz" ? { xlim: [-3, 3], ylim: [-0.5, 5.5] } : p.view === "xy" ? { xlim: [-3, 3], ylim: [-3, 3] } : { xlim: [-3, 3], ylim: [-0.5, 5.5] };
    plot(canvas, { series: [{ x: trail.map(q => q[0]), y: trail.map(q => q[1]), width: 1.2 }],
      xlabel: p.view[0].toUpperCase() + " (V)", ylabel: p.view[1].toUpperCase() + " (V)", equal: true, ...lim });
    if (document.body.contains(canvas)) lorenzRaf = requestAnimationFrame(step);
  };
  box.querySelectorAll(".ctl").forEach(c => c.init && c.init());
  reset();
  lorenzRaf = requestAnimationFrame(step);
}

export const SIMS = {
  m1: simM1, m2: simM2, m3: simM3, m4: simM4, m5: simM5, m6: simM6, m7: simM7,
  prog_caida_libre: simFalling, prog_lorenz: simLorenz,
};
