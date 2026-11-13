# Plan de implementación — Japanese Memo (jp-study)

Plan aprobado para construir el visor de vocabulario japonés descrito en
`AGENTS.md`. La Google Sheet es la única fuente de verdad; el sitio es
estrictamente de lectura (SSR con Astro).

Decisiones acordadas:

- **Parser CSV:** Papa Parse (soporta comillas escapadas, comas y saltos de
  línea dentro de celdas).
- **Estilos:** CSS plano (`src/styles/global.css`), sin Tailwind.
- **Tests:** sin suite automatizada; verificación manual ad-hoc de la lógica
  pura (parser furigana, splitter de ejemplos) en cada fase.
- **Google Sheet:** ya existe y está compartida como "cualquiera con el
  enlace puede ver". Los valores reales (spreadsheet ID + gids) se ponen en
  `.env` al final (Fase 8).

---

## Fase 0 — Scaffold del proyecto Astro (SSR)

**Archivos:** `package.json`, `astro.config.mjs`, `tsconfig.json`,
`.gitignore`, `.env.example`

- Scaffold manual (el directorio no está vacío, `npm create astro` es
  interactivo): `package.json` con scripts `dev`, `build`, `preview`, `check`.
- `astro.config.mjs`: `output: 'server'` + adaptador `@astrojs/node` (modo
  standalone) — obligatorio porque los datos se leen **en cada request**, no
  en build.
- `tsconfig.json` extends `astro/tsconfigs/strict`.
- Dependencias: `astro`, `@astrojs/node`, `zod`, `papaparse`
  (+ `@types/papaparse`, `@astrojs/check`, `typescript` como devDeps).
- `.env.example`: `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_WORDS_GID`,
  `GOOGLE_SHEETS_CATEGORIES_GID` (sin valores).
- `.gitignore`: `.env`, `node_modules`, `dist`, `.astro`.

**Verificación:** `npm install && npx astro sync && npm run check` sin errores.

## Fase 1 — Configuración de entorno

**Archivo:** `src/config/env.ts`

- Esquema Zod para las 3 variables (no vacías, gids numéricos como string).
- Lectura centralizada: `process.env` primero (runtime en producción),
  fallback a `import.meta.env` (dev, Vite carga `.env`).
- Error claro al arranque si falta alguna variable.

**Verificación:** sin `.env` → `npm run dev` falla con mensaje que nombra la
variable faltante.

## Fase 2 — Dominio furigana (funciones puras)

**Archivos:** `src/features/furigana/furigana.types.ts`,
`anki-furigana.parser.ts`, `examples.splitter.ts`

- `FuriganaSegment` = `{ type: 'plain', text }` | `{ type: 'ruby', base,
  reading }`.
- `parseAnkiFurigana(text): FuriganaSegment[]` — regex de run de kanji +
  `[lectura]`. Rangos kanji: `\u4E00-\u9FFF`, `\u3400-\u4DBF`, `々` (U+3005),
  `〆` (U+3006), `ヶ` (U+30F6). Reglas críticas:
  - Lectura válida = no vacía, kana (hiragana/katakana tolerado, incl. `ー`).
  - Espacio inmediatamente antes de un grupo kanji+bracket → se consume (no
    filtra como separador dentro de la palabra).
  - Input malformado (bracket sin cerrar, bracket sin kanji previo, lectura
    vacía) → fallback a texto crudo de esa parte, **nunca throw**.
    Determinista y sin efectos secundarios.
- `toPlainText(text)` (quita lecturas → `日本語できる`) y
  `toReadingText(text)` (kanji → lectura → `にほんごできる`) para búsqueda.
- `splitExamples(text): string[]` — corta en espacio ASCII y `U+3000`
  **fuera de brackets**, colapsa repetidos, ignora vacíos.

**Verificación:** verificación manual ad-hoc con `node` usando strings de
ejemplo (`日[に]本[ほん]語[ご]できる`, casos malformados, ejemplos múltiples).

## Fase 3 — Infraestructura Google Sheets

**Archivos:** `src/infrastructure/google-sheets/columns.ts`,
`sheet-csv.client.ts`

- `columns.ts`: mapeo de headers → campo canónico en **un solo lugar**
  (`'veces repaso' → vecesRepaso`, etc.) para words y categories. Las
  columnas se resuelven **por nombre**, no por posición.
