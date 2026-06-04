(function () {
  const canvas = document.getElementById("live-bg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const BIN_COLORS = {
    recyclable: "#3b82f6",
    organic: "#22c55e",
    general: "#64748b",
    hazardous: "#ef4444",
    ewaste: "#f97316",
  };

  const WASTE_TYPES = [
    { type: "bottle", bin: "recyclable", weight: 3 },
    { type: "can", bin: "recyclable", weight: 2 },
    { type: "paper", bin: "recyclable", weight: 2 },
    { type: "leaf", bin: "organic", weight: 3 },
    { type: "peel", bin: "organic", weight: 2 },
    { type: "crumple", bin: "general", weight: 2 },
    { type: "battery", bin: "hazardous", weight: 2 },
    { type: "phone", bin: "ewaste", weight: 2 },
    { type: "dustbin", bin: "recyclable", weight: 1 },
    { type: "dustbin", bin: "organic", weight: 1 },
    { type: "dustbin", bin: "hazardous", weight: 1 },
  ];

  let theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  let width = 0;
  let height = 0;
  let items = [];
  let washes = [];
  let rafId = 0;
  let mouse = { x: -1e4, y: -1e4 };
  let time = 0;

  function alphaMult() {
    return theme === "dark" ? 0.42 : 0.28;
  }

  function pickType() {
    const total = WASTE_TYPES.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of WASTE_TYPES) {
      r -= t.weight;
      if (r <= 0) return t;
    }
    return WASTE_TYPES[0];
  }

  function itemCount() {
    return Math.min(16, Math.max(9, Math.floor((width * height) / 42000)));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const n = itemCount();
    items = Array.from({ length: n }, () => {
      const spec = pickType();
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.32,
        vy: 0.08 + Math.random() * 0.22,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.008,
        type: spec.type,
        color: BIN_COLORS[spec.bin] || BIN_COLORS.general,
        scale: 0.75 + Math.random() * 0.55,
        bob: Math.random() * Math.PI * 2,
      };
    });
    washes = Object.entries(BIN_COLORS).map(([_, hex], i) => ({
      x: 0.15 + (i % 3) * 0.28 + Math.random() * 0.1,
      y: 0.12 + Math.floor(i / 3) * 0.4 + Math.random() * 0.15,
      r: 0.28 + Math.random() * 0.12,
      color: hex,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function drawWashes(t) {
    const a = alphaMult() * 0.35;
    for (let i = 0; i < washes.length; i++) {
      const w = washes[i];
      const [r, g, b] = hexToRgb(w.color);
      const ox = (w.x + Math.sin(t * 0.0004 + w.phase) * 0.04) * width;
      const oy = (w.y + Math.cos(t * 0.00035 + w.phase) * 0.03) * height;
      const radius = w.r * Math.min(width, height) * 0.5;
      const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, oy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDustbin(s, color) {
    const w = 14 * s;
    const h = 16 * s;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.55, -h * 0.45);
    ctx.lineTo(w * 0.55, -h * 0.45);
    ctx.lineTo(w * 0.7, h * 0.35);
    ctx.lineTo(-w * 0.7, h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha *= 0.85;
    ctx.fillRect(-w * 0.62, -h * 0.62, w * 1.24, h * 0.22);
    ctx.globalAlpha /= 0.85;
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -h * 0.55);
    ctx.lineTo(w * 0.35, -h * 0.55);
    ctx.stroke();
  }

  function drawBottle(s, color) {
    ctx.fillStyle = color;
    const w = 6 * s;
    const h = 18 * s;
    ctx.beginPath();
    ctx.roundRect(-w, -h * 0.35, w * 2, h * 0.65, w * 0.4);
    ctx.fill();
    ctx.fillRect(-w * 0.45, -h * 0.55, w * 0.9, h * 0.22);
  }

  function drawCan(s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 7 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(-5 * s, -6 * s, 10 * s, 3 * s);
  }

  function drawPaper(s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-9 * s, -7 * s);
    ctx.lineTo(8 * s, -9 * s);
    ctx.lineTo(10 * s, 8 * s);
    ctx.lineTo(-7 * s, 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  function drawLeaf(s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -10 * s);
    ctx.bezierCurveTo(12 * s, -4 * s, 10 * s, 10 * s, 0, 12 * s);
    ctx.bezierCurveTo(-10 * s, 10 * s, -12 * s, -4 * s, 0, -10 * s);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -8 * s);
    ctx.lineTo(0, 10 * s);
    ctx.stroke();
  }

  function drawPeel(s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 9 * s, 0.2, Math.PI * 1.15);
    ctx.arc(0, 0, 5 * s, Math.PI * 1.15, 0.2, true);
    ctx.closePath();
    ctx.fill();
  }

  function drawCrumple(s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-8 * s, 0);
    ctx.lineTo(-3 * s, -8 * s);
    ctx.lineTo(6 * s, -5 * s);
    ctx.lineTo(9 * s, 4 * s);
    ctx.lineTo(0, 9 * s);
    ctx.lineTo(-9 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
  }

  function drawBattery(s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(-9 * s, -5 * s, 18 * s, 10 * s);
    ctx.fillRect(-4 * s, -8 * s, 8 * s, 3 * s);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(4 * s, -2 * s, 3 * s, 4 * s);
  }

  function drawPhone(s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-7 * s, -11 * s, 14 * s, 22 * s, 2 * s);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(-5 * s, -8 * s, 10 * s, 14 * s);
  }

  function drawItem(item, t) {
    const bob = Math.sin(t * 0.0015 + item.bob) * 2;
    const s = item.scale;
    const baseAlpha = alphaMult();

    ctx.save();
    ctx.translate(item.x, item.y + bob);
    ctx.rotate(item.angle);
    ctx.globalAlpha = baseAlpha;

    switch (item.type) {
      case "dustbin":
        drawDustbin(s, item.color);
        break;
      case "bottle":
        drawBottle(s, item.color);
        break;
      case "can":
        drawCan(s, item.color);
        break;
      case "paper":
        drawPaper(s, item.color);
        break;
      case "leaf":
        drawLeaf(s, item.color);
        break;
      case "peel":
        drawPeel(s, item.color);
        break;
      case "crumple":
        drawCrumple(s, item.color);
        break;
      case "battery":
        drawBattery(s, item.color);
        break;
      case "phone":
        drawPhone(s, item.color);
        break;
      default:
        break;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function stepItems() {
    for (const item of items) {
      const mdx = item.x - mouse.x;
      const mdy = item.y - mouse.y;
      const md = Math.hypot(mdx, mdy);
      if (md < 120 && md > 0) {
        const force = (120 - md) / 120;
        item.vx += (mdx / md) * force * 0.02;
        item.vy += (mdy / md) * force * 0.02;
      }

      item.vx *= 0.992;
      item.vy *= 0.992;
      item.vx = Math.max(-0.6, Math.min(0.6, item.vx));
      item.vy = Math.max(-0.15, Math.min(0.55, item.vy));

      item.x += item.vx;
      item.y += item.vy;
      item.angle += item.spin;

      if (item.x < -40) item.x = width + 30;
      if (item.x > width + 40) item.x = -30;
      if (item.y > height + 40) {
        item.y = -30;
        item.x = Math.random() * width;
      }
      if (item.y < -40) item.y = height + 20;
    }
  }

  function drawScene(t, animate) {
    ctx.clearRect(0, 0, width, height);
    drawWashes(t);
    if (animate) stepItems();
    for (const item of items) drawItem(item, t);
  }

  function frame(ts) {
    time = ts;
    drawScene(ts, true);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    if (reduced) {
      drawScene(0, false);
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(frame);
  }

  window.BinBossLiveBg = {
    setTheme(next) {
      theme = next === "dark" ? "dark" : "light";
      if (reduced) drawScene(0, false);
    },
    refresh() {
      resize();
      if (!reduced) start();
    },
  };

  window.addEventListener("resize", () => {
    resize();
    if (reduced) drawScene(0, false);
  });

  document.addEventListener(
    "mousemove",
    (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", () => {
    if (reduced) return;
    if (document.hidden) cancelAnimationFrame(rafId);
    else rafId = requestAnimationFrame(frame);
  });

  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  if (!ctx.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rad = Math.min(r, w / 2, h / 2);
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
    };
  }

  start();
})();
