// Gráfica de líneas en <canvas>, sin dependencias. Estilo "osciloscopio".
const COLORS = ["#39d98a", "#f5b942", "#5aa9ff", "#ff6b8a", "#c38bff"];

function niceTicks(lo, hi, n = 6) {
  if (!isFinite(lo) || !isFinite(hi)) return [0];
  if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}

function fmt(v) {
  const a = Math.abs(v);
  if (a >= 1e4) return (v / 1e3).toFixed(0) + "k";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
  if (a === 0) return "0";
  if (a < 0.01) return v.toExponential(0);
  return +v.toFixed(3) + "";
}

/**
 * plot(canvas, {series:[{name, x, y}], xlabel, ylabel, logx, equal, xlim, ylim})
 */
export function plot(canvas, cfg) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600, H = canvas.clientHeight || 340;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--scope-bg").trim() || "#0b1410";
  const grid = css.getPropertyValue("--scope-grid").trim() || "#1d3328";
  const ink = css.getPropertyValue("--scope-ink").trim() || "#9fc9b2";
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  const L = 58, R = 14, T = 14, B = 42;
  const tx = cfg.logx ? (v => Math.log10(Math.max(v, 1e-12))) : (v => v);
  let xs = [], ys = [];
  for (const s of cfg.series) { xs = xs.concat(s.x.map(tx)); ys = ys.concat(s.y); }
  let [x0, x1] = cfg.xlim ? cfg.xlim.map(tx) : [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = cfg.ylim || [Math.min(...ys), Math.max(...ys)];
  const py = (y1 - y0) * 0.08 || 1; if (!cfg.ylim) { y0 -= py; y1 += py; }
  if (cfg.equal) {
    const sx = (x1 - x0) / (W - L - R), sy = (y1 - y0) / (H - T - B), s = Math.max(sx, sy);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - s * (W - L - R) / 2; x1 = cx + s * (W - L - R) / 2;
    y0 = cy - s * (H - T - B) / 2; y1 = cy + s * (H - T - B) / 2;
  }
  const X = v => L + (tx(v) - x0) / (x1 - x0) * (W - L - R);
  const Xl = v => L + (v - x0) / (x1 - x0) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);

  g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = ink;
  g.font = "11px ui-monospace, Consolas, monospace"; g.textAlign = "center";
  const xt = cfg.logx ? niceTicks(x0, x1, 6).filter(v => Number.isInteger(v)) : niceTicks(x0, x1, 7);
  for (const v of xt) {
    const p = Xl(v); g.beginPath(); g.moveTo(p, T); g.lineTo(p, H - B); g.stroke();
    g.fillText(cfg.logx ? fmt(Math.pow(10, v)) : fmt(v), p, H - B + 15);
  }
  g.textAlign = "right";
  for (const v of niceTicks(y0, y1, 6)) {
    const p = Y(v); g.beginPath(); g.moveTo(L, p); g.lineTo(W - R, p); g.stroke();
    g.fillText(fmt(v), L - 6, p + 4);
  }
  if (y0 < 0 && y1 > 0) { g.strokeStyle = ink + "88"; g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(W - R, Y(0)); g.stroke(); }
  g.textAlign = "center"; g.fillText(cfg.xlabel || "", L + (W - L - R) / 2, H - 6);
  g.save(); g.translate(13, T + (H - T - B) / 2); g.rotate(-Math.PI / 2); g.fillText(cfg.ylabel || "", 0, 0); g.restore();

  g.save(); g.beginPath(); g.rect(L, T, W - L - R, H - T - B); g.clip();
  cfg.series.forEach((s, i) => {
    g.strokeStyle = s.color || COLORS[i % COLORS.length];
    g.lineWidth = s.width || 2; g.setLineDash(s.dash || []);
    g.shadowColor = g.strokeStyle; g.shadowBlur = s.glow === false ? 0 : 6;
    g.beginPath();
    for (let k = 0; k < s.x.length; k++) {
      const a = X(s.x[k]), b = Y(s.y[k]);
      k ? g.lineTo(a, b) : g.moveTo(a, b);
    }
    g.stroke();
  });
  g.restore();
  g.setLineDash([]); g.shadowBlur = 0;
  // leyenda
  g.textAlign = "left"; let lx = L + 10;
  cfg.series.forEach((s, i) => {
    if (!s.name) return;
    g.fillStyle = s.color || COLORS[i % COLORS.length];
    g.fillRect(lx, T + 8, 14, 3);
    g.fillStyle = ink; g.fillText(s.name, lx + 18, T + 13);
    lx += 26 + g.measureText(s.name).width;
  });
}

export { COLORS };
