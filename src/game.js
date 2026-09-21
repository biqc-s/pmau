/* لعبة الأرشيف — منطق اللعبة */
(function () {
  "use strict";

  const STORAGE_KEY = "archiveGame:v1";
  const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXY"; // بلا I و O تفاديًا للالتباس
  const PALETTE = ["blue", "magenta", "green", "gold", "indigo", "olive", "teal"];
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const toAr = (n) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
  const pad2 = (n) => String(Math.max(0, Math.min(99, n))).padStart(2, "0");

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ===================== الحالة ===================== */
  const ALL_SCRAPS = FILES.flatMap((f, fi) =>
    f.scraps.map((s, si) => ({
      id: f.id + "-" + si,
      fileId: f.id,
      fileIndex: fi,
      kind: s.kind,
      text: s.text,
      key: s.key
    }))
  );
  const CORRECT_ORDER = FILES.map((f) => f.id);

  let state = null;

  function freshState() {
    return {
      screen: "intro",
      startTime: null,
      endTime: null,
      tries: 0,
      placed: [],
      rotations: {},
      lifted: null,
      order: null,
      pickedIndex: null,
      orderChecked: false,
      correctMask: null
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* التخزين غير متاح — تجاهل بصمت */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* تجاهل */
    }
  }

  function fileColor(fileId) {
    const idx = FILES.findIndex((f) => f.id === fileId);
    return PALETTE[idx % PALETTE.length];
  }

  /* ===================== شاشات ===================== */
  const screens = {
    intro: $("#intro"),
    sort: $("#sortScreen"),
    order: $("#orderScreen"),
    final: $("#final")
  };

  function showScreen(name) {
    state.screen = name;
    Object.entries(screens).forEach(([k, el]) => {
      el.hidden = k !== name;
    });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    save();
  }

  /* ===================== شريط التقدم ===================== */
  function updateProgress() {
    const bar = $("#bar");
    const counter = $("#counter");
    if (state.screen === "sort") {
      const ratio = state.placed.length / ALL_SCRAPS.length;
      bar.style.width = (ratio * 70).toFixed(1) + "%";
      counter.textContent = toAr(state.placed.length) + " من " + toAr(ALL_SCRAPS.length);
    } else if (state.screen === "order") {
      bar.style.width = "78%";
      counter.textContent = "الترتيب الزمني";
    } else if (state.screen === "final") {
      bar.style.width = "100%";
      counter.textContent = "اكتمل";
    } else {
      bar.style.width = "0%";
      counter.textContent = "";
    }
  }

  /* ===================== شاشة الفرز ===================== */
  function renderSort() {
    const table = $("#table");
    const tray = $("#tray");
    table.innerHTML = "";
    tray.innerHTML = "";

    ALL_SCRAPS.filter((s) => !state.placed.includes(s.id)).forEach((s) => {
      if (!(s.id in state.rotations)) {
        state.rotations[s.id] = (Math.random() * 16 - 8).toFixed(1);
      }
      const el = document.createElement("div");
      el.className = "paper" + (state.lifted === s.id ? " lifted" : "");
      el.style.setProperty("--rot", state.rotations[s.id] + "deg");
      el.dataset.id = s.id;
      el.innerHTML =
        '<span class="k">' + s.kind + "</span>" +
        '<p class="t">' + s.text + "</p>";
      el.addEventListener("click", () => onPaperClick(s.id));
      table.appendChild(el);
    });

    FILES.forEach((f) => {
      const count = state.placed.filter((id) => id.startsWith(f.id + "-")).length;
      const done = count >= f.scraps.length;
      const el = document.createElement("div");
      el.className = "file-slot" + (done ? " done" : "");
      el.style.setProperty("--fcolor", "var(--" + fileColor(f.id) + ")");
      el.dataset.id = f.id;
      const dots = f.scraps
        .map((_, i) => '<i class="' + (i < count ? "on" : "") + '"></i>')
        .join("");
      el.innerHTML = '<div class="fn">' + f.name + "</div>" + '<div class="fc">' + dots + "</div>";
      el.addEventListener("click", () => onFileClick(f.id));
      tray.appendChild(el);
    });

    updateProgress();
    save();
  }

  function setGuide(text, isErr) {
    const guide = $("#guide");
    const guideText = $("#guideText");
    guideText.textContent = text;
    guide.classList.toggle("err", !!isErr);
  }

  function onPaperClick(id) {
    state.lifted = state.lifted === id ? null : id;
    setGuide(
      state.lifted
        ? "الآن انقر الملف الذي تظنها تخصّه أسفل الشاشة."
        : "انقر أي ورقة على الطاولة."
    );
    renderSort();
  }

  function onFileClick(fileId) {
    if (!state.lifted) return;
    const scrap = ALL_SCRAPS.find((s) => s.id === state.lifted);
    if (scrap.fileId === fileId) {
      state.placed.push(scrap.id);
      state.lifted = null;
      setGuide("أحسنت! انقر أي ورقة أخرى على الطاولة.");
      if (state.placed.length === ALL_SCRAPS.length) {
        setGuide("اكتمل فرز جميع الأوراق. جارٍ الانتقال للترتيب…");
        save();
        setTimeout(startOrderPhase, 750);
        updateProgress();
        return;
      }
    } else {
      state.tries += 1;
      state.lifted = null;
      setGuide(scrap.key, true);
      const slotEl = $('.file-slot[data-id="' + fileId + '"]');
      if (slotEl) {
        slotEl.classList.add("wrong");
        setTimeout(() => slotEl.classList.remove("wrong"), 350);
      }
    }
    renderSort();
  }

  /* ===================== شاشة الترتيب ===================== */
  function startOrderPhase() {
    let order = shuffle(CORRECT_ORDER);
    if (order.every((id, i) => id === CORRECT_ORDER[i])) {
      order = shuffle(order);
    }
    state.order = order;
    state.pickedIndex = null;
    state.orderChecked = false;
    state.correctMask = null;
    showScreen("order");
    renderOrder();
  }

  function renderOrder(justChecked) {
    const list = $("#orderList");
    const last = state.order.length - 1;
    list.innerHTML = "";
    state.order.forEach((fileId, i) => {
      const f = FILES.find((x) => x.id === fileId);
      const el = document.createElement("div");
      const mark = state.correctMask ? (state.correctMask[i] ? " correct" : " incorrect") : "";
      el.className = "order-item" + (state.pickedIndex === i ? " picked" : "") + mark;
      el.style.setProperty("--fcolor", "var(--" + fileColor(fileId) + ")");
      el.dataset.index = String(i);
      el.innerHTML =
        '<span class="pos">' + toAr(i + 1) + "</span>" +
        '<span class="oi-main">' +
        '<span class="fn">' + f.name + "</span>" +
        '<span class="od">' + f.date + "</span>" +
        "</span>" +
        '<span class="oi-moves">' +
        '<button class="mv" type="button" aria-label="تحريك للأعلى"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
        '<button class="mv" type="button" aria-label="تحريك للأسفل"' + (i === last ? " disabled" : "") + ">▼</button>" +
        "</span>";
      el.addEventListener("click", () => onOrderItemClick(i));
      const [up, down] = el.querySelectorAll(".mv");
      up.addEventListener("click", (e) => { e.stopPropagation(); moveOrderItem(i, -1); });
      down.addEventListener("click", (e) => { e.stopPropagation(); moveOrderItem(i, 1); });
      if (justChecked && state.correctMask && !state.correctMask[i]) {
        el.classList.add("wrong");
        setTimeout(() => el.classList.remove("wrong"), 350);
      }
      list.appendChild(el);
    });
    updateProgress();
    save();
  }

  function moveOrderItem(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.order.length) return;
    const a = state.order;
    [a[i], a[j]] = [a[j], a[i]];
    state.correctMask = null;
    state.pickedIndex = null;
    renderOrder();
  }

  function onOrderItemClick(i) {
    state.correctMask = null;
    if (state.pickedIndex === null) {
      state.pickedIndex = i;
    } else if (state.pickedIndex === i) {
      state.pickedIndex = null;
    } else {
      const arr = state.order;
      [arr[state.pickedIndex], arr[i]] = [arr[i], arr[state.pickedIndex]];
      state.pickedIndex = null;
    }
    renderOrder();
  }

  function onCheckOrder() {
    const correctMask = state.order.map((id, i) => id === CORRECT_ORDER[i]);
    const allCorrect = correctMask.every(Boolean);
    state.correctMask = correctMask;
    renderOrder(true);

    if (allCorrect) {
      $("#orderText").textContent = "الترتيب صحيح! الأرشيف مُرتّب بالكامل.";
      $("#orderGuide").classList.remove("err");
      state.endTime = Date.now();
      save();
      setTimeout(showFinal, 600);
    } else {
      const correctCount = correctMask.filter(Boolean).length;
      state.tries += 1;
      $("#orderText").textContent =
        "الملفات المظلّلة بالأحمر في غير موضعها الصحيح (" + toAr(correctCount) + " من " + toAr(correctMask.length) + " في موضعه). حرّكها بالأسهم حسب التواريخ، وحاول مجددًا.";
      $("#orderGuide").classList.add("err");
      save();
    }
  }

  /* ===================== الخاتمة ===================== */
  function formatTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return { mm, ss, label: toAr(pad2(mm)) + ":" + toAr(pad2(ss)) };
  }

  function buildCode(mm, ss, tries) {
    const mmStr = pad2(mm);
    const ssStr = pad2(ss);
    const ttStr = pad2(tries);
    const digits = (mmStr + ssStr + ttStr).split("").map(Number);
    const sum = digits.reduce((a, b) => a + b, 0);
    const idx = (sum * 7 + 3) % 23;
    return "ARK-" + mmStr + ssStr + "-" + ttStr + "-" + LETTERS[idx];
  }

  function showFinal() {
    showScreen("final");

    const list = $("#timeline");
    list.innerHTML = "";
    FILES.forEach((f) => {
      const li = document.createElement("li");
      li.style.setProperty("--tcolor", "var(--" + fileColor(f.id) + ")");
      li.innerHTML =
        '<div class="tl-date">' + f.date + "</div>" +
        '<div class="tl-name">' + f.name + "</div>" +
        '<div class="tl-event">' + f.event + "</div>";
      list.appendChild(li);
    });

    const elapsed = (state.endTime || Date.now()) - (state.startTime || Date.now());
    const { mm, ss, label } = formatTime(elapsed);
    $("#stTime").textContent = label;
    $("#stTries").textContent = toAr(state.tries);

    const code = buildCode(mm, ss, state.tries);
    $("#stCode").textContent = code;
    state.code = code;

    if (typeof FORM_URL === "string" && FORM_URL.trim()) {
      $("#regLine").textContent = "احفظ البطاقة وانسخ الرمز أدناه، ثم ارفعهما في نموذج إتمام المشاركة:";
      $("#regBtn").hidden = false;
    } else {
      $("#regLine").textContent = "احتفظ برمز الإتمام والبطاقة أدناه — سيُعلن نموذج إتمام المشاركة قريبًا.";
      $("#regBtn").hidden = true;
    }

    save();
  }

  /* ===================== أزرار الخاتمة ===================== */
  function onCopyCode() {
    const code = $("#stCode").textContent;
    const done = () => {
      const btn = $("#copyBtn");
      const original = btn.textContent;
      btn.textContent = "تم النسخ ✓";
      setTimeout(() => (btn.textContent = original), 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(done);
    } else {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* تجاهل */ }
      document.body.removeChild(ta);
      done();
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function saduBand(ctx, img, y, h, W) {
    const n = Math.ceil(W / h);
    for (let i = 0; i < n; i++) ctx.drawImage(img, i * h, y, h, h);
  }

  async function onSaveCard() {
    const canvas = $("#cardCanvas");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const midX = W / 2;

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#082b28");
    grad.addColorStop(1, "#04211f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const BAND = 76;
    try {
      const sadu = await loadImage(CARD_SADU);
      ctx.globalAlpha = 0.85;
      saduBand(ctx, sadu, 0, BAND, W);
      saduBand(ctx, sadu, H - BAND, BAND, W);
      ctx.globalAlpha = 1;
    } catch (e) {
      /* تجاهل تعذر تحميل النقش */
    }

    try {
      const img = await loadImage(CARD_PORTRAIT);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const r = 150, cy = 330;
      ctx.save();
      ctx.beginPath();
      ctx.arc(midX, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, sx, 0, side, side, midX - r, cy - r, r * 2, r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(midX, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#a97d2c";
      ctx.stroke();
    } catch (e) {
      /* تجاهل تعذر تحميل الصورة */
    }

    ctx.direction = "rtl";
    ctx.textAlign = "center";

    ctx.fillStyle = "#eef7f2";
    ctx.font = "800 44px Tajawal, sans-serif";
    ctx.fillText("الأمير مساعد بن عبدالرحمن آل سعود", midX, 570);

    ctx.fillStyle = "rgba(238,247,242,.55)";
    ctx.font = "400 28px Tajawal, sans-serif";
    ctx.fillText("رحمه الله · أخو الملك المؤسس", midX, 620);

    ctx.fillStyle = "#5ab91c";
    ctx.font = "700 32px Tajawal, sans-serif";
    ctx.fillText("اليوم الوطني السعودي ٩٦", midX, 730);

    ctx.fillStyle = "#eef7f2";
    ctx.font = "800 64px Tajawal, sans-serif";
    ctx.fillText("لعبة الأرشيف", midX, 810);

    ctx.fillStyle = "rgba(238,247,242,.7)";
    ctx.font = "400 28px Tajawal, sans-serif";
    ctx.fillText("رمز الإتمام", midX, 910);

    ctx.direction = "ltr";
    ctx.fillStyle = "#a97d2c";
    ctx.font = "700 58px ui-monospace, monospace";
    ctx.fillText(state.code || "", midX, 985);

    // عزل القيم الرقمية (U+2066…U+2069) وإلا انعكس "٠٠:٠٢" بصريًا داخل سطر عربي
    const iso = (s) => "⁦" + s + "⁩";
    ctx.direction = "rtl";
    ctx.fillStyle = "rgba(238,247,242,.7)";
    ctx.font = "400 28px Tajawal, sans-serif";
    ctx.fillText("مدة البحث: " + iso($("#stTime").textContent), midX, 1085);
    ctx.fillText("محاولات خاطئة: " + iso($("#stTries").textContent), midX, 1135);

    ctx.fillStyle = "rgba(238,247,242,.55)";
    ctx.font = "400 26px Tajawal, sans-serif";
    ctx.fillText("كلية الحوسبة والمعلوماتية", midX, 1225);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "بطاقة-اتمام-الأرشيف.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function onReset() {
    clearSave();
    state = freshState();
    showScreen("intro");
  }

  /* ===================== نوافذ ===================== */
  function wireModal(modalId, openTriggers, closeId) {
    const modal = $("#" + modalId);
    openTriggers.forEach((el) => el.addEventListener("click", () => (modal.hidden = false)));
    $("#" + closeId).addEventListener("click", () => (modal.hidden = true));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  }

  function renderSources() {
    const list = $("#srcList");
    list.innerHTML = "";
    FILES.forEach((f) => {
      const li = document.createElement("li");
      li.innerHTML =
        '<div class="sn">' + f.name + "</div>" +
        '<div class="sd">' + f.source + "</div>" +
        '<a href="' + f.url + '" target="_blank" rel="noopener noreferrer">فتح المصدر ↗</a>';
      list.appendChild(li);
    });
  }

  /* ===================== بدء التشغيل ===================== */
  function init() {
    const saved = load();
    if (saved && saved.screen && saved.screen !== "intro") {
      state = Object.assign(freshState(), saved);
    } else {
      state = freshState();
    }

    renderSources();
    wireModal("helpModal", [$("#helpBtn")], "helpClose");
    wireModal("srcModal", $$("[data-srcs]"), "srcClose");

    $("#startBtn").addEventListener("click", () => {
      state.startTime = Date.now();
      showScreen("sort");
      renderSort();
    });
    $("#checkBtn").addEventListener("click", onCheckOrder);
    $("#copyBtn").addEventListener("click", onCopyCode);
    $("#saveBtn").addEventListener("click", onSaveCard);
    $("#resetBtn").addEventListener("click", onReset);
    $("#regBtn").addEventListener("click", () => {
      if (typeof FORM_URL === "string" && FORM_URL.trim()) {
        window.open(FORM_URL, "_blank", "noopener");
      }
    });

    if (state.screen === "sort") {
      showScreen("sort");
      renderSort();
    } else if (state.screen === "order" && state.order) {
      showScreen("order");
      renderOrder();
    } else if (state.screen === "final" && state.endTime) {
      showFinal();
    } else {
      showScreen("intro");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
