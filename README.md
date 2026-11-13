# Japanese Memo

Visor personal de vocabulario japonés con furigana y modo de estudio
(repetición espaciada SM-2). El contenido vive en una Google Sheet
publicada; la web solo lee y nunca escribe en ella.

## Funciones

- Lista de vocabulario con furigana al expandir cada palabra.
- Búsqueda por palabra, lectura o significado, y filtros por categoría y
  estado aprendido.
- Repaso diario y aprendizaje de palabras nuevas con cupo configurable.
- Progreso de estudio guardado solo en el navegador (`localStorage`),
  con exportación e importación de copia de seguridad JSON.
- Sin cuentas, sin cookies de autenticación y sin credenciales de Google.

## Requisitos

- Node.js >= 22.23.4
- npm >= 9.6.5
- Una Google Sheet publicada en la web como CSV (una pestaña de palabras
  y otra de categorías).

## Puesta en marcha

```bash
npm install
cp .env.example .env
# Edita .env con los identificadores de tu hoja
npm run dev
```

La app queda en `http://localhost:4321`.

### Variables de entorno

| Variable | Descripción |
|---|---|
| `GOOGLE_SHEETS_PUBLISHED_ID` | ID del documento publicado (`2PACX-...`, la parte entre `/d/e/` y `/pub`). |
| `GOOGLE_SHEETS_WORDS_GID` | `gid` de la pestaña de palabras. |
| `GOOGLE_SHEETS_CATEGORIES_GID` | `gid` de la pestaña de categorías. |

Los valores reales no se versionan: `.env` está ignorado por Git.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Build de producción (SSR con adaptador de Vercel). |
| `npm run check` | Comprobación de tipos y plantillas Astro. |
| `npm test` | Tests unitarios con Vitest. |
| `npm run test:watch` | Vitest en modo watch. |

## Estructura

```text
src/
  components/   Componentes Astro (vocabulario y estudio)
  features/     Lógica de vocabulario, categorías y estudio (SM-2)
  infrastructure/google-sheets/  Lectura y parseo del CSV publicado
  layouts/      Layout base
  pages/        Páginas SSR y endpoint del pool de estudio
  scripts/      Interacción cliente (filtros, sesión, badge)
  shared/       Utilidades compartidas (fechas locales)
  styles/       Estilos globales
```

## Datos y privacidad

- La hoja es la única fuente de contenido; se lee en cada petición con
  una caché corta en memoria.
- El progreso de estudio es estado personal del navegador y nunca se
  envía a un servidor.
- El botón «Sincronizar con Google Sheets» es un marcador deshabilitado:
  no existe ninguna escritura en la hoja.
- El contenido de la hoja se inserta siempre como texto, nunca como HTML.

## Despliegue en Vercel

El proyecto usa `output: 'server'` con `@astrojs/vercel`.

1. Importa el repositorio en Vercel; el framework se detecta como Astro.
2. Añade las tres variables de entorno del apartado anterior en
   **Settings → Environment Variables**.
3. Despliega. Cada cambio en `main` genera un despliegue nuevo.

No se necesita ninguna credencial de Google: la hoja solo debe estar
publicada en la web como CSV.

## Documentación

- `AGENTS.md`: reglas y arquitectura del proyecto.
- `etapa-2.md`: diseño del modo de estudio (SM-2, colas, persistencia).
- `plan.md`: plan de la fase 1 y notas de alcance.
