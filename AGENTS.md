# Japanese Memo - Project Guidelines

## 1. Project Overview

Japanese Memo is a personal Japanese-learning vocabulary **viewer**
with a built-in study mode (spaced repetition, SM-2).

The application uses a Google Sheet as its single source of truth for
**content** and Astro as its frontend.

The website is strictly **read-only with respect to the spreadsheet**.
It only displays what is in the sheet. All content is created and
edited directly in Google Sheets; the website exists to read, search,
filter and study that content comfortably, with furigana.

Study progress (review scheduling) is personal state, not content: it
lives in the browser (`localStorage`) because the application never
writes to the spreadsheet. There is no authentication, no user
accounts and no write operation against the sheet of any kind.

The project prioritizes:
- Simplicity.
- Maintainability.
- Security.
- Clear separation of responsibilities.
- Minimal dependencies.
- A good reading and learning experience.

Do not introduce unnecessary abstractions or features.

---

## 2. Technology Stack

### Frontend
- Astro
- TypeScript
- Strict TypeScript configuration.
- Tailwind CSS (if appropriate).

### Data Source
- A Google Sheet published to the web ("Publicar en la web", CSV).
- Data is read server-side from each tab's published CSV URL.
- No Google API key, OAuth, service account or credentials are used.

### Furigana / Readings
- Readings live in their own columns (`lectura`,
  `lectura_ejemplos`), not embedded in the word.
- The sheet mixes two row formats (see section 4); both are parsed
  with regular expressions. No morphological analyzer or dictionary
  is used.

### Study (Phase 2)
- SM-2 spaced-repetition scheduling implemented in-house as pure
  TypeScript (no external scheduler).
- Study progress persisted in the browser (`localStorage`).
- Unit tests with Vitest (dev dependency).

Use stable, maintained dependencies.

Do not introduce a dependency without a clear technical reason.

---

## 3. Architecture

Keep the architecture simple and appropriate for the
actual requirements.

Separate responsibilities into:

### Presentation
Astro pages and components.

Responsible for:
- Displaying the vocabulary list.
- Expanding and collapsing entries.
- Filtering and searching.
- Showing and hiding furigana.

### Application / Services
Responsible for:
- Loading vocabulary and categories.
- Splitting pipe lists, splitting readings and parsing Anki markup
  into ruby segments.
- Pairing parallel example lists by position.
- Validating and normalizing rows read from the sheet.
- Building study queues, applying the SM-2 scheduler and
  reading/writing validated study state in the browser.

### Infrastructure
Responsible for:
- Fetching and parsing the sheet's CSV export.
- Environment configuration.

Do not create unnecessary architectural layers.

Prefer feature-oriented organization over folders containing
all controllers, services or repositories.

Keep external integrations isolated from application logic.

---

## 4. Google Sheets - Single Source of Truth

The Google Sheet must remain the only persistent data source.

Do not introduce another database unless explicitly requested.

### Reading the sheet

