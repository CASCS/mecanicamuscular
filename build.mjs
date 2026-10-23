// Generador estático: lee content/ (Markdown + JSON) y escribe dist/
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PER_PAGE = 9;

// ---------- utilidades ----------
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (s) =>
  String(s)
    .replace(/[À-ɏ]/g, (c) => c.normalize("NFD").replace(/\p{M}/gu, "")) // quita tildes solo en latín
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

const hrefSlug = (s) => encodeURIComponent(s);

async function write(rel, content) {
  const file = path.join(DIST, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function listMd(dir) {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function readingTime(text) {
  const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`\[\]()!-]/g, " ");
  const cjk = (plain.match(/[぀-ヿ㐀-鿿]/g) || []).length;
  const words = plain.replace(/[぀-ヿ㐀-鿿]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200 + cjk / 500));
}

// ¿Existe en static/ el archivo local al que apunta esta ruta? (las rutas externas siempre valen)
const localMissing = (src) => {
  if (!src || !src.startsWith("/") || src.startsWith("//")) return false;
  try {
    return !existsSync(path.join(ROOT, "static", decodeURIComponent(src.split("?")[0])));
  } catch {
    return false;
  }
};

function renderMd(md) {
  return marked
    .parse(md, { gfm: true, breaks: false })
    // si una imagen local todavía no está en static/, se omite en vez de mostrar un icono roto
    .replace(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/g, (tag, src) => (localMissing(src) ? "" : tag))
    .replace(/<img /g, '<img loading="lazy" ');
}

await fs.rm(DIST, { recursive: true, force: true });

// ---------- carga de contenido ----------
const site = JSON.parse(await fs.readFile(path.join(ROOT, "content/settings/site.json"), "utf8"));
const BASE = (process.env.URL || site.url || "").replace(/\/$/, "");
const lang = site.lang || "es";

const fmtDate = (d) =>
  d.toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const posts = [];
for (const file of await listMd(path.join(ROOT, "content/posts"))) {
  const { data, content } = matter(await fs.readFile(file, "utf8"));
  if (data.draft) continue;
  const slug = path.basename(file, ".md");
  const date = data.date ? new Date(data.date) : new Date();
  const tags = (data.tags || []).map((t) => String(t).trim()).filter(Boolean);
  posts.push({
    slug,
    url: `/${hrefSlug(slug)}/`,
    title: data.title || slug,
    description: data.description || "",
    image: localMissing(data.image) ? "" : data.image || "",
    tags,
    featured: !!data.featured,
    date,
    minutes: readingTime(content),
    html: renderMd(content),
  });
}
posts.sort((a, b) => b.date - a.date);

const pages = [];
for (const file of await listMd(path.join(ROOT, "content/pages"))) {
  const { data, content } = matter(await fs.readFile(file, "utf8"));
  if (data.draft) continue;
  const slug = path.basename(file, ".md");
  pages.push({ slug, url: `/${hrefSlug(slug)}/`, title: data.title || slug, description: data.description || "", html: renderMd(content) });
}

const tagMap = new Map();
for (const p of posts) {
  for (const t of p.tags) {
    const s = slugify(t);
    if (!s) continue;
    if (!tagMap.has(s)) tagMap.set(s, { name: t, slug: s, posts: [] });
    tagMap.get(s).posts.push(p);
  }
}

// ---------- plantillas ----------
const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

const initial = (name) => esc((name || "?").trim().charAt(0).toUpperCase());

function layout({ title, description, urlPath, body, image, ogType = "website", afterRecommended = false }) {
  const fullTitle = title ? `${title} · ${site.title}` : site.title;
  const desc = description || site.description;
  const canonical = BASE ? `${BASE}${urlPath}` : "";
  const ogImage = image ? (image.startsWith("http") ? image : BASE + image) : "";
  const nav = (site.nav || [])
    .map((n) => `<a href="${esc(n.url)}"${n.url === urlPath ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`)
    .join("");
  const subscribe = site.subscribe_url ? `<a class="btn" href="${esc(site.subscribe_url)}">Suscribirse</a>` : "";
  const social = (site.social || []).map((s) => `<li><a href="${esc(s.url)}" rel="me noopener">${esc(s.label)}</a></li>`).join("");
  const footNav = (site.nav || []).map((n) => `<li><a href="${esc(n.url)}">${esc(n.label)}</a></li>`).join("");

  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/rss.xml">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
<style>:root{--accent:${esc(site.accent || "#2f5bff")}}</style>
<script>try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
</head>
<body>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/">${esc(site.title)}</a>
    <nav class="nav" aria-label="Principal">${nav}</nav>
    <div class="actions">
      <button class="icon-btn" type="button" data-search aria-label="Buscar">${icons.search}</button>
      <button class="icon-btn" type="button" data-theme-toggle aria-label="Cambiar entre tema claro y oscuro">${icons.theme}</button>
      ${subscribe}
    </div>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer${afterRecommended ? " after-recommended" : ""}">
  <div class="wrap">
    <div class="footer-grid">
      <div class="about">
        <a class="brand" href="/">${esc(site.title)}</a>
        <p>${esc(site.description)}</p>
      </div>
      <div><h4>Navegar</h4><ul>${footNav}<li><a href="/rss.xml">RSS</a></li></ul></div>
      ${social ? `<div><h4>Redes</h4><ul>${social}</ul></div>` : "<div></div>"}
    </div>
    <p class="copy">© ${new Date().getFullYear()} ${esc(site.title)}${site.footer_note ? ` · ${esc(site.footer_note)}` : ""}</p>
  </div>
</footer>
<div class="search" id="search" role="dialog" aria-modal="true" aria-label="Buscar" hidden>
  <button class="icon-btn search-close" type="button" aria-label="Cerrar búsqueda">${icons.close}</button>
  <div class="search-box">
    <label class="sr-only" for="search-input">Buscar artículos</label>
    <input id="search-input" type="search" placeholder="Buscar artículos" autocomplete="off">
    <ul class="search-results"></ul>
    <p class="search-empty" hidden>No hay resultados. Prueba con otra palabra.</p>
  </div>
</div>
<script src="/js/main.js" defer></script>
</body>
</html>`;
}

const tagsHtml = (tags) =>
  tags.length
    ? `<div class="tags">${tags.map((t) => `<a class="tag" href="/tag/${hrefSlug(slugify(t))}/">${esc(t)}</a>`).join("")}</div>`
    : "";

const media = (p, extra = "") =>
  p.image
    ? `<a class="card-media${extra}" href="${p.url}" tabindex="-1" aria-hidden="true"><img src="${esc(p.image)}" alt="" loading="lazy"></a>`
    : `<a class="card-media placeholder${extra}" href="${p.url}" tabindex="-1" aria-hidden="true">${initial(p.title)}</a>`;

const byline = (p) =>
  `<div class="byline"><span class="avatar" aria-hidden="true">${initial(site.author)}</span><span><strong>${esc(site.author)}</strong> · <time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time> · ${p.minutes} min de lectura</span></div>`;

const card = (p) => `<article class="card">
  ${media(p)}
  <div class="card-body">
    ${tagsHtml(p.tags)}
    <h2 class="card-title"><a href="${p.url}">${esc(p.title)}</a></h2>
    ${p.description ? `<p class="card-excerpt">${esc(p.description)}</p>` : ""}
    ${byline(p)}
  </div>
</article>`;

const pager = (current, total, base) => {
  if (total <= 1) return "";
  const href = (n) => (n === 1 ? base || "/" : `${base}page/${n}/`);
  return `<nav class="pager" aria-label="Paginación">
  ${current > 1 ? `<a class="btn ghost" href="${href(current - 1)}">Más recientes</a>` : ""}
  ${current < total ? `<a class="btn ghost" href="${href(current + 1)}">Más antiguos</a>` : ""}
</nav>`;
};

// ---------- portada y paginación ----------
const totalPages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
const featured = posts.filter((p) => p.featured).slice(0, 3);

for (let n = 1; n <= totalPages; n++) {
  const slice = posts.slice((n - 1) * PER_PAGE, n * PER_PAGE);
  const recommended = posts.filter((p) => p.featured).slice(3, 8);
  let body = "";

  if (n === 1) {
    body += `<section class="hero"><div class="wrap">
  <h1>${esc(site.tagline || site.title)}</h1>
  ${site.description ? `<p>${esc(site.description)}</p>` : ""}
  ${site.subscribe_url ? `<a class="btn" href="${esc(site.subscribe_url)}">Suscribirse</a>` : ""}
</div></section>`;
    if (featured.length) {
      body += `<section class="section"><div class="wrap">
  <h2 class="section-title">Para empezar</h2>
  <div class="grid featured">${featured.map(card).join("")}</div>
</div></section>`;
    }
  } else {
    body += `<section class="page-head"><div class="wrap"><h1>Página ${n}</h1></div></section>`;
  }

  if (!posts.length) {
    body += `<section class="empty"><div class="wrap"><h1>Aún no hay artículos</h1><p>Entra a /admin/ para publicar el primero.</p></div></section>`;
  } else {
    body += `<section class="section"><div class="wrap">
  <h2 class="section-title">${n === 1 ? "Lo último" : "Más artículos"}</h2>
  <div class="grid">${slice.map(card).join("")}</div>
  ${pager(n, totalPages, "/")}
</div></section>`;
  }

  if (n === 1 && recommended.length) {
    body += `<section class="recommended"><div class="wrap">
  <h2 class="section-title">Recomendados</h2>
  <div class="list">${recommended
    .map((p) => `<article class="item">${media(p)}<h3><a href="${p.url}">${esc(p.title)}</a></h3></article>`)
    .join("")}</div>
</div></section>`;
  }

  await write(n === 1 ? "index.html" : `page/${n}/index.html`, layout({
    title: n === 1 ? "" : `Página ${n}`,
    urlPath: n === 1 ? "/" : `/page/${n}/`,
    body,
    afterRecommended: n === 1 && recommended.length > 0,
  }));
}

// ---------- artículos ----------
for (const [i, p] of posts.entries()) {
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const more = posts.filter((x) => x !== p).slice(0, 3);
  const body = `<article>
  <header class="wrap article-head">
    ${tagsHtml(p.tags)}
    <h1>${esc(p.title)}</h1>
    ${p.description ? `<p class="lead">${esc(p.description)}</p>` : ""}
    ${byline(p)}
  </header>
  ${p.image ? `<figure class="wrap cover"><img src="${esc(p.image)}" alt=""></figure>` : ""}
  <div class="wrap"><div class="prose">${p.html}</div>
  <nav class="post-nav" aria-label="Más artículos">
    ${older ? `<a class="prev" href="${older.url}"><small>Anterior</small><strong>${esc(older.title)}</strong></a>` : ""}
    ${newer ? `<a class="next" href="${newer.url}"><small>Siguiente</small><strong>${esc(newer.title)}</strong></a>` : ""}
  </nav></div>
</article>
${more.length ? `<section class="section" style="margin-top:56px"><div class="wrap"><h2 class="section-title">Sigue leyendo</h2><div class="grid">${more.map(card).join("")}</div></div></section>` : ""}`;
  await write(`${p.slug}/index.html`, layout({ title: p.title, description: p.description, urlPath: p.url, body, image: p.image, ogType: "article" }));
}

// ---------- páginas ----------
for (const pg of pages) {
  const body = `<section class="wrap article-head"><h1>${esc(pg.title)}</h1></section>
<div class="wrap"><div class="prose" style="margin-top:0">${pg.html}</div></div>
<div style="height:72px"></div>`;
  await write(`${pg.slug}/index.html`, layout({ title: pg.title, description: pg.description, urlPath: pg.url, body }));
}

// ---------- etiquetas ----------
for (const t of tagMap.values()) {
  const body = `<section class="page-head"><div class="wrap"><h1>${esc(t.name)}</h1><p>${t.posts.length} ${t.posts.length === 1 ? "artículo" : "artículos"}</p></div></section>
<section class="section"><div class="wrap"><div class="grid">${t.posts.map(card).join("")}</div></div></section>`;
  await write(`tag/${t.slug}/index.html`, layout({ title: t.name, urlPath: `/tag/${hrefSlug(t.slug)}/`, body }));
}

// ---------- 404 ----------
await write("404.html", layout({
  title: "Página no encontrada",
  urlPath: "/404.html",
  body: `<section class="empty"><div class="wrap"><h1>Esta página no existe</h1><p>Puede que el enlace haya cambiado.</p><a class="btn" href="/">Volver al inicio</a></div></section>`,
}));

// ---------- búsqueda, RSS, sitemap ----------
await write("search.json", JSON.stringify(posts.map((p) => ({ title: p.title, description: p.description, tags: p.tags, url: p.url }))));

const abs = (u) => `${BASE}${u}`;
await write("rss.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(site.title)}</title>
<link>${esc(BASE || "/")}</link>
<description>${esc(site.description)}</description>
<language>${esc(lang)}</language>
${posts.slice(0, 20).map((p) => `<item><title>${esc(p.title)}</title><link>${esc(abs(p.url))}</link><guid>${esc(abs(p.url))}</guid><pubDate>${p.date.toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join("\n")}
</channel></rss>`);

if (BASE) {
  const urls = ["/", ...pages.map((x) => x.url), ...posts.map((p) => p.url), ...[...tagMap.values()].map((t) => `/tag/${hrefSlug(t.slug)}/`)];
  await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(abs(u))}</loc></url>`).join("\n")}
</urlset>`);
  await write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${BASE}/sitemap.xml\n`);
}

// ---------- archivos estáticos ----------
await fs.cp(path.join(ROOT, "static"), DIST, { recursive: true });

console.log(`Listo: ${posts.length} artículos, ${pages.length} páginas, ${tagMap.size} etiquetas → dist/`);
