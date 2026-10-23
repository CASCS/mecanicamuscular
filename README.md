# Mi blog

Sitio estático en HTML y CSS, con edición desde `/admin/` (Decap CMS) y alojamiento en Netlify.

## Estructura

- `content/posts/` artículos en Markdown
- `content/pages/` páginas sueltas (Acerca de)
- `content/settings/site.json` nombre, lema, menú, color de acento
- `static/css/style.css` todo el diseño
- `static/admin/config.yml` configuración del panel
- `build.mjs` genera la carpeta `dist/`

## Publicar

1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: **Add new site → Import from Git**. Netlify lee `netlify.toml` y no necesita más ajustes.
3. En `static/admin/config.yml` cambia `repo:` por `usuario/repositorio`.
4. Activa el inicio de sesión del panel con GitHub (OAuth) en los ajustes del sitio en Netlify.
5. Entra a `tu-sitio.netlify.app/admin/`.

## Probar en tu computador

```
npm install
npm run dev
```

## Importar desde Ghost

1. Exporta tus datos desde Ghost (Settings → Labs → Export) y guarda el archivo `.json`.
2. Ejecuta `npm run import:ghost -- ruta/al/export.json --draft-pages=membership`.
3. Los artículos quedan en `content/posts/`, las páginas en `content/pages/` y las etiquetas internas de Ghost (las que empiezan con `#`) se descartan.
4. Los artículos que en Ghost eran borradores o solo para suscriptores quedan con `draft: true` y no se publican.

### Imágenes propias de Ghost

El JSON de Ghost trae solo los enlaces de las imágenes, no los archivos. Si conservas la carpeta `content` de tu Ghost antiguo, copia sus carpetas `images` y `media` dentro de `static/ghost-content/`. El archivo `ghost-images-needed.txt` lista cada archivo que los artículos esperan. Mientras una imagen no esté en esa carpeta, el sitio la omite y la tarjeta muestra un bloque de color con la inicial del título.