- `sheet-csv.client.ts`:
  - URL gviz construida desde env
    (`/d/<ID>/gviz/tq?tqx=out:csv&gid=<GID>`) — nunca hardcodeada.
  - `fetch` nativo + `AbortController` (timeout ~10s).
  - Manejo de errores explícito: no-200, HTML de sign-in de Google (sheet no
    pública), gid incorrecto → errores tipados con mensaje claro.
  - Parse con Papa Parse como filas de arrays; fila 0 = headers; error claro
    si faltan columnas esperadas.
  - **Caché en memoria** por gid, TTL 30s: en fallo de fetch sirve la última
    carga buena (stale-on-error).

**Verificación:** verificar en consola del servidor que la segunda request
dentro del TTL no refetchea, y que con gid inválido el error es descriptivo.

## Fase 4 — Repositorios y validación

**Archivos:** `src/infrastructure/google-sheets/vocabulary.repository.ts`,
`categories.repository.ts`,
`src/features/vocabulary/{vocabulary.types.ts, vocabulary.validation.ts,
vocabulary.service.ts}`,
`src/features/categories/{categories.types.ts, categories.validation.ts,
categories.service.ts}`

- Repositorios: CSV → records de strings (headers mapeados, filas totalmente
  vacías saltadas).
- Validación Zod por fila (en features, según estructura sugerida):
  - `id` y `palabra`: requeridos no vacíos.
  - `significado`/`ejemplos`: opcionales (vacío → `null`).
  - `aprendido`: `TRUE/FALSE/verdadero/falso/sí/no/1/0/x` (case-insensitive)
    → booleano.
  - Numéricos y fecha: parse seguro; vacío o malformado → `null` (nunca
    `NaN`).
  - Fila inválida → se omite y se **reporta** (lista de issues con id/fila y
    motivo), no rompe la página.
- Servicios: join words + categories por `categoria_id` (id desconocido →
  sin categoría, la palabra se muestra igual), y pre-cálculo del texto plano
  + lectura de `palabra` y `significado` para búsqueda (se deriva una vez en
  server, no en cada keystroke).

**Verificación:** log de filas inválidas visible en server console; entrada
válida en la Sheet aparece en la página.

## Fase 5 — UI: layout y componentes

**Archivos:** `src/styles/global.css`, `src/layouts/BaseLayout.astro`,
`src/components/vocabulary/{FuriganaText, FuriganaToggle, VocabularyItem,
VocabularyList, VocabularyFilters}.astro`,
`src/components/ui/ErrorMessage.astro`

- `global.css` (CSS plano): tipografía japonesa legible (~18-20px),
  `line-height` generoso para que `<rt>` no colisione con la línea anterior,
  `rt` al 50%, responsive, estados de foco.
- `FuriganaText.astro`: recibe texto Anki, parsea (server-side) y renderiza
  `<ruby>base<rt>lectura</rt></ruby>`. Sin `set:html` — interpolación normal
  de Astro → todo el contenido de la Sheet queda escapado (requisito de
  seguridad).
- `FuriganaToggle.astro`: botón con `aria-pressed` que alterna clase en
  `<html>`; CSS `.hide-furigana rt { display: none }`; persiste en
  `localStorage`; script inline temprano para evitar flash.
- `VocabularyItem.astro`: `<details>/<summary>` nativo. Colapsado: solo
  `palabra` con furigana. Expandido: `significado`, `ejemplos` (uno por
  línea), nombre de categoría, badge aprendido. Sin campos vacíos. `data-*`
  para búsqueda/filtros: `data-word`, `data-reading`, `data-meaning`,
  `data-category-id`, `data-learned`.
- `VocabularyFilters.astro`: input de búsqueda, select de categorías
  (dinámicas desde la Sheet), select aprendido (todos/aprendidos/
  pendientes), contador de resultados.
- `ErrorMessage.astro`: mensaje claro y genérico (sin stack traces ni
  valores de env) cuando la Sheet no carga y no hay caché.

**Verificación:** render correcto con furigana, ruby bien alineado,
expansión nativa sin JS.

## Fase 6 — Página e interactividad client-side

**Archivos:** `src/pages/index.astro`, `src/scripts/vocabulary-controls.ts`

- `index.astro` (SSR): carga datos vía servicio; en error → `ErrorMessage`;
  renderiza filtros + lista.
- Script vanilla (Astro lo empaqueta, sin framework):
  - Búsqueda en vivo (debounce ~150ms) sobre los `data-*` derivados (texto
    plano y lectura, nunca markup Anki), insensible a mayúsculas.
  - Filtros combinables por categoría y aprendido → oculta/muestra
    `<details>`, actualiza contador.
  - Lógica del toggle de furigana + `localStorage`.

