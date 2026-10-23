(function () {
  var root = document.documentElement;

  // Tema claro / oscuro
  var themeBtn = document.querySelector("[data-theme-toggle]");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
    });
  }

  // Búsqueda
  var panel = document.getElementById("search");
  if (!panel) return;
  var input = panel.querySelector("input");
  var list = panel.querySelector(".search-results");
  var empty = panel.querySelector(".search-empty");
  var index = null;
  var lastFocus = null;

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function load() {
    if (index) return Promise.resolve(index);
    return fetch("/search.json").then(function (r) { return r.json(); }).then(function (d) {
      index = d.map(function (p) {
        p._text = norm([p.title, p.description, (p.tags || []).join(" ")].join(" "));
        return p;
      });
      return index;
    });
  }

  function render(q) {
    list.innerHTML = "";
    empty.hidden = true;
    q = norm(q.trim());
    if (q.length < 2) return;
    var terms = q.split(/\s+/);
    var hits = index.filter(function (p) {
      return terms.every(function (t) { return p._text.indexOf(t) !== -1; });
    }).slice(0, 12);
    if (!hits.length) { empty.hidden = false; return; }
    hits.forEach(function (p) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = p.url;
      var s = document.createElement("strong");
      s.textContent = p.title;
      var d = document.createElement("span");
      d.textContent = p.description || "";
      a.appendChild(s); a.appendChild(d);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    document.body.style.overflow = "hidden";
    input.focus();
    load().then(function () { render(input.value); });
  }
  function close() {
    panel.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll("[data-search]").forEach(function (b) { b.addEventListener("click", open); });
  panel.querySelector(".search-close").addEventListener("click", close);
  input.addEventListener("input", function () { if (index) render(input.value); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) close();
    if ((e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) && panel.hidden &&
        !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); open();
    }
  });
})();
