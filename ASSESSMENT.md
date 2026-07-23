# Training Hub — Codebase Assessment

A planning-pass assessment of this codebase: the standard it should be held to, how it measures up today, and (next) a task backlog derived from the findings. **No source code was changed to produce this** — the output is documents only.

- **Assessed at commit:** `16964a3` (Phase 3: fitness engine). Point-in-time snapshot.
- **Method:** parallel per-subsystem reads of all 74 `src` files, mechanical grep verification against a clean checkout of `16964a3`, and adversarial re-verification of the subtle correctness claims (4 of 10 were downgraded on review).
- **Churn caveat:** a parallel workstream was mid-build on Phase 6 (race-block comparison) during the assessment — uncommitted `src/lib/blocks.ts`, `src/components/race-compare.tsx`, `src/app/races/compare/`, and edits to `db.ts`/`i18n.ts`/`races.ts`. That work is **excluded** from this snapshot; findings should be re-checked against it once it lands.

## Status

| Phase | Document | State |
|---|---|---|
| 0 | Orientation | ✅ complete (below) |
| 1 | Guidelines Report | ✅ complete (below) — provenance tagged Observed / Gap / Decision |
| 2 | Validation Report | ✅ complete (below) — status/severity/fix-type per guideline |
| 3 | Task Backlog | ✅ complete (below) — 4 milestones, sub-agent-executable, self-validation acceptance |
| + | Product-readiness lens | ✅ added (below) — one-way/two-way door analysis; seams-only scope for today |
| + | Build orchestrator prompt | ✅ `BUILD_PROMPT.md` (repo root) — paste into a fresh session to run the build |

Four policy decisions were made during Phase 0 and are baked into the guidelines: authorization is **required** at the server-action boundary; strict-types + i18n parity must be backed by a **CI/typecheck gate**; SQLite **foreign-key enforcement** is the intended invariant; shoe/bike sibling code should **converge** onto one parameterized gear abstraction.

Product-path decisions (added later): pursue **seams-only** work today (identity/auth/telemetry seams resolving to the single owner; no `athlete_id` columns yet); wire **operational observability + Speed Insights now, usage analytics deferred**; and when auth lands keep it **simple — email/password or magic-link only, no social OAuth**.

