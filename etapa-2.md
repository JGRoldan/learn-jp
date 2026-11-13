# Etapa 2 — Estudio con repetición espaciada (SM-2)

- **Estado:** aprobado
- **Fecha:** 2026-11-13
- **Relacionado:** `AGENTS.md` §17, `plan.md` (addendum fase 2)

## Contexto

El visor actual es de solo lectura sobre la Google Sheet. La hoja tiene
~581 palabras (agosto 2026) y el objetivo es superar las 2000. La
aplicación no puede escribir en la hoja (sin OAuth, sin API keys, sin
service account, por diseño). Por eso:

- La hoja sigue siendo la **fuente de verdad del contenido**.
- El **progreso de estudio** vive en el navegador (`localStorage`) y
  nunca se envía a un servidor.
- Las columnas de repaso de la hoja son una **semilla/exportación**
  opcional, no el estado vivo.

## Decisiones acordadas

| Tema | Decisión |
|---|---|
| Persistencia | `localStorage` (`jp-study:srs:v1`) |
| Sync a Google Sheets | Botón **sin funcionalidad** por ahora (placeholder) |
| Estado inicial | Las 581 palabras arrancan como **NUEVAS** |
| Graduación/madurez | **APRENDIDA = intervalo ≥ 21 días** (estilo Anki "mature") |
| Límite de nuevas | **Global configurable, default 10/día** |
| Flujo | **Pantallas separadas**: "Repasar hoy" y "Aprender nuevas" |
| Tests | **Vitest** (dominio y colas) + Playwright (e2e) |

---

## 1. Cambio de alcance (prerrequisito)

El `AGENTS.md` original prohibía sesiones de repaso y cálculo de
planificación (§15) y declaraba las columnas de repaso como gestionadas
fuera de la web (§4, §8.5). Esta etapa lo enmienda:

- §1: el visor incorpora modo de estudio; el progreso es estado local.
- §2: SM-2 propio + `localStorage` + Vitest.
- §3: nuevas responsabilidades de aplicación (colas, scheduler,
  validación del store).
- §4: las columnas de repaso pasan a ser semilla/exportación.
- §5: el progreso no sale del navegador; validar backups importados.
- §8.3/§8.5: el estado "aprendido" se deriva del estudio.
- §8.6 (nueva): flujos de estudio.
- §9/§10/§11/§14: JS de sesión, estructura y tests.
- §15: se permite SM-2 propio; siguen fuera FSRS/ML, escrituras,
  autenticación y base de datos.
- §17 (nueva): especificación completa del modo de estudio.

---

## 2. Modelo de datos

### Store local

Clave `jp-study:srs:v1`, validada con Zod al leer. JSON corrupto o
versión desconocida → store vacío + aviso en la UI (nunca crash); el
respaldo JSON previo evita la pérdida.

```ts
interface StudyCardState {
  id: string;                    // clave = id de la palabra
  introducedOn: string | null;   // null = NUEVA (nunca estudiada)
  ef: number;                    // factor facilidad, 2.5 inicial, [1.3, 3.0]
  intervalDays: number;          // 0 hasta introducirse
  streak: number;                // racha_aciertos
  reps: number;                  // veces_repaso (sube en cada respuesta)
  lapses: number;                // reservado para futuros leeches
  due: string | null;            // 'YYYY-MM-DD' local
  lastReviewedAt: string | null; // ISO datetime
}

interface StudySettings {
  newPerDay: number;             // default 10
  easyBonus: number;             // 1.3
  efMin: number;                 // 1.3
  efMax: number;                 // 3.0
  matureDays: number;            // 21
  graduationEasyDays: number;    // 4
}

interface StudyStore {
  version: 1;
  cards: Record<string, StudyCardState>;
  settings: StudySettings;
}
```

### Fases

Una sola fuente de verdad: el store local.

