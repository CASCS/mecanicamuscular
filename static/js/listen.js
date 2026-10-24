// Reproductor "Escuchar este artículo": lee el texto con la voz del navegador (Web Speech API).
(function () {
  var box = document.querySelector("[data-listen]");
  var prose = document.querySelector(".prose");
  if (!box || !prose || !("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;

  var synth = window.speechSynthesis;
  var playBtn = box.querySelector("[data-listen-play]");
  var label = box.querySelector("[data-listen-label]");
  var timeEl = box.querySelector("[data-listen-time]");
  var panel = box.querySelector("[data-listen-panel]");
  var seek = box.querySelector("[data-listen-seek]");
  var speedBtn = box.querySelector("[data-listen-speed]");
  var stopBtn = box.querySelector("[data-listen-stop]");
  var voiceSel = box.querySelector("[data-listen-voice]");

  var SPEEDS = [1, 1.25, 1.5, 0.8];
  var speedIdx = 0;
  var pageLang = (document.documentElement.lang || "es").slice(0, 2).toLowerCase();
  var voices = [];
  var voice = null;
  var chunks = [];
  var items = [];
  var cumulative = [];
  var totalChars = 0;
  var idx = 0;
  var token = 0;
  var state = "idle"; // idle | playing | paused
  var current = null;

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---------- texto a leer ----------
  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function splitText(text) {
    var sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text];
    var out = [];
    var buf = "";
    sentences.forEach(function (s) {
      if (s.length > 240) {
        // frase muy larga: se parte en comas o espacios
        if (buf) { out.push(buf); buf = ""; }
        var parts = s.split(/(?<=,)\s+/);
        var piece = "";
        parts.forEach(function (p) {
          if ((piece + " " + p).length > 200 && piece) { out.push(piece.trim()); piece = p; }
          else { piece = piece ? piece + " " + p : p; }
        });
        if (piece) out.push(piece.trim());
        return;
      }
      if ((buf + s).length > 200 && buf) { out.push(buf.trim()); buf = s; }
      else { buf += s; }
    });
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function build() {
    items = [];
    chunks = [];
    var title = document.querySelector(".article-head h1");
    if (title) items.push({ el: title, text: clean(title.textContent) });

    prose.querySelectorAll("p, h2, h3, h4, li, blockquote").forEach(function (n) {
      // la lista de referencias, las tablas y el código no se leen en voz alta
      if (n.closest("details, table, pre")) return;
      if ((n.tagName === "BLOCKQUOTE" || n.tagName === "LI") && n.querySelector("p, ul, ol")) return;
      var t = clean(n.textContent);
      if (t.length > 1) items.push({ el: n, text: t });
    });

    cumulative = [];
    totalChars = 0;
    items.forEach(function (it, i) {
      splitText(it.text).forEach(function (t) {
        cumulative.push(totalChars);
        chunks.push({ item: i, text: t });
        totalChars += t.length;
      });
    });
    seek.max = String(Math.max(chunks.length, 1));
    updateTime();
  }

  // ---------- voces ----------
  function refreshVoices() {
    var all = synth.getVoices();
    var preferred = (navigator.language || "").toLowerCase();
    voices = all
      .filter(function (v) { return v.lang.toLowerCase().indexOf(pageLang) === 0; })
      .sort(function (a, b) {
        var sa = a.lang.toLowerCase() === preferred ? 0 : 1;
        var sb = b.lang.toLowerCase() === preferred ? 0 : 1;
        return sa - sb;
      });

    if (all.length && !voices.length) { box.hidden = true; return; } // el dispositivo no tiene voz en este idioma
    box.hidden = false;

    var saved = load("listen-voice");
    voice = voices.filter(function (v) { return v.voiceURI === saved; })[0] || voices[0] || null;

    voiceSel.innerHTML = "";
    voices.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name;
      if (voice && v.voiceURI === voice.voiceURI) o.selected = true;
      voiceSel.appendChild(o);
    });
    voiceSel.hidden = voices.length < 2;
  }

  // ---------- interfaz ----------
  function rate() { return SPEEDS[speedIdx]; }

  function updateTime() {
    if (!totalChars) { timeEl.textContent = ""; return; }
    var min = Math.max(1, Math.round(totalChars / 900 / rate()));
    timeEl.textContent = min + " min";
  }

  function highlight(i) {
    if (current) current.classList.remove("is-reading");
    current = i == null ? null : items[i].el;
    if (current) current.classList.add("is-reading");
  }

  function ui() {
    panel.hidden = state === "idle";
    playBtn.setAttribute("aria-pressed", state === "playing" ? "true" : "false");
    box.classList.toggle("is-active", state !== "idle");
    label.textContent = state === "playing" ? "Pausar" : state === "paused" ? "Continuar" : "Escuchar este artículo";
    seek.value = String(idx);
    speedBtn.textContent = rate() + "×";
  }

  // ---------- reproducción ----------
  function speak() {
    if (idx >= chunks.length) { stop(); return; }
    var c = chunks[idx];
    highlight(c.item);
    seek.value = String(idx);

    var u = new SpeechSynthesisUtterance(c.text);
    u.lang = voice ? voice.lang : pageLang;
    if (voice) u.voice = voice;
    u.rate = rate();
    var mine = ++token;
    u.onend = function () {
      if (mine !== token || state !== "playing") return;
      idx++;
      speak();
    };
    u.onerror = function (e) {
      if (mine !== token) return;
      if (e.error === "canceled" || e.error === "interrupted") return;
      state = "paused";
      ui();
    };
    synth.speak(u);
  }

  function restartHere() {
    token++;
    synth.cancel();
    if (state === "playing") speak();
  }

  function play() {
    if (!chunks.length) build();
    if (!chunks.length) return;
    state = "playing";
    ui();
    token++;
    synth.cancel();
    speak();
  }

  function pause() {
    state = "paused";
    token++;
    synth.cancel(); // se retoma desde el fragmento actual
    ui();
  }

  function stop() {
    state = "idle";
    token++;
    synth.cancel();
    idx = 0;
    highlight(null);
    ui();
  }

  playBtn.addEventListener("click", function () {
    if (state === "playing") pause(); else play();
  });
  stopBtn.addEventListener("click", stop);
  speedBtn.addEventListener("click", function () {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    store("listen-speed", String(speedIdx));
    ui();
    updateTime();
    restartHere();
  });
  seek.addEventListener("input", function () {
    idx = Math.min(+seek.value, Math.max(chunks.length - 1, 0));
    if (chunks[idx]) highlight(chunks[idx].item);
    if (state === "playing") restartHere();
  });
  voiceSel.addEventListener("change", function () {
    voice = voices.filter(function (v) { return v.voiceURI === voiceSel.value; })[0] || voice;
    store("listen-voice", voice ? voice.voiceURI : "");
    restartHere();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && state !== "idle" && document.getElementById("search").hidden) stop();
  });
  window.addEventListener("pagehide", function () { synth.cancel(); });

  // ---------- arranque ----------
  var savedSpeed = parseInt(load("listen-speed"), 10);
  if (savedSpeed >= 0 && savedSpeed < SPEEDS.length) speedIdx = savedSpeed;
  build();
  ui();
  refreshVoices();
  if (synth.addEventListener) synth.addEventListener("voiceschanged", refreshVoices);
  else synth.onvoiceschanged = refreshVoices;
  // algunos navegadores cargan las voces tarde o nunca avisan: se muestra igual
  setTimeout(function () { if (!synth.getVoices().length) box.hidden = false; }, 1500);
})();