The sheet is published to the web as CSV ("Compartir → Publicar en
la web"). The application reads each tab through its published CSV
URL, fetched **on the server**:

```
https://docs.google.com/spreadsheets/d/e/<PUBLISHED_ID>/pub?gid=<TAB_GID>&single=true&output=csv
```

- `PUBLISHED_ID` is the long `2PACX-...` identifier from the
  published URL (not the spreadsheet ID from `/d/`).
- `TAB_GID` is the value of `gid=` in the URL when that tab is open.
  Each tab (words, categories) has its own gid.
- Both values come from environment variables. Never hardcode them.
- Never hardcode the full sheet URL in the source code.
- Use the native `fetch`. Handle non-200 responses, timeouts and
  responses that are not CSV (for example a Google sign-in HTML page
  returned when the document is not published).
- Published snapshots may lag a few minutes behind sheet edits; do
  not treat that as an application error.
- Use a small, well-maintained CSV parser (or a minimal in-house
  one) that correctly handles quoted fields, escaped quotes, commas
  and line breaks inside cells. Examples and meanings may contain
  commas and newlines, so do not split lines naively.
- Because sheet edits must appear without redeploying, read the data
  at request time (SSR) with a short in-memory cache (for example
  30-60 seconds), instead of baking it in at build time. If a reload
  fails but a previous table is cached, serve the stale copy.

### Tab: words

Expected columns (resolved by header name, not by position):

| Column | Description |
|---|---|
| id | Unique identifier |
| palabra | Word |
| lectura | Word reading(s); plain or Anki format (see below) |
| significado | Meaning of the word (optional column) |
| ejemplos | Example sentences separated by `\|` |
| lectura_ejemplos | Example readings, plain or Anki format, separated by `\|` |
| significado_ejemplos | Example meanings, separated by `\|` |
| categoria_id | Category identifier |
| aprendido | Boolean (seed/export value of the study state) |
| veces repaso | Number of reviews (seed/export value) |
| racha_aciertos | Correct-answer streak (seed/export value) |
| factor_facibilidad | Ease factor (seed/export value) |
| intervalo_dias | Interval in days (seed/export value) |
| proximo_repaso | Next review date (seed/export value) |

The sheet mixes **two row formats**, detected per cell by the
presence of Anki markup (kanji followed by `[reading]`):

**Plain format (single kanji):**
- `palabra` is a single kanji (e.g. `駐`).
- `lectura` contains its readings separated by spaces
  (e.g. `チュウ` or `ム ブ な-い`). The dash marks okurigana
  (`な-い` ≡ `ない`).
- `ejemplos` / `lectura_ejemplos` are plain text lists separated
  by `|`.

**Anki format (full word):**
- `palabra` is the plain word (e.g. `父親`).
- `lectura` repeats the word with Anki markup
  (e.g. `父[ちち]親[おや]`), which already carries the base text
  and the per-kanji readings.
- `lectura_ejemplos` contains the example sentences with Anki
  markup (e.g. `父[ちち]親[おや]は毎[まい]朝[あさ]…`).
- Kana-only words (e.g. `おじ`) may leave `lectura` plain or empty
  while `lectura_ejemplos` still uses Anki markup.

Notes:
- The review-related columns (`veces repaso`, `racha_aciertos`,
  `factor_facibilidad`, `intervalo_dias`, `proximo_repaso`) and
  `aprendido` are optional seeds for the study state. They initialize
  cards that have no local progress yet; the application never writes
  them back to the sheet (see section 17).
- Header names must be mapped in a single place in the code
  (a column mapping constant), so a renamed header requires a
  one-line change. Do not scatter header strings across the codebase.
- Only `id` and `palabra` are required per row; everything else may
  be empty.

### Tab: categories

Expected columns:

| Column | Description |
|---|---|
| id | Unique identifier |
| nombre | Category name |
| description | Category description (optional column) |
| active | Whether the category is active (optional column) |

The real sheet currently uses only `id` and `nombre`; `description`
and `active` are treated as optional by the application and their
features activate automatically once the columns are added.

Categories must be dynamic.

Do not hardcode categories in the frontend.

New categories added directly to the sheet must become available to
the application without code changes.

### Data Rules

- Every entry has a unique ID. IDs do not depend on the word itself.
- `significado` and `ejemplos` may be empty.
- CSV values are always strings. Normalize them in one place:
  - `aprendido`: interpret `TRUE`/`FALSE` (case-insensitive, and
    other agreed equivalents) as a boolean.
  - Numeric and date columns: parse safely; empty or malformed
    values become `null`, never `NaN` or a crash.
- Category references use category IDs.
- Handle missing or malformed spreadsheet values safely. A bad row
  must not break the whole page.
- Validate rows read from the sheet (Zod) and report invalid rows
  clearly instead of silently discarding them.
- Skip fully empty rows.

The Google Sheet is always authoritative for **content**. Study
progress for cards already introduced is authoritative in the local
browser store (section 17).

---

## 5. Security

The website is a public, read-only viewer.

- There is no login, no session, no cookies for authentication and
  no write endpoint. Do not add them.
- Because the sheet is shared as "Anyone with the link can view",
  anyone with its link can read it. Do not store private or sensitive
  information in it.
- Fetch the sheet on the server. Keep the spreadsheet ID and tab gids
  in environment variables, not in client-side code.
- Never commit secrets or `.env`.
- Render sheet content safely. Never inject raw spreadsheet text as
  HTML. Furigana markup is generated by the application from parsed
  segments, with all text escaped.
- Use HTTPS in production.
- Validate any query parameters used for filtering or searching,
  including study session parameters.
- Study progress is stored in `localStorage` and is never sent to a
  server. Validate imported backup files (Zod) before using them.

Provide `.env.example` without real values.

---

## 6. Furigana and Readings

Furigana display is one of the core features.

Readings live in the `lectura` and `lectura_ejemplos` columns, and the
sheet mixes two formats (section 4). The application detects the
format **per cell** by the presence of Anki markup (a run of kanji
followed by `[reading]`) and never mixes the two.

### Rendering Rules

**Plain format (single kanji):**
- A single-kanji word with several readings renders the word followed
  by its readings stacked one per line underneath.
- A multi-character word with exactly one reading and at least one
  kanji renders as one `<ruby>` over the whole word.
- Example sentences: when `lectura_ejemplos` is plain and the example
  contains kanji, the whole reading is rendered as one `<ruby>` over
  the sentence; kana-only examples render the reading underneath.

**Anki format (full word):**
- `lectura` (e.g. `父[ちち]親[おや]`) is parsed into segments and each
  kanji run gets its own `<ruby>`:
  `<ruby>父<rt>ちち</rt></ruby><ruby>親<rt>おや</rt></ruby>`.
- `lectura_ejemplos` is parsed the same way, sentence by sentence.
- The `palabra` column stays the plain word and is only used for
  search and fallbacks.

### Parsing Rules

- Implement a pure parsing function that converts an Anki string into
  an ordered list of segments:
  - Plain segment: `{ text }`
  - Ruby segment: `{ base, reading }`
- Use a regular expression to detect a run of kanji followed by a
  bracketed reading. Kanji detection must cover at least:
  - CJK Unified Ideographs (`\u4E00-\u9FFF`)
  - CJK Extension A (`\u3400-\u4DBF`)
  - The iteration mark `々` and similar kanji-like characters
    (`〆`, `ヶ`) where relevant.
- The reading inside the brackets is hiragana (katakana is also
  tolerated). Brackets are never displayed to the user.
- Text outside of bracket groups (hiragana, katakana, Latin text,
  Spanish text, punctuation) is rendered as plain text.
- A leading space before a kanji run, as sometimes produced by Anki
  exports, must not leak into the output as a stray separator inside
  a word.
- Malformed input (unmatched brackets, empty readings, a bracket
  group with no preceding kanji) must never throw. Fall back to
  displaying the raw text for the affected part.
- The parser must be deterministic and free of side effects.

### Rendering Implementation

- Use semantic HTML ruby elements: `<ruby>`, `<rt>` (and `<rp>` for
  fallback if desired).
- Keep the original spreadsheet text unchanged. Furigana is derived at
  render time only.
- The furigana toggle hides `<rt>` (and the plain stacked readings)
  with CSS only; it never re-parses or alters data.

### Plain-Text Derivation

Provide helper functions to derive, from the raw cell values:
- The plain word text without readings (e.g. `父親`), used for search.
- The phonetic text with each kanji replaced by its reading
  (e.g. `ちちおや`), used for search.
- Search readings are normalized: katakana → hiragana, okurigana
  dashes and spaces removed (`チュウ` ≡ `ちゅう`, `な-い` ≡ `ない`).

---

## 7. Examples Formatting

The `ejemplos`, `lectura_ejemplos` and `significado_ejemplos` columns
contain parallel lists in a single cell, separated by `|`.

### Rules

- Implement a function that splits those strings into individual
  items at every `|`, trimming spaces and ignoring empty items.
- The three lists are paired **by position** (`ejemplos[i]` with
  `lectura_ejemplos[i]` and `significado_ejemplos[i]`); missing
  positions become `null` and are not rendered.
- If a list has more items than `ejemplos`, log a warning on the
  server naming the sheet row and pair by position anyway.
- Each example is rendered on its own line, one below the other.
- Each item is processed by the plain/Anki logic of section 6
  (per-cell format detection).
- Reading an example with Anki markup renders per-kanji ruby; a plain
  reading renders as furigana over the sentence.
- If `ejemplos` is empty, do not render an examples section.

---

## 8. Application Features

### 8.1 Vocabulary List

Display vocabulary as a vertical list, one entry below the other.

**Collapsed state (default):** only the word is visible
(`palabra`, as kanji or as the full word), with furigana when furigana
is enabled. Nothing else is shown.

**Expanded state:** each entry can be expanded to reveal:
- Meaning (`significado`), with furigana when applicable.
- Examples (`ejemplos`), one per line, with furigana.
- Category name.
- Learned status (read-only indicator).

Do not display empty fields unnecessarily.

Implementation notes:
- Prefer native, accessible `<details>` / `<summary>` for expand and
  collapse. Add JavaScript only if it is truly needed.
- Only one entry is expanded at a time. Use the native `name`
  attribute on the `<details>` elements of the list (exclusive
  accordion), so opening an entry closes the previous one without
  JavaScript.
- The expanded state is visual only and is not persisted.

### 8.2 Furigana Visibility

Provide a control to show or hide furigana.

- Implement with `<ruby>` / `<rt>` combined with CSS (hiding `rt`).
- The control must not alter data or re-parse content.
- Persisting the user's preference in the browser (for example
  `localStorage`) is allowed.