**Verificación:** búsqueda por palabra, por lectura hiragana y por
significado; filtros combinados; toggle persiste tras recargar.

## Fase 7 — Robustez y casos borde

- Edición en la Sheet → visible sin redeploy tras vencer el TTL.
- Sheet inaccesible → mensaje de error + caché stale servida si existe.
- Texto con HTML en la Sheet → renderiza como texto, nunca como HTML.
- Fila malformada → página sigue funcionando, issue reportado.

## Fase 8 — Verificación final

- `npm run check` (tipos) sin errores.
- `npm run build` + `node dist/server/entry.mjs` con `--env-file=.env` → SSR
  standalone funciona.
- Smoke test manual completo en `npm run dev` contra la Sheet real
  (requiere completar `.env` con los valores reales).

---

## Addendum — Modelo de datos reestructurado (2026-11-11)

La hoja real evolucionó tras el plan original. Cambios incorporados:

- **Acceso:** URL publicada ("Publicar en la web", CSV) en vez de la
  exportación gviz; variables `GOOGLE_SHEETS_PUBLISHED_ID`,
  `GOOGLE_SHEETS_WORDS_GID`, `GOOGLE_SHEETS_CATEGORIES_GID`.
- **Columnas:** `lectura`, `significado` (opcional),
  `lectura_ejemplos`, `significado_ejemplos`; el header real de ease
  factor es `factor_facibilidad`.
- **Dos formatos de fila por celda:**
  - Kanji suelto (ids 1–316): lecturas separadas por espacio,
    listas de ejemplos por `|`.
  - Palabra completa (ids 317+): `lectura`/`lectura_ejemplos` con
    marcado Anki (`父[ちち]親[おや]`) → furigana por kanji.
- **Render:** Anki → ruby por run de kanji (`RubySegments.astro`);
  plano → ruby sobre la palabra completa o lecturas apiladas.
- **Búsqueda:** textos derivados (palabra sin lecturas, fonético con
  kanji → lectura, significados), katakana→hiragana y sin guiones ni
  espacios; nunca corchetes.
- **Estructura:** `features/vocabulary/readings.ts` (split/normalize)
  y `features/vocabulary/anki-markup.ts` (parser dual).

## Addendum — Fase 2: estudio con repetición espaciada (2026-11-13)

Plan completo y detallado en `etapa-2.md`. Resumen de decisiones:

- **Persistencia:** el progreso de estudio vive en `localStorage`
  (`jp-study:srs:v1`), validado con Zod. La hoja sigue siendo la fuente
  del contenido y sus columnas de repaso pasan a ser semilla/exportación
  opcional; la aplicación nunca escribe en la hoja.
- **Estado inicial:** las 581 filas actuales arrancan como NUEVAS
  (columnas de repaso vacías hoy).
- **Algoritmo:** SM-2 con 3 botones (0 Otra vez / 3 Bien / 5 Fácil),
  EF inicial 2.5 en `[1.3, 3.0]`, bonus de fácil ×1.3.
- **Madurez (aprendida):** intervalo ≥ 21 días (estilo Anki "mature").
- **Límite de nuevas:** global configurable, default 10/día; categoría
  elegida por lote; pseudo-categoría "Sin categoría" para las 55
  huérfanas.
- **Flujo:** pantallas separadas — "Repasar hoy" (todas las categorías,
  intercalado con Fisher-Yates) y "Aprender nuevas".
- **Sync:** botón "Sincronizar con Google Sheets" sin funcionalidad
  (placeholder) hasta decidir el mecanismo.
- **Tests:** se incorpora Vitest (dev) para dominio SM-2 y colas;
  Playwright para e2e.

Hitos: **M0** enmienda de `AGENTS.md` (hecha) · **M1** dominio SM-2 +
Vitest · **M2** persistencia + respaldo JSON · **M3** colas · **M4**
API pool + UI de sesión · **M5** integración (nav, badge, ajustes) ·
**M6** a11y/e2e.

## Fuera de alcance

Autenticación, escrituras en la hoja, Google API keys, base de datos
propia, generación/corrección de furigana, gamificación, análisis
complejos, schedulers distintos de SM-2 (p. ej. FSRS) y sincronización
real con la hoja (el botón queda como placeholder hasta decidir el
mecanismo; ver `etapa-2.md`).