- **NUEVA**: `introducedOn === null`. No se ha estudiado nunca.
- **EN REPASO (joven)**: introducida y `intervalDays < 21`.
- **APRENDIDA / MADURA**: `intervalDays >= 21`. Es lo que se exporta
  como `aprendido=TRUE`.

La hoja puede contener `aprendido=TRUE` de antes: se usa solo para
sembrar tarjetas sin estado local. La madurez real manda desde el
navegador.

### Semilla y conflictos

- Al cargar, toda palabra del pool sin entrada local se siembra con las
  columnas de la hoja: `factor_facibilidad` (default 2.5),
  `intervalo_dias` (default 0), `racha_aciertos`, `veces_repaso`,
  `proximo_repaso`, `aprendido`. Hoy están vacías → todas NUEVAS con
  EF 2.5.
- Una vez que una palabra existe en local, **local manda**: la hoja
  nunca sobreescribe progreso.
- Palabras eliminadas de la hoja dejan estado huérfano: se ignora al
  construir colas y se limpia en el siguiente guardado.
- Si la hoja tiene progreso pero ninguna fecha, la tarjeta se siembra
  con `due = hoy` para que entre en el primer repaso; `introducedOn` se
  aproxima como `due − intervalo`.
- `proximo_repaso` se normaliza como día local `YYYY-MM-DD` (nunca se
  pasa por `Date`, que interpretaría una fecha sin hora como UTC).
- Los ids son estables y son la única clave.

### Respaldo

- **Copia de seguridad (JSON)**: export/import funcional (descarga y
  restauración por archivo), validado con Zod.
- **Sync con Google Sheets**: botón deshabilitado con `title`
  "Próximamente". La mecánica se decide más adelante (ver §10).

---

## 3. Algoritmo SM-2

Tres botones: **0 = Otra vez**, **3 = Bien**, **5 = Fácil**. Estilo
Anki (deltas suaves de EF); la fórmula clásica de SM-2 castigaría EF
en cada "Bien" (q=3 → EF−0.14) y no conviene con solo 3 botones.

### Transiciones

| Fase | Botón | EF | Racha | Intervalo nuevo | Próximo repaso | Efecto |
|---|---|---|---|---|---|---|
| NUEVA | Otra vez | sin cambio | 0 | 0 | hoy (reencola en sesión) | se introduce (consume cupo) |
| NUEVA | Bien | sin cambio | 1 | 1 día | hoy + 1 | se introduce (consume cupo) |
| NUEVA | Fácil | sin cambio | 1 | 4 días | hoy + 4 | se introduce (consume cupo) |
| EN REPASO | Otra vez | max(1.3, EF−0.2) | 0 | 1 día | hoy (1 reencolado) → sigue debida | sigue joven |
| EN REPASO | Bien | sin cambio | +1 | racha 1→1d, 2→6d, luego round(I×EF) | hoy + I | madura si I ≥ 21 |
| EN REPASO | Fácil | min(3.0, EF+0.15) | +1 | round(max(I+1, I×EF)×1.3) | hoy + I | madura si I ≥ 21 |
| MADURA | Otra vez | max(1.3, EF−0.2) | 0 | 1 día | hoy/mañana | vuelve a joven |
| MADURA | Bien/Fácil | según arriba | +1 | según arriba | hoy + I | madura si I ≥ 21 |

### Reglas

- Secuencia típica de "Bien": 1 → 6 → 15 → 38 → 95 días.
- `reps` sube en **cada** respuesta; `streak` sube en Bien/Fácil y se
  resetea con Otra vez; `lapses` sube con Otra vez en repaso.
- EF inicial 2.5, acotado a `[1.3, 3.0]`.
- "Otra vez" sobre NUEVA **introduce** la tarjeta (consume el cupo
  diario) y la deja debida hoy; si la sesión termina sin aprobarla,
  sigue debida y aparece en "Repasar hoy".
