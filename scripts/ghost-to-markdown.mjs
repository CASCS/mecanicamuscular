// Convierte una exportación JSON de Ghost en archivos Markdown para content/
// Uso: npm run import:ghost -- ruta/al/export.json
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
// Páginas que se importan como borrador: --draft-pages=membership,otra-pagina
const draftPages = new Set(((args.find((a) => a.startsWith("--draft-pages=")) || "").split("=")[1] || "").split(",").filter(Boolean));
if (!input) {
  console.error("Falta la ruta del JSON de Ghost.\nUso: npm run import:ghost -- ruta/al/export.json");
  process.exit(1);
}

const ROOT = process.cwd();
const POSTS_DIR = path.join(ROOT, "content/posts");
const PAGES_DIR = path.join(ROOT, "content/pages");
const RESERVED = new Set(["page", "tag", "admin", "css", "js", "images", "ghost-content", "search", "rss", "sitemap", "404"]);

const data = JSON.parse(await fs.readFile(input, "utf8")).db[0].data;

// ---------- Ghost → rutas del sitio nuevo ----------
// Las imágenes y videos propios de Ghost se esperan en static/ghost-content/ (misma estructura que content/ en Ghost).
const needed = new Set();
function fixUrls(s) {
  if (!s) return s;
  return s
    .replace(/__GHOST_URL__\/content\/([^"'\s)<]+)/g, (_, rest) => {
      needed.add(`ghost-content/${decodeURIComponent(rest.split("?")[0])}`);
      return `/ghost-content/${rest}`;
    })
    .replace(/__GHOST_URL__\//g, "/")
    .replace(/__GHOST_URL__/g, "/");
}

// ---------- HTML → Markdown ----------
const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
td.use(gfm);
td.keep(["iframe", "video", "source"]);
td.addRule("supsub", { filter: ["sup", "sub"], replacement: (c, n) => `<${n.nodeName.toLowerCase()}>${c.trim()}</${n.nodeName.toLowerCase()}>` });

const all = (node, sel) => Array.prototype.slice.call(node.querySelectorAll(sel));
const kids = (node) => Array.prototype.slice.call(node.childNodes).filter((c) => c.nodeType === 1);
const has = (node, cls) => node.classList && node.classList.contains(cls);
const inner = (node) => td.turndown(node.innerHTML || "").trim();

// Tablas: se reescriben limpias (sin los estilos de Word/Office que traían al pegarlas en Ghost).
// Sin celdas combinadas → tabla Markdown (la primera fila hace de encabezado).
// Con celdas combinadas → HTML mínimo, sin atributos de estilo.
td.addRule("table", {
  filter: (n) => n.nodeName === "TABLE",
  replacement: (_c, n) => {
    const rows = all(n, "tr");
    if (!rows.length) return "";
    const cells = (tr) => kids(tr).filter((c) => c.nodeName === "TD" || c.nodeName === "TH");
    const text = (c) => td.turndown(c.innerHTML).replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|").trim();
    const merged = rows.some((tr) => cells(tr).some((c) => +c.getAttribute("colspan") > 1 || +c.getAttribute("rowspan") > 1));
    if (merged) {
      const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const body = rows
        .map((tr) => {
          const tds = cells(tr).map((c) => {
            const tag = c.nodeName.toLowerCase();
            const span = ["colspan", "rowspan"].filter((a) => +c.getAttribute(a) > 1).map((a) => ` ${a}="${+c.getAttribute(a)}"`).join("");
            return `<${tag}${span}>${esc(c.textContent.replace(/\s+/g, " ").trim())}</${tag}>`;
          });
          return `<tr>${tds.join("")}</tr>`;
        })
        .join("\n");
      return `\n\n<table>\n${body}\n</table>\n\n`;
    }
    const grid = rows.map((tr) => cells(tr).map(text));
    const cols = Math.max(...grid.map((r) => r.length));
    const pad = (r) => [...r, ...Array(cols - r.length).fill("")];
    const line = (r) => `| ${pad(r).join(" | ")} |`;
    return `\n\n${line(grid[0])}\n| ${Array(cols).fill("---").join(" | ")} |\n${grid.slice(1).map(line).join("\n")}\n\n`;
  },
});

// Quita los envoltorios <span> y <font> que quedaron de pegar texto desde Word.
td.addRule("unwrap", { filter: ["span", "font"], replacement: (c) => c });

td.addRule("toggle", {
  filter: (n) => n.nodeName === "DIV" && has(n, "kg-toggle-card"),
  replacement: (_c, n) => {
    const q = n.querySelector(".kg-toggle-heading-text");
    const body = n.querySelector(".kg-toggle-content");
    return `\n\n<details>\n<summary>${q ? q.textContent.trim() : "Ver más"}</summary>\n\n${body ? inner(body) : ""}\n\n</details>\n\n`;
  },
});

td.addRule("callout", {
  filter: (n) => n.nodeName === "DIV" && has(n, "kg-callout-card"),
  replacement: (_c, n) => {
    const emoji = n.querySelector(".kg-callout-emoji");
    const text = n.querySelector(".kg-callout-text");
    const tone = has(n, "kg-callout-card-blue") ? "blue" : "grey";
    return `\n\n<div class="callout callout-${tone}">\n<div class="callout-emoji">${emoji ? emoji.textContent.trim() : ""}</div>\n<div class="callout-body">\n\n${text ? inner(text) : ""}\n\n</div>\n</div>\n\n`;
  },
});

td.addRule("gallery", {
  filter: (n) => n.nodeName === "FIGURE" && has(n, "kg-gallery-card"),
  replacement: (_c, n) => {
    const imgs = all(n, "img").map((i) => `![${i.getAttribute("alt") || ""}](${i.getAttribute("src")})`);
    const cap = n.querySelector("figcaption");
    return `\n\n${imgs.join("\n\n")}\n\n${cap && cap.textContent.trim() ? `*${cap.textContent.trim()}*\n\n` : ""}`;
  },
});

td.addRule("video", {
  filter: (n) => n.nodeName === "FIGURE" && has(n, "kg-video-card"),
  replacement: (_c, n) => {
    const v = n.querySelector("video");
    if (!v) return "";
    const poster = v.getAttribute("poster");
    return `\n\n<video controls preload="metadata" src="${v.getAttribute("src")}"${poster ? ` poster="${poster}"` : ""}></video>\n\n`;
  },
});

td.addRule("figure", {
  filter: (n) => n.nodeName === "FIGURE",
  replacement: (content, n) => {
    const img = n.querySelector("img");
    const cap = n.querySelector("figcaption");
    const capMd = cap && cap.textContent.trim() ? `*${td.turndown(cap.innerHTML).trim().replace(/\n+/g, " ")}*` : "";
    if (img) {
      const alt = (img.getAttribute("alt") || "").replace(/[\[\]]/g, "");
      return `\n\n![${alt}](${img.getAttribute("src")})\n\n${capMd ? capMd + "\n\n" : ""}`;
    }
    return `\n\n${content.trim()}\n\n`;
  },
});

function toMarkdown(html) {
  return td
    .turndown(fixUrls(html))
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

function excerptFrom(html) {
  const p = (html || "").match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!p) return "";
  const text = p[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return text.slice(0, 180).replace(/\s+\S*$/, "") + "…";
}

// ---------- etiquetas ----------
const tagById = new Map(data.tags.map((t) => [t.id, t]));
const tagsOf = new Map();
for (const pt of [...data.posts_tags].sort((a, b) => a.sort_order - b.sort_order)) {
  const t = tagById.get(pt.tag_id);
  if (!t || t.name.startsWith("#")) continue; // las etiquetas internas de Ghost (#...) no son públicas
  if (!tagsOf.has(pt.post_id)) tagsOf.set(pt.post_id, []);
  tagsOf.get(pt.post_id).push(t.name);
}

// ---------- conversión ----------
await fs.mkdir(POSTS_DIR, { recursive: true });
await fs.mkdir(PAGES_DIR, { recursive: true });

const stats = { posts: 0, postsDraft: 0, pages: 0, pagesDraft: 0, skipped: [], paid: [], reserved: [] };

for (const x of data.posts) {
  const html = x.html || "";
  if (!html.trim()) {
    stats.skipped.push(`${x.type}: ${x.title}`);
    continue;
  }
  if (RESERVED.has(x.slug)) stats.reserved.push(x.slug);

  const paid = x.visibility && x.visibility !== "public";
  const draft = x.status !== "published" || paid;
  const body = toMarkdown(html);
  const desc = (x.custom_excerpt || excerptFrom(html)).replace(/\s+/g, " ").trim();
  const dateIso = new Date(x.published_at || x.created_at).toISOString();

  if (x.type === "page") {
    const pageDraft = draft || draftPages.has(x.slug);
    const fm = { title: x.title, description: desc, draft: pageDraft };
    await fs.writeFile(path.join(PAGES_DIR, `${x.slug}.md`), matter.stringify(body, fm));
    pageDraft ? stats.pagesDraft++ : stats.pages++;
    continue;
  }

  const image = fixUrls(x.feature_image || "");
  if (image.startsWith("/ghost-content/")) needed.add(image.slice(1));
  const fm = {
    title: x.title,
    date: dateIso,
    description: desc,
    image,
    tags: tagsOf.get(x.id) || [],
    featured: !!x.featured,
    draft,
  };
  await fs.writeFile(path.join(POSTS_DIR, `${x.slug}.md`), matter.stringify(body, fm));
  draft ? stats.postsDraft++ : stats.posts++;
  if (paid) stats.paid.push(x.title);
}

// lista de archivos de Ghost que hay que restaurar en static/
const list = [...needed].sort();
await fs.writeFile(path.join(ROOT, "ghost-images-needed.txt"), list.map((p) => `static/${p}`).join("\n") + "\n");

const authors = data.users.map((u) => u.name).join(", ");
const site = Object.fromEntries(data.settings.filter((s) => ["title", "description"].includes(s.key)).map((s) => [s.key, s.value]));

console.log(JSON.stringify({ ...stats, skippedCount: stats.skipped.length, filesNeeded: list.length, authors, site }, null, 2));