### 8.3 Filtering

Support:
- Category filtering.
- Learned / not learned filtering. The base value comes from the
  `aprendido` column of the sheet and is progressively enhanced in
  the browser from the local study state (section 17).
- Additional filters only when they derive directly from existing
  sheet columns and are agreed beforehand.

### 8.4 Search

Support searching by:
- Word (plain text, without readings).
- Reading (hiragana).
- Meaning.

Search should be straightforward and efficient. Search over the
derived plain text and reading text (section 6), never over raw Anki
markup.

### 8.5 Learned Status

The learned status is derived from the **study state** (section 17),
not editable from the website.

- A word becomes learned (mature) when its review interval reaches
  `matureDays` (default 21 days).
- The `aprendido` column of the sheet is only a seed/export value; the
  application never writes it.
- It can be used as a filter and shown as an indicator.
- To persist the status outside the browser, the owner may export the
  study backup and paste the review columns into the sheet manually. A
  real sync mechanism is still to be decided.

### 8.6 Study (Phase 2)

Two independent flows:

- **Review today**: every introduced card that is due
  (`proximo_repaso <= today`) across all categories, shuffled
  (interleaved).
- **Learn new**: the user picks a category and introduces up to the
  remaining daily allowance (global, configurable, default 10/day).

Session rules:

- Card front: the word with furigana; reveal to show the meaning and
  examples.
- Grades: 0 (Again), 3 (Good), 5 (Easy); keyboard shortcuts 1/2/3.
- "Again" requeues the card at the end of the session (max once); if
  it fails again it leaves the session and stays due.
- Progress is persisted after every answer.
- Progress is written only to `localStorage`. The "Sync with Google
  Sheets" button is a disabled placeholder until a mechanism is
  chosen.

---

## 9. Frontend Guidelines

Use Astro components by default.

Use client-side JavaScript only when interaction requires it
(furigana toggle, live search, filtering and study sessions).

Prefer Astro's server-side capabilities for:
- Reading the Google Sheet.
- Parsing and data processing.

Keep components small and focused.

Avoid unnecessary client-side frameworks.

The interface should be:
- Responsive.
- Accessible.
- Easy to navigate.
- Optimized for desktop and mobile.
- Focused on reading Japanese text (comfortable font size, adequate
  line height so `<rt>` does not collide with the previous line).

Use semantic HTML.

Do not introduce complex state management libraries
unless the application genuinely requires them.

---

## 10. Suggested Project Structure

Adapt this structure when implementation details require it.

Do not create empty files or unnecessary abstractions.

```
src/
  components/
    vocabulary/
      VocabularyList.astro
      VocabularyItem.astro
      VocabularyFilters.astro
      FuriganaToggle.astro
      RubyText.astro
      RubySegments.astro

    study/
      StudySummary.astro
      StudySession.astro

  layouts/
    BaseLayout.astro

  pages/
    index.astro
    estudiar.astro
    estudiar/
      sesion.astro
    api/
      study/
        pool.json.ts

  features/
    vocabulary/
      vocabulary.service.ts
      vocabulary.validation.ts
      vocabulary.types.ts
      readings.ts
      anki-markup.ts

    categories/
      categories.service.ts

    study/
      study.types.ts
      sm2.ts
      study.queue.ts
      study.storage.ts
      study.service.ts
      *.test.ts

  infrastructure/
    google-sheets/
      sheet-csv.client.ts
      columns.ts
      vocabulary.repository.ts
      categories.repository.ts

  shared/
    local-date.ts

  scripts/
    vocabulary-controls.ts
    study-session.ts
    study-badge.ts

  config/
    env.ts

  styles/
    global.css

.env.example
AGENTS.md
package.json
tsconfig.json
vitest.config.ts
```