- Fechas: día natural **local** como `YYYY-MM-DD`, sin horas ni UTC.
  "Hoy" se fija al iniciar la sesión (evita el salto de medianoche).
- La comparación de vencimiento es `due <= hoy` (ISO ordena
  lexicográficamente).
- `matureDays`, `easyBonus`, `efMin`, `efMax` y
  `graduationEasyDays` son constantes de código; `newPerDay` es
  configurable en la UI.

---

## 4. Cola y sesión diaria

### Repasar hoy

- Todas las introducidas con `due <= hoy` (jóvenes + maduras).
- De todas las categorías, mezcladas con Fisher-Yates (interleaving
  global). Mejora opcional posterior: round-robin por categoría para
  evitar rachas temáticas.
- Las NUEVAS no entran en esta cola.

### Aprender nuevas

- El usuario elige categoría (con conteo de nuevas restantes).
- Cupo restante = `newPerDay − introducidas hoy`
  (`introducedOn === hoy`).
- Orden mezclado dentro de la categoría.
- Las palabras sin `categoria_id` aparecen bajo la pseudo-categoría
  **"Sin categoría"** (hoy: 55).

### Reencolado

- "Otra vez" mueve la tarjeta al final de la cola de la sesión actual
  (máximo 1 vez).
- Si vuelve a fallar, sale de la sesión y queda debida según la tabla
  (hoy o mañana).

### Persistencia de sesión

- Guardado tras cada respuesta.
- Sin estado de sesión persistente en v1: al recargar, la cola se
  recalcula desde el store (las falladas siguen debidas).
- Pantalla final con stats mínimas: repasadas, % de acierto, "otra
  vez", tiempo.

---

## 5. UI/UX

### `/estudiar`

- Resumen: N repasos pendientes, M nuevas disponibles, cupo restante.
- Selector de categoría con conteos.
- Botones "Repasar hoy" y "Aprender nuevas".
- Ajustes: `newPerDay`.
- "Copia de seguridad (JSON)" funcional.
- "Sincronizar con Google Sheets" deshabilitado (placeholder).

### `/estudiar/sesion?modo=repaso|nuevas&categoria=<id>&limite=<n>`

- Query validado con Zod en servidor.
- Frente: palabra con furigana (reutiliza `RubySegments`/`RubyText`).
- Revelar (Espacio/Enter) → significado + ejemplos.
- Botones: Otra vez (1) / Bien (2) / Fácil (3).
- Progreso x/y y pantalla final.
- Móvil: botones grandes; teclado: foco gestionado y `aria-live`
  para el progreso.

### Integración con la vista principal (M5, opcional)

- Enlace "Estudiar" en el header con badge de pendientes (cliente,
  leyendo `localStorage`).
- Filtro "Aprendidas/Pendientes" de la lista SSR: valor base desde la
  hoja, recalculado en cliente desde la madurez local (progressive
  enhancement). Fallback a la columna si no hay estado local.

---

## 6. Arquitectura de archivos

```
src/shared/
  local-date.ts       día local YYYY-MM-DD, isLocalDate, addDays
src/features/study/
  study.types.ts      CardState, Grade, Phase, StudyStore, StudySettings
  sm2.ts              gradeCard(card, grade, today) — puro y determinista
  study.queue.ts      buildReviewQueue, buildNewQueue, remainingNewToday, shuffle
  study.storage.ts    load/save/seed/import/export (Zod, versionado)
  study.service.ts    pool compacto del servidor (reusa loadVocabulary)
  sm2.test.ts
  study.queue.test.ts
  study.storage.test.ts
src/pages/estudiar.astro
src/pages/estudiar/sesion.astro
src/pages/api/study/pool.json.ts
src/components/study/StudySummary.astro
src/components/study/StudySession.astro
src/scripts/study-session.ts
src/scripts/study-badge.ts
vitest.config.ts
```

- El endpoint del pool devuelve datos compactos (id, palabra,
  segmentos/ruby, significado, ejemplos, categoría) reutilizando la
  caché de 30s existente.
