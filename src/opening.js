/* لعبة الأرشيف — المقدمة المتحركة
 * جزيئات متوهجة تكتب «عزنا بطبعنا»، ثم ترسم خريطة المملكة وتكتب فوقها «96» ثم «PMAU».
 * تُعرض في الزيارة الأولى فقط، وتبدأ بنقرة حتى يُسمح بتشغيل الصوت.
 * الخريطة تُرسم صورةً على لوحة خفية ثم تُقرأ بكسلاتها: الداخل، والحدود الخارجية، وحدود المناطق.
 */
const Opening = (function () {
  "use strict";

  const SEEN_KEY = "archiveGame:opening";
  const MUTE_KEY = "archiveGame:muted";
  const MAP_SRC = "assets/ksa-map.svg";
  const AUDIO_SRC = "assets/intro.m4a";
  const MAP_W = 1000, MAP_H = 824;

  // المشاهد بالثواني من بدء المقدمة
  const SCENES = [
    { text: "عزنا بطبعنا", start: 0,   map: false },
    { text: "96",           start: 3.8, map: true },
    { text: "PMAU",         start: 7.8, map: true },
    { text: null,           start: 11.8, map: false } // تفرّق الجزيئات قبل الانتقال
  ];
  const DURATION = 13.2;

  const COLORS = { text: "#8fe05a", gold: "#d6a64a", edge: "#5ab91c", inner: "#2f8f6a", bg: "4,33,31" };

  let root, canvas, ctx, audio;
  let W = 0, H = 0, dpr = 1;
  let particles = [];
  let mapImg = null, mapPts = null;
  let sceneIdx = -1, t0 = 0, raf = 0, running = false, onDone = null;
  const sprites = {};

  function store(get, key, val) {
    try {
      if (get) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* التخزين غير متاح */ }
    return null;
  }

  function shouldShow() {
    if (store(true, SEEN_KEY) === "1") return false;
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return !!document.createElement("canvas").getContext;
  }

  /* ---------- رسومات مساعدة ---------- */
  function glowSprite(color, r) {
    const key = color + r;
    if (sprites[key]) return sprites[key];
    const s = document.createElement("canvas");
    const size = Math.ceil(r * 2);
    s.width = s.height = size;
    const g = s.getContext("2d");
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color + "aa");
    grad.addColorStop(1, color + "00");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return (sprites[key] = s);
  }

  function offscreen() {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    return c;
  }

  function mapRect() {
    const scale = Math.min(W / MAP_W, H / MAP_H) * 0.9;
    return { x: (W - MAP_W * scale) / 2, y: (H - MAP_H * scale) / 2, w: MAP_W * scale, h: MAP_H * scale };
  }

  /* نقاط الخريطة: حدود خارجية وحدود مناطق وداخل متناثر */
  function sampleMap() {
    if (!mapImg) return null;
    const c = offscreen();
    const g = c.getContext("2d");
    const r = mapRect();
    g.drawImage(mapImg, r.x, r.y, r.w, r.h);
    const d = g.getImageData(0, 0, W, H).data;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 128;
    const edge = [], inner = [], fill = [];
    const gap = Math.max(2, Math.round(Math.min(W, H) / 220));
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (!inside(x, y)) continue;
        const i = (y * W + x) * 4;
        if (!inside(x + gap, y) || !inside(x - gap, y) || !inside(x, y + gap) || !inside(x, y - gap)) {
          edge.push({ x, y });
        } else if (d[i] < 120) {
          inner.push({ x, y }); // خط حدود منطقة (مرسوم بالأسود فوق التعبئة البيضاء)
        } else if ((x / gap + y / gap) % 5 === 0) {
          fill.push({ x, y });
        }
      }
    }
    return { edge, inner, fill };
  }

  function sampleText(text) {
    const c = offscreen();
    const g = c.getContext("2d");
    let size = Math.min(H * 0.22, 160);
    const font = (s) => "800 " + s + "px Tajawal, 'Segoe UI', system-ui, sans-serif";
    g.font = font(size);
    while (size > 24 && g.measureText(text).width > W * 0.84) {
      size -= 4;
      g.font = font(size);
    }
    g.direction = "rtl";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText(text, W / 2, H / 2);
    const d = g.getImageData(0, 0, W, H).data;
    const pts = [];
    const gap = Math.max(2, Math.round(size / 36));
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (d[(y * W + x) * 4 + 3] > 128) pts.push({ x, y });
      }
    }
    return pts;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- الجزيئات ---------- */
  function makeParticles() {
    const n = Math.round(Math.min(1800, Math.max(700, (W * H) / 190)));
    particles = [];
    for (let i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0,
        tx: W / 2, ty: H / 2, r: 1, kind: "text", seed: Math.random()
      });
    }
  }

  function assign(i, p, kind) {
    const q = particles[i];
    q.tx = p.x; q.ty = p.y; q.kind = kind;
  }

  function applyScene(scene) {
    const n = particles.length;
    shuffle(particles);
    if (!scene.text) {
      // تفرّق نحو الخارج
      particles.forEach((q) => {
        const a = Math.random() * Math.PI * 2;
        const dist = Math.max(W, H) * (0.6 + Math.random() * 0.4);
        q.tx = W / 2 + Math.cos(a) * dist;
        q.ty = H / 2 + Math.sin(a) * dist;
        q.kind = "fade";
      });
      return;
    }
    const text = shuffle(sampleText(scene.text));
    let i = 0;
    if (scene.map && mapPts) {
      const edge = shuffle(mapPts.edge.slice());
      const inner = shuffle(mapPts.inner.slice());
      const fill = shuffle(mapPts.fill.slice());
      const nText = Math.round(n * 0.38);
      const nEdge = Math.min(edge.length, Math.round(n * 0.34));
      const nInner = Math.min(inner.length, Math.round(n * 0.16));
      for (let k = 0; k < nEdge; k++) assign(i++, edge[k], "edge");
      for (let k = 0; k < nInner; k++) assign(i++, inner[k], "inner");
      const rest = n - nText - i;
      for (let k = 0; k < rest && fill.length; k++) assign(i++, fill[k % fill.length], "inner");
    }
    for (let k = 0; i < n; k++) assign(i++, text[k % text.length] || { x: W / 2, y: H / 2 }, "text");
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const t = (performance.now() - t0) / 1000;
    if (t >= DURATION) { finish(); return; }

    let idx = 0;
    for (let k = 0; k < SCENES.length; k++) if (t >= SCENES[k].start) idx = k;
    if (idx !== sceneIdx) { sceneIdx = idx; applyScene(SCENES[idx]); }

    ctx.fillStyle = "rgba(" + COLORS.bg + ",.28)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const sText = glowSprite(COLORS.text, 5), sGold = glowSprite(COLORS.gold, 5);
    const sEdge = glowSprite(COLORS.edge, 4), sInner = glowSprite(COLORS.inner, 3);
    const fadeOut = Math.max(0, 1 - (t - SCENES[3].start) / (DURATION - SCENES[3].start));
    for (const q of particles) {
      q.vx = (q.vx + (q.tx - q.x) * 0.018) * 0.88;
      q.vy = (q.vy + (q.ty - q.y) * 0.018) * 0.88;
      q.x += q.vx + (Math.random() - 0.5) * 0.4;
      q.y += q.vy + (Math.random() - 0.5) * 0.4;
      let s = sInner, a = 0.55;
      if (q.kind === "text") { s = q.seed < 0.18 ? sGold : sText; a = 0.95; }
      else if (q.kind === "edge") { s = sEdge; a = 0.85; }
      else if (q.kind === "fade") { s = sText; a = 0.8 * fadeOut; }
      ctx.globalAlpha = a;
      ctx.drawImage(s, q.x - s.width / 2, q.y - s.height / 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgb(" + COLORS.bg + ")";
    ctx.fillRect(0, 0, W, H);
    mapPts = sampleMap();
    if (running && sceneIdx >= 0) applyScene(SCENES[sceneIdx]);
  }

  function loadMap() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { mapImg = img; resolve(); };
      img.onerror = () => resolve(); // بلا خريطة: تبقى النصوص وحدها
      // تعبئة بيضاء وحدود مناطق سوداء لتمييزها عند القراءة
      fetchSvg().then((src) => { img.src = src; }, () => resolve());
    });
  }

  function fetchSvg() {
    return fetch(MAP_SRC).then((r) => r.text()).then((txt) => {
      const styled = txt.replace("<svg ", '<svg fill="#fff" stroke="#000" stroke-width="6" ');
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(styled);
    });
  }

  /* ---------- الصوت ---------- */
  function fadeAudio(ms) {
    if (!audio || audio.paused) return;
    const start = audio.volume, t = performance.now();
    (function step() {
      const k = Math.min(1, (performance.now() - t) / ms);
      audio.volume = start * (1 - k);
      if (k < 1) requestAnimationFrame(step);
      else audio.pause();
    })();
  }

  /* ---------- التشغيل ---------- */
  function finish() {
    if (!running && root.hidden) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    store(false, SEEN_KEY, "1");
    root.classList.add("out");
    setTimeout(() => { root.hidden = true; root.classList.remove("out", "playing"); }, 600);
    if (onDone) onDone();
  }

  function begin() {
    root.classList.add("playing");
    if (store(true, MUTE_KEY) !== "1") {
      audio = new Audio(AUDIO_SRC);
      audio.volume = 0.9;
      audio.play().catch(() => { /* الصوت غير مدعوم أو ممنوع — تستمر الحركة */ });
    }
    loadMap().then(() => {
      resize();
      makeParticles();
      window.addEventListener("resize", resize);
      running = true;
      sceneIdx = -1;
      t0 = performance.now();
      frame();
    });
  }

  function play(done) {
    onDone = done;
    root = document.getElementById("opening");
    canvas = document.getElementById("openingCanvas");
    ctx = canvas.getContext("2d");
    root.hidden = false;
    document.getElementById("openingPlay").addEventListener("click", begin, { once: true });
    document.getElementById("openingSkip").addEventListener("click", () => { fadeAudio(400); finish(); });
  }

  return { shouldShow, play, stopAudio: () => fadeAudio(900) };
})();