This is a starting point, not a requirement to reproduce
every folder regardless of actual implementation needs.

---

## 11. TypeScript and Code Quality

Use strict TypeScript.

Avoid `any` unless there is a documented reason.

Prefer:
- Explicit types.
- Small functions.
- Clear naming.
- Pure functions for parsing and splitting.
- Immutable data where appropriate.
- Explicit error handling.
- Early returns when they improve readability.

Use Zod for validating:
- Environment variables.
- Vocabulary records read from the sheet.
- Category records read from the sheet.
- Study store data and imported backup files.
- Query parameters, if any (including study session parameters).

Use JSDoc for:
- Public/exported functions.
- Important business logic (especially the Anki parser and the
  examples splitter, including their regular expressions).
- Non-obvious implementation decisions.

Avoid comments that simply repeat the code.

Do not overengineer abstractions.

Apply SOLID principles pragmatically.

---

## 12. Error Handling

Handle errors explicitly.

Examples:
- Google Sheets unreachable.
- Sheet not publicly accessible (Google returns a sign-in page
  instead of CSV).
- Wrong spreadsheet ID or tab gid.
- Missing expected columns in the header row.
- Invalid or malformed spreadsheet data.
- Malformed Anki furigana text.

Do not expose internal stack traces, environment values or raw
upstream responses to users.

Provide useful error messages in the interface. When the sheet cannot
be loaded, show a clear message instead of a blank page. If a previous
successful load is cached, it may be served while the sheet is
unavailable.

---

## 13. Environment Configuration

Use environment variables for configuration.

Examples:

```
GOOGLE_SHEETS_PUBLISHED_ID=
GOOGLE_SHEETS_WORDS_GID=
GOOGLE_SHEETS_CATEGORIES_GID=
```

Use `.env.example` to document required variables, without real
values.

Validate configuration at application startup.

Never commit `.env`.

---

## 14. Development Workflow

Before implementing a feature:

1. Understand the existing project structure.
2. Review existing dependencies and conventions.
3. Identify affected features.
4. Consider security implications.
5. Define the expected behavior.
6. Implement the smallest maintainable solution.
7. Run linting and type checking.
8. Run unit tests (Vitest) when changing study logic.