- A 2000 palabras el pool compacto ronda cientos de KB; el store local
  ronda 300 KB. Sin IndexedDB por ahora.

---

## 7. Testing

### Vitest (unitario)

- `sm2.ts`: cada fila de la tabla, límites de EF, reseteo de racha,
  secuencias de intervalos, umbral de madurez, fechas (meses, bisiesto,
  DST).
- `study.queue.ts`: filtro de vencidas (`due <= hoy`), filtro de nuevas
  (`introducedOn === null`), cupo diario, shuffle con RNG inyectable,
  pseudo-categoría "Sin categoría".
- `study.storage.ts`: esquema Zod, JSON corrupto, versión desconocida,
  import inválido, semilla desde la hoja, limpieza de huérfanos.

### Playwright (e2e)

- localStorage limpio → introducir 10 nuevas de una categoría →
  calificar → recargar y verificar persistencia → cupo respetado.
- Con `Date` simulado (`page.addInitScript`) verificar que las debidas
  aparecen "al día siguiente".
- Atajos de teclado y pantalla final.

### Verificación continua

- `npx astro sync && npm run check` y `npm run build` en cada hito.

---

## 8. Hitos

| Hito | Entregable | Verificación |
|---|---|---|
| **M0** | Enmienda de `AGENTS.md` + addendum en `plan.md` + `etapa-2.md` | Docs consistentes; sin código |
| **M1** | Dominio: `study.types.ts`, `sm2.ts`, setup Vitest, tests | `npx vitest run` en verde |
| **M2** | Persistencia: `study.storage.ts`, semilla, respaldo JSON, tests | Tests de schema/corrupción/semilla |
| **M3** | Colas: `study.queue.ts`, cupo diario, shuffle, reencolado, tests | Tests de colas y fechas |
| **M4** | `pool.json.ts` + `/estudiar` + `/estudiar/sesion` + teclado | e2e básico en verde |
| **M5** | Nav + badge + ajustes + botón sync placeholder + integración de filtros | Smoke manual |
| **M6** | A11y, móvil, e2e completo, `check`/`build` | Todo en verde |

---

## 9. Riesgos y notas

- Borrar datos del navegador pierde el progreso → el respaldo JSON
  existe desde M2.
- La hoja puede cambiar durante la fase: el estado se indexa por `id`;
  palabras nuevas aparecen al recargar; palabras borradas dejan estado
  huérfano (se limpia al guardar).
- El snapshot publicado puede tener unos minutos de retraso; no es un
  error de la aplicación.
- La madurez (`aprendido`) mostrada en la lista SSR sigue siendo la
  columna de la hoja hasta el enhancement cliente de M5.
- Sin gamificación ni analíticas complejas (regla del proyecto): solo
  stats mínimas de sesión.
- El sync real queda pendiente de decisión; hasta entonces el botón no
  hace nada.

---

## 10. Trabajo futuro (fuera de esta fase)

- Mecanismo de sync (opciones, en orden de recomendación):
  1. Export CSV + pegado manual en la hoja (cero credenciales).
  2. Apps Script con token (endpoint de escritura, requiere hardening).
  3. OAuth + Sheets API (rompe el "sin auth"; mayor complejidad).
- Deshacer última respuesta.
- Leeches (suspender tras N fallos).
- Sesión mixta nuevas + repasos 1:1.
- Límite de nuevas por categoría.
- Cuarto botón "Difícil" (q=2).
- Pasos intra-día de 10 minutos estilo Anki.
- Estadísticas de retención (siempre evitando analíticas complejas).

---

## Fuera de alcance de esta fase

- Escritura en la hoja, OAuth, API keys, service accounts.
- Schedulers distintos de SM-2 (FSRS, ML).
- Gamificación y analíticas complejas.
- Sincronización real con Google Sheets (solo placeholder).
- Contenido editable desde la web.