## Contents
1. [Phase 0 — Orientation](#phase-0--orientation)
2. [Phase 1 — Guidelines Report](#phase-1--guidelines-report)
3. [Phase 2 — Validation Report](#phase-2--validation-report)
4. [Product-readiness — architecture for optionality](#product-readiness--architecture-for-optionality)
5. [Phase 3 — Task Backlog](#phase-3--task-backlog)

> Build execution: the pasteable orchestrator prompt for the build phase lives in `BUILD_PROMPT.md` at the repo root.

---

# Phase 0 — Orientation

**Assessed at commit `16964a3` (Phase 3: fitness engine).** Point-in-time snapshot. See "Churn" below.

## Stack (detected)

| Area | Finding |
|---|---|
| Language | TypeScript 5, `strict: true`, `target ES2017`, path alias `@/* -> src/*` |
| Framework | Next.js **16.2.10** (App Router, RSC, server actions, typed routes), React **19.2.4** |
| Package manager | npm (`package-lock.json`) |
| DB | SQLite via libSQL/`@libsql/client`, **plain SQL, no ORM**. Local `data/app.db`; prod = Turso (`TURSO_DATABASE_URL`). Dev + prod point at the **same shared Turso DB**. |
| UI | shadcn/ui (`radix-nova` registry) on `radix-ui` meta-package + lucide icons; Tailwind **v4 CSS-first** (tokens in `globals.css`, no `tailwind.config`); `next-themes`; `sonner` toasts |
| Storage | Vercel Blob for photos in prod, local `data/uploads/` in dev (env-switched) |
| External | Strava OAuth + REST (sync, gear, activity detail, streams) |
| Build tooling | ESLint only (`eslint-config-next`, core-web-vitals + ts). **No Prettier/Biome, no Husky/lint-staged.** |
| Tests | **None.** No test runner installed (no vitest/jest/playwright). No `coverage`. |
| CI | **None** (no `.github/`). No `tsc --noEmit` script; `npm run lint` = eslint only. |
| Size | 74 files / ~10.9k LOC in `src`, plus 2 CLI scripts. Biggest: `i18n.ts` (~1000), `db.ts` (~1000), `review-flow.tsx` (525), `actions.ts` (508), `activity-chart.tsx` (506). |
| Secrets hygiene | Good. `.gitignore` excludes `data/`, `.env*` (keeps `.env.example`), `scratchpad/`. Config is env-only. |

## What this project is — confidence: **high**

A **private, single-user training/fitness log**. It syncs activities from Strava, runs a review ritual (confirm activity → assign shoes/bikes and splits → RPE/feeling/notes), tracks per-shoe and per-bike mileage, and computes its own fitness picture (per-activity training load → PMC: CTL/ATL/TSB). Corroborated by README, ROADMAP, PROGRESS.md, the code itself, and project memory. The stated direction (ROADMAP) is to become a cross-source "fitness hub" with an AI coach and race-block comparison; the acquisition-strategy notes reinforce single-athlete, bespoke analysis over multi-tenant.

## Project map (one screen)

**Entry points**
- `app/layout.tsx` — root RSC shell: fonts, `force-dynamic`, theme + i18n providers, header, toaster.
- Pages (all async RSC, no page-level `use client`): `/` log · `/review` · `/activity/[id]` · `/fitness` · `/insights` · `/races` · `/shoes` · `/bikes` · `/settings`.
- API routes (GET handlers): `/api/strava/connect`, `/api/strava/callback` (OAuth dance), `/api/uploads/[name]` (photo serving).
- Scripts: `scripts/seed.ts` (fake fixtures), `scripts/backfill-load.ts` (recompute all loads).

**Core modules (`src/lib`)** — one job each
| Module | Job |
|---|---|
| `db.ts` | Single data-access layer: libSQL client, lazy idempotent migrations, all parameterized queries/mutations (9 tables). No ORM. |
| `actions.ts` | Every server action (mutations). Uniform `ActionResult = {ok:true}\|{ok:false;error}`. |
| `strava.ts` | Strava OAuth + API client: token refresh, sync, gear/detail/streams fetch with lazy caching. |
| `streams.ts` | Pure normalizer: downsample Strava streams to ≤400-pt charting shape. |
| `storage.ts` | Photo storage abstraction (Blob vs local disk). |
| `fitness.ts` | Pure engine: per-activity TSS (power→pace→HR→RPE), PMC (CTL/ATL/TSB EWMA), Friel zones. |
| `races.ts` · `cycling.ts` · `insights.ts` | Race-distance buckets · ride-metric extraction · rolling-window aggregation. |
| `types.ts` · `sports.ts` · `feelings.ts` | Domain types (DB-row-mirroring) + closed taxonomies. |
| `format.ts` · `validate.ts` · `utils.ts` · `lang.ts` | Formatters/date math · split validation · `cn()` · lang-cookie resolve. |
| `i18n.ts` | EN source-of-truth dict, PT typed as `const pt: Dict`, `{token}` interpolation helpers. |

**Components** — `ui/*` (15 shadcn radix-nova primitives) + feature components (`review-flow`, hand-built SVG `activity-chart`/`pmc-chart`, gear cards/dialogs, settings/threshold forms, header).

**Main flows**
1. **Sync**: `/api/strava/connect` → OAuth → `syncActivities` writes activities as `pending_review` (history before baseline date stored pre-confirmed).
2. **Review ritual**: `ReviewFlow` (keyboard-driven) → shoe/bike splits + RPE/feeling/notes → `confirmActivity` → counts toward shoe mileage.
3. **Fitness**: `computeLoad` per activity → persisted in `activity_load` → `/fitness` runs `computePmc` → dashboard tiles + chart.
4. **Gear**: shoe/bike CRUD + Strava `gear_id` linkage → mileage rollups on cards.

**Data model (9 tables):** `shoes`, `bikes`, `activities` (+ `activity_splits`, `activity_streams`, `activity_load`), `strava_auth`, `athlete_thresholds`, `app_meta`. Singleton config rows use `CHECK (id = 1)`. Three opaque JSON TEXT columns (`raw_json`, `detail_json`, streams `json`).

## Unplaceable code / possible drift (verify in later phases)
- Dead branches: `streams.ts` `?? new Array(n).fill(null)`; `ui/select.tsx` `position === "popper" && ""`; `insights.ts` `activeDays` init overwritten.
- `theme-provider.tsx` — pure passthrough (only establishes the `use client` boundary).
- `ui/tooltip.tsx` references a `data-[slot=kbd]` Kbd primitive that doesn't exist here; `ui/dialog.tsx` `DialogFooter` renders a hardcoded English "Close".
- `review-flow.tsx` stores the `patchForm` callback under a misleadingly-named `rpe` key.

## Churn note (expected, not chased)
A parallel agent is mid-build on **Phase 6 (race block comparison)**. Uncommitted at snapshot time: new `src/lib/blocks.ts`, `src/components/race-compare.tsx`, `src/app/races/compare/`, and edits to `db.ts` / `i18n.ts` / `races.ts`. **Verified:** the `compare`/`blocks` code is working-tree-only (not in `16964a3`). One reader flagged "PT dict missing the `compare` section → build not green"; I confirmed this is an artifact of that in-flight half-migration, **not** a baseline defect. I will assess i18n parity against the stable module, and I have excluded `blocks.ts`/`race-compare.tsx`/`races/compare` from this snapshot.

## Open questions

**Blocking — all four resolved; decisions are baked into Phase 1:**
1. **Auth model.** Server actions have no authn/authz (only `syncNow` checks a Strava connection). → **Resolved: gap to fix.** Authorization is required at the action boundary; the current absence is a violation (Phase 2 G11.2).
2. **Enforcement gate.** No `tsc --noEmit` script, no CI. → **Resolved: add a gate.** Strict-types + EN/PT parity must be enforced by a `typecheck`/CI gate.
3. **FK enforcement.** `ON DELETE CASCADE` declared but `PRAGMA foreign_keys=ON` never issued. → **Resolved: enable enforcement.** Cascades must fire (Phase 2 G5.5).
4. **Gear duplication stance.** shoe/bike are copy-paste sibling pairs. → **Resolved: converge** onto one parameterized "gear" abstraction (Phase 2 G8.6).

**Non-blocking (recorded for Phases 2–3):** nearest-neighbor stream downsampling can drop peak HR/watts; power-TSS doesn't gate on real device power; seed/backfill scripts have no guard against the shared Turso DB; coarse `revalidatePath('/', 'layout')` on every action; hardcoded personal baseline data (`BASELINE_SHOES/BIKES`, `THRESHOLD_DEFAULTS`) in the shared `db.ts`; radix-nova primitives = regenerated-from-registry vs owned source; synchronous full-history `recomputeAllLoads()` inside `saveThresholdsAction`.


---

# Phase 1 — Guidelines Report

The standard this project should be held to. Derived first from what the codebase already does well (**Observed**), then gap-filled from the baseline engineering standard adapted to this stack (**Gap**), with four items set by your Phase 0 answers (**Decision**). Every rule is phrased to be checked mechanically or by clear inspection.

Rule IDs (G<area>.<n>) are stable anchors for Phase 2 and Phase 3.

---

## A. Project structure & module boundaries

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G1.1 | Route `page.tsx`/`layout.tsx` are async RSC; no page-level `"use client"`. Interactivity lives in imported client components. | Keeps data-loading on the server and ships less JS. | `grep -rl '"use client"' src/app/**/{page,layout}.tsx` → empty. | Observed |
| G1.2 | Only `db.ts` imports `@libsql/client`; only `actions.ts` carries `"use server"`. Pages/components stay presentational + data-loading. | One data-access seam, one mutation seam. | `@libsql/client` import appears only in `db.ts` + `scripts/*`; `"use server"` only in `actions.ts`. | Observed |
| G1.3 | Pure domain modules (`fitness.ts`, `races.ts`, `insights.ts`, `streams.ts`, `cycling.ts`) import no DB/IO; callers persist results. | Keeps the math unit-testable and reusable. | These files import nothing from `db`, `strava`, `storage`, `fs`, `@vercel/blob`. | Observed |
| G1.4 | One module = one job statable in a sentence; colocate code that changes together. New shared logic lives in the owning module, not re-inlined at call sites. | Legibility + change locality. | Inspection + the duplication scan (G14.4, G10.3). | Observed |
| G1.5 | Split oversized units: file > ~450 LOC or a single component/function > ~300 LOC is a split candidate. | Large files hide bugs and resist review. | LOC per file/function. Current over: `i18n.ts`, `db.ts`, `review-flow.tsx`, `actions.ts`, `activity-chart.tsx`, `pmc-chart.tsx`. | Gap |
| G1.6 | CLI scripts: no exports, `ensureMigrated()` first, end with `main().catch(e=>{console.error(e);process.exit(1)})`, and **reuse `src/lib` write helpers** rather than re-implementing SQL. | Scripts must not drift from the real write path. | `backfill-load.ts` is the model; `seed.ts` currently re-implements INSERTs (flagged). | Observed + Gap |

## B. Naming

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G2.1 | DB-facing type fields use `snake_case` mirroring SQL columns (no transform layer). | Rows map onto types with zero mapping code. | `types.ts` field names == column names. | Observed |
| G2.2 | Closed concepts are string-literal unions (`Feeling`, `ActivityStatus`, `WearStatus`, `SportCategory`, `LoadMethod`, `FormStateKey`). | Compiler enforces the closed set. | No bare string where a union exists. | Observed |
| G2.3 | Data-driven taxonomies = union type + one source-of-truth metadata array + find-based lookup (`SPORT_CATEGORIES`, `FEELINGS`). Display labels deferred to i18n, not hardcoded. | Single place to add a category; labels stay translatable. | Pattern present; `sports.ts` English labels are the exception to fix. | Observed |
| G2.4 | Names carry intent; no cryptic/misleading identifiers. | A wrong name costs every future reader a guess. | Inspection. `review-flow` `keyApi.rpe` (actually `patchForm`) is a rename target. | Observed + Gap |
| G2.5 | The "no selection" sentinel is one named constant (`NONE = "none"`), defined once and imported. | Stops four independent `"none"` string literals drifting. | `grep '"none"'` resolves to one definition. | Gap |
| G2.6 | Files kebab-case; React components PascalCase; helpers camelCase; module-level literals SCREAMING_SNAKE. | Predictable, already the de-facto style. | Inspection. | Observed |

## C. Types & type safety

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G3.1 | `strict: true`; explicit return types on exported functions. | Catches shape drift at the boundary. | `tsconfig` strict; inspection. | Observed |
| G3.2 | No `any`. Untrusted/unknown input enters as `unknown` and is narrowed via type guard (`isLang`) or validated shape. | Forces narrowing at the edge. | `grep -n ': any\|as any' src` → empty. | Observed |
| G3.3 | Nullable DB columns modeled as `T \| null`, not optional `?`. | One nullability convention. | `types.ts`; `StravaGear`'s `?` fields are the exception to fix. | Observed |
| G3.4 | Minimize `as` casts at trust boundaries: raw libSQL rows and external Strava JSON are validated (or cast in one guarded, documented place), not `as unknown as T` scattered per query. | An unchecked cast turns a schema mismatch into silent `undefined`. | `grep 'as unknown as\|as TokenResponse\|as ActivityStreams\|as RawRide'` trends to a small, central set. | Gap |
| G3.5 | i18n parity is type-enforced: EN is source of truth, `Dict = typeof en`, `const pt: Dict`. Avoid `as Record<string,string>` casts that disable key checking. | The type is the parity guarantee — only if nothing bypasses it. | `grep 'as Record<' src/lib/i18n.ts` trends to zero; parity backed by the gate (G9.4/G11 CI). | Observed + Gap |
| G3.6 | Use discriminated unions for one-of-several state (`ActionResult` is the model). DB booleans encoded 1/0 at the boundary but surfaced as real `boolean` in domain types (`is_race`). | Stops the SQLite `0/1` representation leaking into UI comparisons. | `is_race === 1` in components → decode at the db seam instead. | Observed + Gap |

## D. State & data flow

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G4.1 | Server components fetch via `@/lib/db`/`@/lib/strava` at the top and await; no client-side data fetching. | Server state stays on the server. | No `fetch`/data-loading `useEffect` in client components. | Observed |
| G4.2 | Client components receive server data as props; all mutations go through server actions. | One write path. | Inspection. | Observed |
| G4.3 | One mutation idiom: `useTransition` → `await *Action` → `if(!result.ok) toast.error(result.error)` → `toast.success` + `router.refresh()`, with a pending-disabled control. | Uniform UX + error handling. | Action call sites follow it; `GearMatcher`/`BikeMatcher` `.then()` is the exception to fix. | Observed |
| G4.4 | Effects are a last resort: derive with `useMemo`, use event handlers, use `useSyncExternalStore` for external stores. A new `useEffect` carries a one-line justification. | Most effects are avoidable and bug-prone. | `grep useEffect` — each occurrence justified (currently only `review-flow` uses one). | Observed |
| G4.5 | Model a single concept as one cohesive state object; colocate, lift only when shared. | `review-flow` `FormState` is the model; `journal-editor`'s four scattered `useState` for one journal is the anti-pattern. | Inspection. | Observed |
| G4.6 | No defensive memoization; `useMemo`/`useCallback` only for measured cost or required stable identity. | Avoids noise that hides real perf work. | Inspection. | Gap |

## E. Data layer, IO & external calls

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G5.1 | All dynamic/user values bound via `?` placeholders; string interpolation splices only internal constant SQL fragments. | SQL-injection safety. | No `${userValue}` in SQL; interpolation whitelist = `*_SELECT`, `*_FIELDS`, `BIKE_MILEAGE`. | Observed |
| G5.2 | Every query helper calls `ensureMigrated()` and runs through `exec/one/many/batchWrite`. | Migration-before-query invariant. | Inspection. | Observed |
| G5.3 | Upserts via `INSERT ... ON CONFLICT DO UPDATE`; multi-statement writes atomic via `batch('write')`; insert-with-children via `transaction('write')` in try/finally. | Atomic, no read-modify-write races. | Inspection; `seed.ts` non-atomic loop is the exception to fix. | Observed |
| G5.4 | Migrations additive + idempotent, driven by an **ordered registry with a `schema_version`** — not inferred from column presence, and comment numbers match execution order. | Deterministic, auditable migration state. | A version table/ordered list exists; numbering is sequential. | Gap |
| G5.5 | **`PRAGMA foreign_keys=ON` on every connection**; declared `ON DELETE CASCADE` must fire; deletes rely on cascade. | Prevents orphaned splits/streams/load rows. | PRAGMA issued at client creation; deleting an activity leaves no child rows. | **Decision** |
| G5.6 | External JSON validated at the boundary before storage/use; opaque JSON columns read through one typed accessor, not re-cast per read. | Bad external data fails loudly at ingest, not deep in the UI. | Inspection; `strava.ts`/`streams.ts`/`cycling.ts` casts routed through a validator. | Gap |
| G5.7 | No hardcoded personal/seed data in the shared runtime data module; baseline fixtures live in a seed path. | Keeps one athlete's private km/gear out of shared `db.ts`. | `BASELINE_SHOES/BIKES`/`THRESHOLD_DEFAULTS` not embedded in `db.ts` runtime. | Gap |
| G5.8 | Every shared literal has one source of truth (threshold defaults vs migration seed; retirement cap 700; allowed image types; `none` sentinel). | Two copies drift. | Each literal defined once (G14.4). | Gap |

## F. Error handling & edge cases

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G6.1 | Two-tier boundary errors: primitives throw typed messages; best-effort readers `try/catch → null`, but never swallow silently — at minimum log. | A broken token must be distinguishable from "no data". | Every catch surfaces or logs (currently `tryFetch*`/storage readers swallow silently). | Observed + Gap |
| G6.2 | The action/component seam communicates via `ActionResult.ok`; never throw across it. | Predictable client handling. | Inspection. | Observed |
| G6.3 | No internal/DB exception text reaches the client: `fail()` returns a controlled localized message, not raw `error.message`. | Avoids leaking internals into the UI. | `fail()` maps to `t.errors.*`. | Observed + Gap |
| G6.4 | Validate + normalize all client input server-side (`Math.round`, `inRange`, date regex, `Number.isFinite`) and NaN-guard every numeric parse (`Number(id)`, thresholds). | Typed inputs are not trusted inputs. | Each numeric parse is NaN/range-checked. | Observed + Gap |
| G6.5 | Handle emptiness explicitly with user-facing empty states (`EmptyState`) and named error paths. | No blank/confusing screens. | Inspection. | Observed |

## G. Async & concurrency

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G7.1 | Clear async ownership: actions await all DB writes; client mutations wrapped in `useTransition`. | No unhandled floating promises. | Inspection. | Observed |
| G7.2 | External calls have timeouts and rate-limit handling: `apiGet`-style timeout applies to token requests too; Strava sync honors `429`/`Retry-After` with backoff instead of aborting. | A single 429 shouldn't kill a full sync. | Token fetch has a timeout; sync path handles 429. | Gap |
| G7.3 | Expensive, history-scaling recomputes don't run synchronously inside a user request. | `saveThresholds` recomputing all loads inline grows with activity count. | `recomputeAllLoads` batched/backgrounded/bounded. | Gap |
| G7.4 | Fetch-once/cache-forever for detail/streams, and cache negative results (empty streams) so streamless activities don't re-hit the API each view. | Avoids repeated wasted calls. | Inspection. | Observed + Gap |

## H. UI & styling

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G8.1 | Tailwind v4 CSS-first: tokens in `globals.css` (OKLCH light/dark); reference semantic vars (`--primary`, `--positive`, `--wear-*`, `--chart-1..5`), never raw colors. | Theming + dark mode stay coherent. | `grep` raw hex/rgb in components → none (chart CSS-var strings OK). | Observed |
| G8.2 | Compose classes with `cn()` from `@/lib/utils`. | One class-merge path. | Inspection. | Observed |
| G8.3 | shadcn primitives are regenerated-from-registry (`radix-nova`): named function components, `data-slot`, `radix-ui` meta import. Hand-edits are discouraged and, where necessary, isolated + commented. | Keeps `ui/*` upgradable. | Inspection; deviations flagged (`sonner.tsx`, `dialog` hardcoded "Close"). | Observed |
| G8.4 | Accessibility: color always paired with a text label; `role=meter/radiogroup`; `aria-current` on nav/pills; `aria-hidden` on decorative icons; interactive SVG charts are keyboard-navigable; radiogroups support arrow keys. | Baseline a11y. | Inspection/axe; `pmc-chart` (pointer-only) and `journal-controls` radiogroups are gaps. | Observed + Gap |
| G8.5 | Hand-built SVG charts share the house style: module-level viewBox geometry constants, CSS-var series colors, `useMemo`-derived ticks, and one shared tooltip-position helper. | Charts read as one system; no duplicated transform math. | Geometry consts at module level; tooltip transform deduped across the two charts. | Observed + Gap |
| G8.6 | Composition over configuration/duplication: share presentational controls (`RpeControl`, `FeelingControl`, `SplitsEditor`, `BikeSelect`). **Converge shoe/bike sibling pairs into one parameterized "gear" abstraction.** | Removes the largest copy-paste surface. | No sibling components differing only by entity/labels/one field. | **Decision** |

## I. Testing

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G9.1 | Pure domain logic has behavior-describing unit tests: `computeLoad` (method priority + known race TSS), `computePmc` (CTL/ATL/TSB), `races.raceCategory`, `validate` splits, `format` pace/date, `streams` downsample. | These are the correctness-critical, easily-testable core. | Test files exist and run; known values (e.g. Jundiaí HM ≈ 152.7 TSS) asserted. | Gap |
| G9.2 | A bug fix ships with a test that would have caught it. | Prevents regressions. | PR/commit inspection. | Gap |
| G9.3 | Tests colocated (`*.test.ts` beside source) and describe behavior, not implementation. | Findable, refactor-safe. | Location + naming. | Gap |
| G9.4 | Introduce one test runner (vitest fits the TS/ESM/Vite-adjacent setup) with an `npm test` script wired into the gate. | You can't hold G9.1–3 without a runner. | Runner + `test` script present. | Gap (new dep — sign-off) |

## J. Dependencies

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G10.1 | No new runtime dependency without explicit sign-off; prefer platform/existing libs. | Controls bloat + supply-chain surface. | `package.json` diff review. | Gap |
| G10.2 | Keep versions aligned with the Next major (`eslint-config-next` tracks `next`). | Avoids config/runtime skew. | Inspection. | Observed |
| G10.3 | Add and run a dead-code/unused-export/dep finder (Knip) and a circular-dependency check (madge). | Catches drift the compiler won't. | Tools present in CI + clean. | Gap |
| G10.4 | One library per concern; no near-duplicate deps. | Avoids two ways to do one thing. | Inspection. | Observed |

## K. Security basics

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G11.1 | No secrets in the repo; config from env; `.env*` gitignored (keep `.env.example`). | Standard secret hygiene. | `.gitignore`; no tokens in tree. | Observed |
| G11.2 | **Every mutating server action enforces an authorization check** appropriate to the deployment; unauthenticated writes are not allowed. | Deployed actions are public endpoints; single-user is not the same as no-auth. | Each exported mutating action in `actions.ts` has an auth guard. | **Decision** |
| G11.3 | Validate + authorize untrusted input at the boundary (see G6.4); add NaN/range guards. | Trust boundary is the right place. | Inspection. | Observed + Gap |
| G11.4 | OAuth hardening: constant-time `state` comparison; `state` cookie `httpOnly` + `secure` in prod https. | Closes CSRF/timing gaps. | `callback`/`connect` routes. | Gap |
| G11.5 | File uploads: verify content type server-side (not just client MIME); delete photos when gear is removed; cache headers suit replaceable same-name assets. | Prevents spoofed uploads, orphaned blobs, stale caches. | `storage.ts` + uploads route. | Gap |

## L. Performance guardrails

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G12.1 | No whole-table scans for single-entity reads: `attachSplits` filters by `activity_id`; `BIKE_SELECT` computes per-bike mileage once (not 4x/row); load recompute doesn't `SELECT raw_json`. | Query cost scales with data (1200+ activities). | Query inspection / `EXPLAIN`. | Gap |
| G12.2 | Don't run the same query twice in one request (`countPending` in both `layout` and `page`). | Wasted round-trips. | Inspection. | Gap |
| G12.3 | Index hot filters (`started_at`, `status` already indexed); add indexes when new query patterns land. | Keeps list pages fast. | Inspection of indexes vs queries. | Observed |
| G12.4 | Memoize/derive only where measured or clearly derived; no premature global state. | Same as G4.6, applied to data. | Inspection. | Observed + Gap |

## M. Comments & documentation

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G13.1 | Maintain a concise project map at the repo root (entry points, top-level modules one-liner each, main flows) and update it in the same change that moves/rewires a module. | A stale map is worse than none. | A map doc exists; module list matches `src/lib` + routes. (Today: README/ROADMAP/PROGRESS cover intent but no module map.) | Gap |
| G13.2 | Each module's main file has a short header stating its single job. | Progressive disclosure. | Inspection. | Observed |
| G13.3 | Comments explain *why*; extract a well-named function instead of narrating a block. | Names beat comments. | Inspection. | Observed |
| G13.4 | No magic numbers: named constants stating meaning (TSS scale `100`, EWMA `42`/`7`, formState `5/-10/-30`, retirement `700`, `CHUNK 200`, race distance bands, RPE `0.25`). | Formulas become self-documenting. | `grep` numeric literals in formula/threshold code. | Gap |
| G13.5 | No half-migrations: leave a clear `TODO` rather than a half-converted file. | Legibility under parallel work. | Inspection. | Gap |

## N. Consistency (one way per concern)

| ID | Rule | Rationale | How checked | Source |
|---|---|---|---|---|
| G14.1 | One form paradigm per case: default to React 19 `<form action={…}>` + `FormData`; use controlled `useState` only where live derived UI needs it, and document which. | `ThresholdsForm`/`ManualActivityForm` vs dialogs currently diverge. | Inspection. | Gap |
| G14.2 | One empty/zero guard convention in formatters, chosen per field intentionally (`== null` to allow a real `0` vs `!x`) and applied consistently. | Silent `0`-vs-missing bugs. | `format.ts`/`cycling.ts` inspection. | Gap |
| G14.3 | One date-handling approach: pick UTC or local and apply it everywhere (day bucketing, window filtering, week math). | `insights.ts` mixes `Date.parse` UTC with local getters; `format.ts` uses local getters on UTC stamps → wrong-day bugs. | Inspection. | Gap |
| G14.4 | Cross-page patterns extracted once: time-window selector (`WINDOWS` + day counts), week/day keying, gear-row→`Option` mapping, ride/run `ActivityRow` layout, `SelectItem` gear fragment. | Kills the repeated-block class of duplication. | One shared helper/component per pattern. | Gap |
| G14.5 | One error-dictionary namespace convention (all actions return `t.errors.*`). | `createManualActivityAction` uses `t.toasts.*` — the exception. | Inspection. | Observed + Gap |
| G14.6 | Style enforced mechanically (Prettier or Biome) so formatting is never hand-maintained; run in the gate. | Removes `sonner.tsx`/`utils.ts` style drift and style debates. | Formatter config present + CI check. | Gap |

---

## Cross-cutting: the enforcement gate (ties G3.5, G9.4, G10.3, G11, G14.6 together)

Per your Phase 0 decision, add a single **CI/verify gate** (and matching npm scripts) that runs: `tsc --noEmit` (strict types + i18n parity), `eslint`, the formatter check, the test suite, Knip, and madge. Without it, "types guarantee parity" and "tests exist" are aspirations, not guarantees. This is the mechanism behind most "How checked" columns above.

## Provenance summary
- **Observed** (already the project's practice, now codified): the RSC/lib boundaries, parameterized SQL, `ActionResult` union, the single mutation idiom, effects-as-last-resort, literal-union taxonomies, CSS-var theming, a11y-with-labels, no-`any`.
- **Decision** (your Phase 0 answers): G5.5 FK enforcement, G8.6 gear convergence, G11.2 action authorization, and the enforcement gate (types + parity).
- **Gap** (baseline-fill): tests + runner, formatter, Knip/madge, magic-number naming, timezone/date consistency, boundary validation for external JSON, migration versioning, performance query fixes, doc/project-map upkeep.


---

# Phase 2 — Validation Report

Measured against the Phase 1 guidelines at commit **`16964a3`** (clean snapshot; the parallel agent's in-flight `blocks.ts`/`compare` work is excluded). Mechanical claims were verified with greps against the snapshot; 10 subtle correctness/hazard claims were adversarially re-verified (4 were downgraded — see "Surprises").

**Legend** — Status: ✅ holds · ◑ partial · ❌ violated. Sev: H/M/L. Fix: **safe** = behavior-preserving · **behav** = behavior-affecting (needs sign-off per working stance).

---

## A. Structure & module boundaries

| ID | St | Evidence (quantified) | Sev | Fix |
|---|---|---|---|---|
| G1.1 | ✅ | `grep '"use client"' src/app/**/{page,layout}` → 0. All routes are async RSC. | – | – |
| G1.2 | ✅ | `@libsql/client` imported only in `db.ts` (+scripts); `"use server"` only in `actions.ts`. | – | – |
| G1.3 | ✅ | `fitness/races/insights/streams/cycling.ts` import no `db`/`strava`/`fs`/blob. | – | – |
| G1.4 | ◑ | Boundaries clean; duplication is at call sites, not across layers (see G14.4). | L | safe |
| G1.5 | ◑ | Files > ~450 LOC: `i18n.ts` (1037), `db.ts` (1004), `review-flow` (525), `actions` (508), `activity-chart` (506). Single oversized fns: `syncActivities`, activity-chart render body. | M | safe |
| G1.6 | ◑ | `backfill-load.ts` exemplary. `seed.ts` re-implements `ACTIVITY_SPLIT_INSERT` + activity INSERTs already in `db.ts`, re-derives avg pace. | M | safe |

## B. Naming

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G2.1 | ✅ | `types.ts` fields are snake_case mirroring columns. | – | – |
| G2.2 | ✅ | `Feeling`/`ActivityStatus`/`WearStatus`/`SportCategory`/`LoadMethod`/`FormStateKey` are literal unions. | – | – |
| G2.3 | ◑ | Pattern holds (`SPORT_CATEGORIES`, `FEELINGS`); `sports.ts` `SPORT_CATEGORIES` hardcodes English labels despite PT/EN app. | L | safe |
| G2.4 | ◑ | Mostly intentful; `review-flow` `keyApi.rpe` actually stores `patchForm` (misleading). | L | safe |
| G2.5 | ❌ | `"none"` sentinel raw-used in `settings-forms` (4×), `bike-dialog` (2×), `shoe-dialog` (2×); only `bike-select` names `NONE`. | L | safe |
| G2.6 | ✅ | File/identifier casing consistent. | – | – |

## C. Types & type safety

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G3.1 | ✅ | `strict:true`; explicit return types on exports. | – | – |
| G3.2 | ✅ | `grep ': any' / 'as any'` → **0**. | – | – |
| G3.3 | ◑ | Convention is `T \| null`; `StravaGear` uses optional `?` (`distance?`, `retired?`) — lone exception. | L | safe |
| G3.4 | ◑ | `as unknown as T` = **2**, both central in `db.ts` `one/many` (acceptable, one guarded place). External JSON casts unvalidated = **5** (`as TokenResponse`, `as ActivityStreams`, `as StravaActivityDetail`, `as RawRide`, `as T`). | M | behav |
| G3.5 | ◑ | Parity type-enforced via `const pt: Dict`, but **9** `as Record<...>` casts in `i18n.ts`; ~6 (string/number-keyed) disable key checking for enumerated dicts (windows, methods, settings errors, rpeHints). | M | safe |
| G3.6 | ◑ | `ActionResult` union is the model. But `is_race` (SQLite 0/1) leaks into UI comparisons in **3** places (`race-control`, `page`, `activity/[id]`). | L | safe |

## D. State & data flow

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G4.1 | ✅ | Pages fetch via `@/lib` server-side; no client fetching. | – | – |
| G4.2 | ✅ | Client components take server data as props; mutate via actions. | – | – |
| G4.3 | ◑ | `useTransition` idiom at **27** sites; **3** `.then()` exceptions (`setShoeGearAction`, `setBikeGearAction`, AutoSync `syncNowAction`). Gear matchers lack pending state. | L | safe |
| G4.4 | ✅ | Only **4** real `useEffect` (review-flow keydown + latest-ref; sync-button automount + announcer) — all justified; banner uses `useSyncExternalStore`. | – | – |
| G4.5 | ◑ | `review-flow` `FormState` cohesive (model); `journal-editor` scatters one journal across 4 `useState`. | L | safe |
| G4.6 | ✅ | No defensive-memo smell; charts `useMemo` derived geometry appropriately. | – | – |

## E. Data layer, IO & external calls

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G5.1 | ✅ | All dynamic values `?`-bound; interpolation splices only constant fragments. No injection surface. | – | – |
| G5.2 | ✅ | Every helper routes through `exec/one/many/batchWrite` after `ensureMigrated()`. | – | – |
| G5.3 | ◑ | Upserts + `batch`/`transaction` correct in `db.ts`; `seed.ts` insert loop is non-atomic (partial-failure leaves partial data). | L | safe |
| G5.4 | ❌ | No `schema_version`; applied state inferred from `pragma_table_info`; comment numbering runs 001,003,004,005,**002**. | M | safe |
| G5.5 | ❌ | **`PRAGMA foreign_keys=ON` never issued**; 3 `ON DELETE CASCADE` + plain `REFERENCES` don't fire on local SQLite → activity deletion orphans splits/streams/load. *(Decision: enforce.)* Current delete trigger surface is small (`seed:clear`), so latent. | M | behav |
| G5.6 | ❌ | `raw_json`/`detail_json`/streams JSON stored + re-parsed as opaque, cast without runtime validation (see G3.4). | M | behav |
| G5.7 | ❌ | `BASELINE_SHOES`, `BASELINE_BIKES`, `THRESHOLD_DEFAULTS` (one athlete's real km/thresholds) hardcoded in the shared runtime `db.ts`. | L | safe |
| G5.8 | ❌ | `THRESHOLD_DEFAULTS` duplicates migration seed literals; `700` cap expressed ~4 ways; image-type allowlist in 2 places; `none` sentinel (G2.5). | L | safe |

## F. Error handling & edge cases

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G6.1 | ◑ | Two-tier pattern holds; but **6** bare `catch {}` in `strava.ts` swallow with no log → broken token/rate-limit indistinguishable from "no data". | M | safe |
| G6.2 | ✅ | `ActionResult.ok` across the seam; no throws. | – | – |
| G6.3 | ❌ | `fail()` returns `error.message` verbatim for `Error` → raw DB/internal text can reach the client. | M | behav |
| G6.4 | ◑ | Server normalization strong (`inRange`/`Math.round`/regex; `isFinite` ×6). Gaps: `Number(idRaw)` not NaN-checked (non-numeric id → NaN → falsy → silently routes update→create); `ThresholdsForm` `Number(maxHr/restingHr/lthr/ftp)` unguarded → NaN posts. | M | behav |
| G6.5 | ✅ | `EmptyState` used for empty lists. | – | – |

## G. Async & concurrency

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G7.1 | ✅ | Actions await writes; client mutations in `useTransition`. | – | – |
| G7.2 | ◑ | `apiGet` has `AbortSignal.timeout(15000)` + throws on 429 — but **no backoff/Retry-After** (one 429 aborts a ≤50-page sync); token fetch has **no** timeout. | M | behav |
| G7.3 | ❌ | `saveThresholdsAction` runs `recomputeAllLoads()` synchronously in-request; scales with history and `SELECT`s `raw_json` per confirmed activity (1200+). | M | behav |
| G7.4 | ◑ | Detail/streams fetch-once/cache-forever; but empty-stream results intentionally not cached → streamless activities re-hit API each view. | L | behav |

## H. UI & styling

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G8.1 | ✅ | `grep` raw hex in components → **0**; semantic CSS vars throughout. | – | – |
| G8.2 | ✅ | `cn()` used for class merge. | – | – |
| G8.3 | ◑ | Mostly stock radix-nova; deviations: `sonner.tsx` (2 `as` casts, arrow fn), `dialog` `DialogFooter` hardcodes English "Close". | L | safe |
| G8.4 | ◑ | `activity-chart` keyboard-navigable; `pmc-chart` pointer-only; `journal-controls` radiogroups lack arrow-key nav. | M | behav |
| G8.5 | ◑ | House style holds; tooltip-position transform duplicated across both charts; `pmc` weekly-bar geometry inside the component vs module-level elsewhere. | L | safe |
| G8.6 | ❌ | *(Decision: converge.)* shoe/bike copy-paste pairs across **7** files (`GearMatcher`/`BikeMatcher`, `ShoeDialog`/`BikeDialog`, `RetireButton`/`RetireBikeButton`, `ShoeCard`/`BikeCard`, `shoes`/`bikes` pages). | M | safe |

## I. Testing

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G9.1 | ❌ | **0** test files; correctness-critical `computeLoad`/`computePmc`/`raceCategory`/`validate`/`format` have no safety net. | **H** | safe |
| G9.2 | ❌ | No tests → no bug-fix-regression discipline. | H | safe |
| G9.3 | ❌ | No colocated tests. | H | safe |
| G9.4 | ❌ | No test runner installed (no vitest/jest/playwright). | H | safe |

## J. Dependencies

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G10.1 | ✅ | Lean, purposeful dep set. | – | – |
| G10.2 | ✅ | `eslint-config-next` pinned to `next` 16.2.10. | – | – |
| G10.3 | ❌ | No Knip (dead-code/unused-dep) or madge (circular-dep) tooling. | L | safe |
| G10.4 | ✅ | No duplicate libraries per concern. | – | – |

## K. Security basics

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G11.1 | ✅ | Config env-only; `.gitignore` excludes `.env*`/`data/`; no secrets in tree. | – | – |
| G11.2 | ❌ | *(Decision: required.)* **18** exported mutating actions, **0** auth checks (only `syncNow` checks Strava connection). All are open write endpoints once deployed. | **H** | behav |
| G11.3 | ◑ | Input validated at the boundary; authz missing (G11.2), NaN guards partial (G6.4). | M | behav |
| G11.4 | ◑ | State cookie `httpOnly`+`sameSite:lax` but **not `secure`** in prod; `state !== expected` is a non-constant-time comparison. | L | behav |
| G11.5 | ❌ | Upload trusts client `file.type` (no content sniffing); **no** photo-delete counterpart (removing gear orphans blobs/files); uploads route sets 1-yr immutable cache on replaceable same-name photos. | M | behav |

## L. Performance guardrails

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G12.1 | ❌ | `attachSplits` reads the **entire** `activity_splits` table (no `WHERE`) even for one activity; `BIKE_MILEAGE` subquery runs **4×/bike row** in `BIKE_SELECT`; `recomputeAllLoads` `SELECT`s `raw_json`. | M | safe |
| G12.2 | ❌ | `countPending()` runs in both `layout.tsx` and `page.tsx` → 2 queries per home request. | L | safe |
| G12.3 | ✅ | Indexes on `started_at`, `status`, split FKs, `bike_id`. | – | – |
| G12.4 | ✅ | No premature global state; derivation reasonable. | – | – |

## M. Comments & documentation

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G13.1 | ◑ | README/ROADMAP/PROGRESS cover intent well; no concise repo-root **module map** (entry points + one-liners + flows). | L | safe |
| G13.2 | ◑ | Some modules have header comments (`streams`, `strava` sections); not uniform. | L | safe |
| G13.3 | ✅ | Comments explain *why* in most places. | – | – |
| G13.4 | ❌ | Unnamed literals: TSS `100`, EWMA `42`/`7`, RPE `0.25`, formState `5/-10/-30`, race distance bands, `700` cap, `CHUNK 200`, singleton `id=1`. | L | safe |
| G13.5 | – | The in-flight `compare`/`blocks` half-migration is a **parallel agent's** working-tree state, not a baseline violation (churn — excluded). | – | – |

## N. Consistency (one way per concern)

| ID | St | Evidence | Sev | Fix |
|---|---|---|---|---|
| G14.1 | ❌ | Two form paradigms: dialogs use `<form action>`+`FormData`; `ThresholdsForm`/`ManualActivityForm` use controlled `useState`+`preventDefault`. | M | safe |
| G14.2 | ◑ | Formatter empty-guards mix `== null` (allows 0) vs `!x` (rejects 0) within `format.ts`/`cycling.ts`. | L | safe |
| G14.3 | ❌ | Mixed date handling. **Confirmed bugs:** `format.ts` uses local getters on UTC stamps → wrong calendar day/weekday at day boundaries + `"undefined NaN undefined"` on invalid ISO; `insights.dayKey` uses server-local date → `activeDays` miscount across timezones. | M | behav |
| G14.4 | ❌ | Duplicated cross-page patterns: window selector (`WINDOWS`+day counts, fitness/insights), week/day keying (4 pages), gear-row→`Option` (3 pages), ride/run `ActivityRow` layout (3 pages), `SelectItem` gear fragment (4 sites). | M | safe |
| G14.5 | ◑ | `t.errors.*` ×43 vs `t.toasts.*` ×2 (`createManualActivityAction` is the exception). | L | safe |
| G14.6 | ❌ | No Prettier/Biome; style drift visible (`sonner.tsx`/`utils.ts` quote+semicolon style differs from the rest). | L | safe |

## Cross-cutting: enforcement gate — ❌ VIOLATED (H)
No `tsc --noEmit` script, no CI (`.github` absent), no formatter/test/Knip/madge checks. Nothing mechanically enforces strict types, i18n parity, dead code, or style. **This is the meta-finding**: the in-flight i18n `compare` parity gap (churn) is precisely the class of error a `tsc` gate would catch at commit time. Adding one gate turns ~a dozen "should" guidelines into enforced "must". Behavior-preserving. **H**.

---

## Summary

### Biggest risks (act first)
1. **No enforcement gate + zero tests** (gate; G9.x). A fitness-math app with a live parallel-development workflow has no automated guard on `computeLoad`/`computePmc`, no typecheck, no CI. Highest leverage, fully behavior-preserving.
2. **No authorization on 18 mutating server actions** (G11.2, Decision). Deployed, these are public write endpoints. High, behavior-affecting.
3. **Load-math correctness: estimated power tagged as `power`** (E/fitness, CONFIRMED medium). Strava-estimated wattage bypasses the `hasRealPower` flag, produces a high-confidence `power` TSS, displaces the HR fallback, and propagates into CTL/ATL/TSB. The only finding that corrupts a *computed* number.
4. **FK enforcement off** (G5.5, Decision). Cascades declared but never fire; latent orphaning. Cheap to fix.
5. **Query cost scales with data** (G12.1). `attachSplits` whole-table scan + `BIKE_SELECT` 4× aggregate + `raw_json` in recompute, against 1200+ activities.

### Most widespread inconsistencies
- **Duplication** is the dominant structural theme: shoe/bike sibling pairs (7 files, G8.6), cross-page patterns (G14.4), triplicated load-upsert SQL and 6× gear-uniqueness UPDATE in `db.ts`, single-source-of-truth breaks (G5.8).
- **Two ways per concern**: forms (G14.1), date handling (G14.3), formatter empty-guards (G14.2), mutation idiom exceptions (G4.3), error namespace (G14.5).
- **Boundary validation gaps**: external JSON cast unvalidated (G3.4/G5.6), NaN guards partial (G6.4), i18n `as Record` casts (G3.5).

### Surprises
- **Better than expected:** genuinely clean type discipline (0 `any`, 0 `as any`), airtight parameterized SQL (0 injection surface), effects truly used as a last resort (4 total, all justified), 0 raw color literals, and a real server/client i18n split. The *observed* conventions are strong — this codebase mostly holds itself to a high bar; the gaps are overwhelmingly in **process** (tests, gate, formatter) and **decided-policy** items (auth, FK, gear).
- **Downgraded by adversarial re-verification (4 of 10):** stream downsampling drops chart peaks but **not** reported max HR/power (those come from Strava summary fields) → low, not a metric bug. `insights` date "mismatch" is actually a correct window filter; only `activeDays` is affected → low. `review-flow` setState-in-updater is a **benign idempotent smell**, not a live bug and not behavior-affecting. `db` bigint concern is non-realistic (Strava ids sit ~600,000× below `MAX_SAFE_INTEGER`; would throw, not silently corrupt). Flagging these as high would have been wrong — the verify pass corrected the initial reads.
- **Confirmed real (display-only, medium):** race-category gaps/mis-bucketing (G14.3-adjacent), timezone day-shift in `format.ts`, and `activity-chart` opening with the wrong default series after client-side navigation between activities.

### Behavior split (for the execution pass)
- **Behavior-preserving (safe to batch):** the gate + tests + formatter + Knip/madge, all duplication/extraction work, magic-number naming, migration versioning, module map, `none` sentinel, oversized-file splits, moving baseline data out of `db.ts`.
- **Behavior-affecting (needs sign-off):** auth (G11.2), FK enforcement (G5.5), `fail()` message handling (G6.3), power-TSS gating, timezone fix (G14.3), NaN guards (G6.4), rate-limit backoff (G7.2), backgrounded recompute (G7.3), upload hardening (G11.5), OAuth hardening (G11.4), chart default-series resync (G8.4/activity-chart), empty-stream caching (G7.4).


---

# Product-readiness — architecture for optionality

Near-term goal: the perfect single-user app. Longer-term option: turn it into a product. This section captures what to do **today** so that transition is later a few localized steps, not a rewrite — *without* building product features now.

**Principle:** invest only in **one-way doors** (cheap now, expensive to reverse once real data + other users exist). Defer every **two-way door** (addable later at no penalty). Building product features now would work against the "perfect for me first" goal.

**Decisions taken (this pass):**
- **Seams-only today.** Establish the identity/auth/telemetry seams (resolving to the single owner today); do **not** add `athlete_id` columns yet — document the migration path instead.
- **Operational observability + Speed Insights now; usage analytics deferred** behind a single telemetry seam.
- **Auth stays simple.** When auth lands it is **email/password or magic-link email only** — no Google/Apple/social OAuth, no third-party identity providers. Avoids integration complexity now; the seam makes adding providers later a contained change if ever wanted.

## Where the codebase stands (measured at `16964a3`)

**Already product-friendly — protect these:**

| Asset | Why it helps the product path |
|---|---|
| All SQL in one module (`db.ts`: 46 fns, 76 statements) | Tenant scoping becomes a **one-file** change, not a scatter hunt. |
| Fitness engine pure/stateless (`fitness.ts`, no IO) | Per-user by construction — feed it one user's data. Nothing to change. |
| Single mutation seam (`actions.ts`, one `"use server"`) | Auth guard goes in **one place**. |
| Typed boundaries, `ActionResult`, i18n | Scale fine to N users unchanged. |

**One-way doors — single-user coupling to handle now:**

| Coupling | Evidence | Guideline |
|---|---|---|
| No identity concept | `CHECK (id = 1)` on `strava_auth` + `athlete_thresholds`; resolved at 17 call sites; **0** `user_id`/owner column across 9 tables | (new) |
| No authorization | 18 mutating actions, 0 auth checks | G11.2 |
| Personal data in shared code | `BASELINE_SHOES/BIKES`, `THRESHOLD_DEFAULTS` in `db.ts` | G5.7 |
| Shared dev+prod database | Both point at the same Turso DB (README + `.env.example`) | (new) |

## The three seams (the whole game)

1. **Identity / auth** — one place that answers "who is the current athlete" and authorizes them.
2. **Data access** — already `db.ts`; keep it the *only* SQL site and make it scope by the identity seam, not `id = 1`.
3. **Telemetry** — one `logger`/`track()` module; the single point where observability/analytics vendors plug in.

## Do today (behavior-preserving unless noted)

1. **Identity seam.** Introduce one `currentAthlete()` (and/or `requireAthlete()`) that returns the single owner today. Route `getStravaAuth` / `getAthleteThresholds` / "who am I" reads through it. Multi-tenant later = change one function, not 17 sites.
2. **Auth boundary** in one place (wrapper around actions / route guard) that today authorizes the sole owner. When credentials land, keep them **simple: email/password or magic-link only, no social OAuth**. *(Adds behavior — the decided G11.2 fix.)*
3. **Move personal data out of `db.ts`** into seed/config (G5.7).
4. **Split dev and prod databases** — stop sharing one Turso DB before anyone else's data exists. *(Ops/process.)*
5. **Telemetry seam** — add a `logger`/`track()` module; fix the 6 silent `catch {}` in `strava.ts` (G6.1) by logging through it. Wire Vercel Observability (logs/errors) + Speed Insights as the sinks.

## Design now, build at productization (the bounded migration path)

Do **not** add these today — record the path so the retrofit is mechanical:

1. Add nullable `athlete_id` to per-user tables (`activities`, `shoes`, `bikes`, `activity_load`, `strava_auth`, `athlete_thresholds`; children inherit via their parent).
2. Backfill every existing row to the single owner.
3. Convert the `CHECK (id = 1)` singletons (`strava_auth`, `athlete_thresholds`) to per-owner rows.
4. Add `WHERE athlete_id = ?` to `db.ts` queries — one file, sourced from the identity seam.
5. Flip `currentAthlete()` from the constant to the real session. Add signup/onboarding **then**, not now.

Because steps 1–4 are localized to `db.ts` and step 5 to the identity seam, the whole transition stays a handful of contained changes.

## Metrics: operational vs product-usage

| Layer | Now? | Choice |
|---|---|---|
| Operational observability (logs, errors) | **Yes** | Vercel Observability via the telemetry seam; also fixes silent catches (G6.1). Useful even at n=1. |
| Speed Insights (Core Web Vitals) | **Yes** | `@vercel/speed-insights`; on-theme for "perfect for me" (perf). |
| Web Analytics (page views, usage) | **Deferred** | Wire `@vercel/analytics` behind the telemetry seam; turn on the day you open to others — usage data is meaningless at n=1. |

Discipline regardless of vendor: **all telemetry goes through the one seam**, so Vercel ↔ PostHog/Segment (or flipping analytics on) is a one-file swap — never sprinkle `va.track()` across components. New deps (`@vercel/analytics`, `@vercel/speed-insights`) are first-party, tiny, zero-config on Vercel; approve per G10.1.

## Explicitly deferred (two-way doors — do NOT build now)

Signup/onboarding, teams/orgs, roles beyond owner, billing/plans, per-tenant rate limiting, product-usage dashboards/funnels/cohorts, the AI coach (Phase 4), email, admin tooling. None constrain today's architecture; all are additive once the seams exist.

## How this feeds Phase 3

These become a tagged **"Product-path seams"** milestone in the backlog. Several overlap existing findings — G11.2 (auth), G5.7 (personal data), G6.1 (logging) — so the product lens mainly **elevates their priority** and adds three net-new tasks: the **identity seam**, the **dev/prod DB split**, and the **telemetry seam + Vercel observability/Speed Insights**. The `athlete_id` migration is captured as a documented plan, not a task.


---

# Phase 3 — Task Backlog

Derived from Phase 2 findings + the product-readiness decisions. Ordered by leverage (impact ÷ risk), grouped into milestones. **Milestone 0 is foundational and blocks everything** — nothing else can self-validate until it lands.

**Type:** `SAFE` = behavior-preserving (proceed without per-task approval) · `SIGN-OFF` = behavior-changing (needs explicit human approval before starting). **Eff:** S/M/L. Acceptance for every task = **`npm run verify` fully green** (typecheck + lint + format + vitest unit + vitest API/route + Playwright UI/flow E2E on a seeded **local** DB with Strava mocked) **plus** the task-specific assertion listed under each milestone.

Tasks anchor to modules/guidelines, never line numbers (code moves under parallel work). Re-check the churn-excluded files (`blocks.ts`, `race-compare.tsx`, `races/compare`) once that work lands.

---

## Milestone 0 — Self-validation harness & enforcement gate  *(do first, in order)*

| ID | Task | Why (guideline) | Files/areas | Eff/Risk | Type |
|---|---|---|---|---|---|
| T0.1 | Add **vitest** + `test`/`test:unit` scripts; wire into a new `verify` script | G9.4 | `package.json`, `vitest.config.ts` | S / L | SAFE |
| T0.2 | Add **Playwright** + seeded **local** test DB fixture + **Strava mock** (MSW or fetch stub); `test:e2e` script | G9.1, G9.4 | `playwright.config.ts`, `e2e/`, test setup | M / M | SAFE |
| T0.3 | Add **`typecheck`** script (`tsc --noEmit`) and make it green on `main` | G3.1/G3.5, gate | `package.json` | S / L | SAFE |
| T0.4 | Add **formatter** (Prettier or Biome) + `format:check`; format the tree once | G14.6 | formatter config, `package.json` | S / L | SAFE |
| T0.5 | Add **Knip** + **madge** + `deadcode`/`cycles` scripts | G10.3 | config, `package.json` | S / L | SAFE |
| T0.6 | Compose **`verify`** = typecheck + lint + format:check + test:unit + test:e2e + deadcode + cycles; add **GitHub Actions** running it on PR | gate | `package.json`, `.github/workflows/` | S / M | SAFE |
| T0.7 | Backfill **unit tests for the pure engine**: `computeLoad` (method priority + known race TSS e.g. Jundiaí HM ≈ 152.7), `computePmc` (CTL/ATL/TSB), `raceCategory`, `validate` splits, `format` pace/date | G9.1 | `src/lib/*.test.ts` | M / L | SAFE |

**Acceptance (self-validation):** `npm run verify` exists and is green on a clean `main`; CI runs it on every PR and blocks on red; engine tests assert at least the known race-TSS values from PROGRESS.md and a PMC snapshot. **Safety:** the harness must run against a local SQLite file, never the shared Turso DB (no `TURSO_*` in the test env).

## Milestone 1 — Product-path seams

| ID | Task | Why (guideline) | Files/areas | Eff/Risk | Type |
|---|---|---|---|---|---|
| T1.1 | **Identity seam**: one `currentAthlete()`/`requireAthlete()` returning the single owner today; route `getStravaAuth`/`getAthleteThresholds`/"who am I" through it | product-path | `src/lib` (new seam), `db.ts`, `strava.ts`, call sites | M / M | SAFE |
| T1.2 | **Telemetry seam**: `logger`/`track()` module; replace the 6 silent `catch {}` in `strava.ts` with logging; wire **Vercel Observability** | G6.1, product-path | `src/lib` (new), `strava.ts`, `storage.ts` | M / M | SAFE |
| T1.3 | **Speed Insights**: add `@vercel/speed-insights`; leave Web Analytics deferred behind the telemetry seam (documented, not wired) | product-path | `layout.tsx`, `package.json` | S / L | SAFE |
| T1.4 | **Move personal data out of `db.ts`**: `BASELINE_SHOES/BIKES`, `THRESHOLD_DEFAULTS` → seed/config | G5.7, G5.8 | `db.ts`, `scripts/seed.ts`/config | M / M | SAFE |
| T1.5 | **Split dev/prod databases**: separate Turso instances; env + README update; ensure local dev never targets prod | product-path | `.env.example`, `db.ts` (connection), README | S / M | SIGN-OFF |
| T1.6 | **Auth boundary**: single guard wrapping actions/routes, authorizing the sole owner today; **simple email/password or magic-link only, no social OAuth** | G11.2 (Decision) | new auth seam, `actions.ts`, middleware/layout | L / H | SIGN-OFF |

**Acceptance:** T1.1 — no route/action reads `strava_auth`/`athlete_thresholds` except through the seam; verify green. T1.2 — no bare `catch {}` in `strava.ts`; errors reach the telemetry sink; verify green. T1.4 — `grep BASELINE_/THRESHOLD_DEFAULTS src/lib/db.ts` empty; seeding still works. T1.6 — every mutating action rejects an unauthenticated caller (asserted by API tests); a Playwright flow covers login + a gated action.

## Milestone 2 — Safe cleanups *(behavior-preserving)*

| ID | Task | Why (guideline) | Files/areas | Eff/Risk | Type |
|---|---|---|---|---|---|
| T2.1 | **Converge shoe/bike** into one parameterized gear abstraction | G8.6 (Decision) | gear dialogs/cards/matchers, `shoes`/`bikes` pages | L / M | SAFE |
| T2.2 | **Extract cross-page patterns**: window selector, week/day keying, gear→`Option`, ride/run row, `SelectItem` fragment | G14.4 | `page`/`fitness`/`insights`/`races`/`activity` + shared helpers | M / M | SAFE |
| T2.3 | **Dedup `db.ts`**: load-upsert 3→1, gear-uniqueness UPDATE ×6→1, one source of truth for shared literals | G5.8 | `db.ts` | M / M | SAFE |
| T2.4 | **Name magic numbers** (TSS 100, EWMA 42/7, RPE 0.25, formState bands, 700, CHUNK 200, race bands) | G13.4 | `fitness.ts`, `db.ts`, `races.ts` | S / L | SAFE |
| T2.5 | **`none` sentinel** → one named constant, imported | G2.5 | gear/settings components | S / L | SAFE |
| T2.6 | **Split oversized files** (`i18n`, `db`, `review-flow`, `actions`, `activity-chart`) | G1.5 | those files | M / M | SAFE |
| T2.7 | **Migration versioning**: `schema_version` + ordered registry; fix numbering | G5.4 | `db.ts` | M / M | SAFE |
| T2.8 | **Repo module map** doc + adopt one form paradigm | G13.1, G14.1 | new `MAP.md`, forms | S / L | SAFE |
| T2.9 | **i18n tidy**: drop `as Record<>` casts where feasible, `t.toasts`→`t.errors`, sports labels via dict | G3.5, G14.5, G2.3 | `i18n.ts`, `actions.ts`, `sports.ts` | M / M | SAFE |
| T2.10 | **Remove drift/dead code**: streams fallback, select popper branch, insights `activeDays` init, tooltip kbd, dialog "Close", rename `review-flow` `rpe` key | unplaceable code, G2.4 | listed files | S / L | SAFE |
| T2.11 | **Query efficiency**: `attachSplits` filter by id, `BIKE_SELECT` single aggregate, recompute without `raw_json`, `countPending` once/request | G12.1, G12.2 | `db.ts`, `layout.tsx`, `page.tsx` | M / M | SAFE |

**Acceptance:** each task's before/after behavior is identical — asserted by the M0 tests (engine, API, and Playwright flows for gear/log/insights must stay green). T2.11 additionally: no whole-table split scan (verify via query inspection/test); home request issues `countPending` once.

## Milestone 3 — Correctness & behavior-changing *(each needs sign-off)*

| ID | Task | Why (guideline / verdict) | Files/areas | Eff/Risk | Type |
|---|---|---|---|---|---|
| T3.1 | **Enable FK enforcement** (`PRAGMA foreign_keys=ON` per connection); confirm cascades fire | G5.5 (Decision) | `db.ts` | S / M | SIGN-OFF |
| T3.2 | **`fail()` stops leaking** raw `error.message` → controlled localized message | G6.3 | `actions.ts` | S / L | SIGN-OFF |
| T3.3 | **Power-TSS gates on `hasRealPower`** (device power); estimated wattage falls through to HR | fitness (CONFIRMED med) | `fitness.ts`, `cycling.ts` | S / M | SIGN-OFF |
| T3.4 | **Timezone consistency**: `format.ts` UTC getters + invalid-ISO guard; `insights.dayKey` tz-consistent (`activeDays`) | G14.3 (CONFIRMED) | `format.ts`, `insights.ts` | M / M | SIGN-OFF |
| T3.5 | **NaN guards**: `Number(idRaw)` and `ThresholdsForm` numeric coercions | G6.4 | `actions.ts`, `thresholds-form.tsx` | S / M | SIGN-OFF |
| T3.6 | **Strava resilience**: 429 backoff/Retry-After, token-fetch timeout, cache empty-stream results | G7.2, G7.4 | `strava.ts`, `streams.ts` | M / M | SIGN-OFF |
| T3.7 | **Background/bound `recomputeAllLoads`** out of the request path | G7.3 | `actions.ts`, `db.ts` | M / M | SIGN-OFF |
| T3.8 | **Upload hardening**: server-side content sniff, delete-on-gear-removal, correct cache headers | G11.5 | `storage.ts`, uploads route, gear delete | M / M | SIGN-OFF |
| T3.9 | **OAuth hardening**: constant-time state compare, `secure` cookie in prod | G11.4 | `connect`/`callback` routes | S / L | SIGN-OFF |
| T3.10 | **Chart default-series resync** on activity change (no stale selection) | G8.4 (CONFIRMED med) | `activity-chart.tsx` | S / M | SIGN-OFF |
| T3.11 | **race-category** gaps + sport guard + ultra bucket | races (CONFIRMED med) | `races.ts`, `types.ts` | S / M | SIGN-OFF |
| T3.12 | **Type-representation fixes**: `is_race` decode to boolean at db seam; `StravaGear` → `T\|null`; `pmc-chart` keyboard a11y | G3.6, G3.3, G8.4 | `db.ts`/`types.ts`, `pmc-chart.tsx` | S / L | SIGN-OFF |

**Acceptance:** each carries a regression test written **before** the fix (red→green) that reproduces the failure scenario from Phase 2 (e.g. T3.3: estimated-power ride no longer tagged `power`; T3.4: evening-UTC workout renders the correct local day + invalid ISO → `"–"`; T3.1: deleting an activity leaves zero orphaned splits/streams/load; T3.5: non-numeric id no longer routes update→create).

---

## Milestone sequencing & dependencies
- **M0 before all.** Within M0: T0.1→T0.3→T0.4→T0.5→T0.6, then T0.2 and T0.7 (parallel-ok).
- **M1** after M0. T1.1 (identity seam) before T1.6 (auth builds on it). T1.2 before T1.3 (telemetry seam before Speed Insights wiring). T1.4/T1.5 independent.
- **M2** after M0; T2.3/T2.11 (db.ts) coordinate with T2.7 to avoid clobbering. T2.1 is the largest; land the shared extractions (T2.2, T2.5) first.
- **M3** after M0 (needs the regression-test harness); each is independent and separately signed off.

## Behavior-changing tasks (explicit approval required before starting)
T1.5, T1.6, and all of M3 (T3.1–T3.12). Everything else is behavior-preserving.

## Leverage order (cheapest+safest → highest-impact)
M0.1–0.7 → T1.1, T1.2, T1.4 (seams, safe) → T2.4, T2.5, T2.10 (quick safe wins) → T2.11, T2.3, T2.7 (db safety/perf) → T2.2, T2.1, T2.6 (bigger refactors) → T1.3 → **[sign-off gate]** → T3.2, T3.5, T3.9, T3.1 (small correctness) → T3.3, T3.4, T3.10, T3.11 (metric/display correctness) → T3.6, T3.7, T3.8 (resilience) → T1.6 (auth) → T3.12.