Before introducing dependencies:
- Explain why they are needed.
- Consider native alternatives.
- Evaluate maintenance and security.

Do not rewrite working code without a clear reason.

Do not introduce features outside the agreed scope without
first discussing them.

---

## 15. Scope Restrictions

The application must NOT include:

- Authentication or authorization of any kind (no Google OAuth, no
  sessions, no owner email checks).
- Any write operation to the sheet, including marking words as
  learned.
- Google API keys, service accounts or the Google Sheets API client.
- Public user registration.
- Multiple user accounts.
- A separate database.
- Adding, importing or editing content from the website.
- Furigana generation or correction, and any morphological analysis
  tooling (such as MeCab).
- Spaced-repetition schedulers beyond the in-house SM-2 model of
  section 17 (no FSRS, no ML-based scheduling).
- Gamification.
- AI-based translation.
- AI-based vocabulary generation.
- Complex analytics.
- Unnecessary administrative dashboards.

Google Sheets is responsible for creating and editing all content:
words, meanings, examples, furigana and categories.

The website is responsible for displaying, searching and filtering
that content, rendering furigana, and scheduling study sessions with
SM-2 using browser-local progress (section 17).

---

## 16. General Development Principles

Always prioritize:

1. Security.
2. Correctness.
3. Maintainability.
4. Simplicity.
5. User experience.

Build a professional application without unnecessary complexity.

Do not confuse a small scope with low-quality engineering.

Every implementation decision should serve an actual
project requirement.

---

## 17. Study Mode (Phase 2)

Full plan: `etapa-2.md`.

### Persistence and phases

Study state is stored per word id in `localStorage` (key
`jp-study:srs:v1`) and validated with Zod on read. The sheet is never
written.

- **New**: `introducedOn === null`. Never studied.
- **In review**: introduced and `intervalDays < matureDays`.
- **Learned / mature**: `intervalDays >= matureDays` (default 21).

The sheet `aprendido` value is only a seed/export value. A card is
seeded from the sheet review columns only when it has no local state;
after that, the local store is authoritative.

### Scheduling (SM-2, three grades)

Grades: `0` (Again), `3` (Good), `5` (Easy). Ease factor starts at
2.5 and is clamped to `[1.3, 3.0]`; `easyBonus` is 1.3; `matureDays`
is 21.

| Phase | Grade | EF | Streak | New interval | Next review |
|---|---|---|---|---|---|
| New | Again | unchanged | 0 | 0 | today (requeue) |
| New | Good | unchanged | 1 | 1 day | today + 1 |
| New | Easy | unchanged | 1 | 4 days | today + 4 |
| In review | Again | max(1.3, EF - 0.2) | 0 | 1 day | today (requeue once) |
| In review | Good | unchanged | +1 | 1 -> 1d, 2 -> 6d, else round(I x EF) | today + I |
| In review | Easy | min(3.0, EF + 0.15) | +1 | round(max(I + 1, I x EF) x 1.3) | today + I |

- Any answer increments `reps`; Good/Easy increment `streak`;
  Again resets it.
- Dates are local calendar days as `YYYY-MM-DD` (no time, no UTC
  conversion). "Today" is captured once when a session starts.
- The daily new-card allowance is global and configurable
  (default 10/day). Introducing a card consumes that day's allowance
  regardless of the grade.

### Daily session

- **Review today**: all introduced cards with `due <= today` across
  all categories, shuffled (interleaved).
- **Learn new**: a category chosen by the user and the remaining daily
  allowance. Words without category appear as "Sin categoría".
- "Again" requeues a card at the end of the session (max once); if it
  fails again, it leaves the session and stays due.
- Progress is persisted after every answer.

### Sync

The "Sync with Google Sheets" button is a disabled placeholder. The
application never writes to the sheet. A future mechanism may export a
CSV of the review columns for manual pasting (recommended option).
