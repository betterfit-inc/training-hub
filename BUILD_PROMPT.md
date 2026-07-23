You are the **orchestrator** for an **unattended, overnight** Training Hub build. The human started you and went to sleep — **work autonomously from start to finish and do NOT wait for input or check in.** They review your PR in the morning. Goal: complete as much of the Phase 3 backlog as possible, safely, with every change self-validated, and leave a clear report.

**Read first:** `ASSESSMENT.md` (source of truth — Phases 0–2 = coding standard `G*` + findings; "Product-readiness" = optionality decisions; **Phase 3 = your work queue**) and `AGENTS.md` (this is a modified Next.js — consult the relevant guide under `node_modules/next/dist/docs/` before writing code).

## Execution model
- **You orchestrate; you don't implement.** Each task → a fresh sub-agent (Agent tool, `general-purpose`) given ONLY that task's context: its Phase 3 row, the files/areas it names, the guideline IDs it must meet.
- **Integration branch:** create `build/overnight` off `main`. First commit adds `ASSESSMENT.md`, `BUILD_PROMPT.md`, and a new `BUILD_LOG.md`. **All work stacks on this branch so tasks compose. Never touch `main`.**
- **Order:** Phase 3 leverage order — **M0 (in sequence) → M1 seams → M2 → M3 → auth (T1.6) LAST.** Independent tasks may run as parallel sub-agents only when they touch disjoint files.

## Per-task loop (every sub-agent)
1. Work from the current `build/overnight`.
2. Make the **smallest** change meeting the task's acceptance criteria. For correctness / behavior-changing tasks, write the regression test **first** (reproduce the exact Phase 2 failure scenario), then fix.
3. Self-validate: `npm run verify` = typecheck + lint + format:check + vitest unit + vitest API/route + Playwright UI/flow E2E, against a **seeded LOCAL sqlite DB with Strava mocked**. Iterate until **fully green**.
4. Only when green: commit to `build/overnight` as `<id>: <summary>` (one concern per commit) and append the outcome to `BUILD_LOG.md`.
5. If a task can't reach green after ~3 honest attempts, or needs a product decision you can't safely make: **revert its partial changes, mark it SKIPPED/BLOCKED in `BUILD_LOG.md` with the reason, move on.** Never leave the branch red. **Never weaken a test or the gate to force a pass.**

## Autonomy (no human in the loop tonight)
- **The morning PR is the review gate, so build everything into the branch but MERGE NOTHING.** This replaces the per-task sign-off gates: behavior-changing tasks (T1.5, T3.*) still get built — each as a clearly labeled commit with risk notes in `BUILD_LOG.md`.
- **Auth (T1.6)** is the one product-shaping task: implement a minimal, reversible first cut (single-owner; pick the simpler of magic-link or password), keep it small, do it **last**, and record design choices + open questions in `BUILD_LOG.md`. If it threatens to grow large or ambiguous, stop at a documented skeleton rather than forcing it.
- Dependencies the plan requires (vitest, Playwright, prettier/biome, knip, madge, `@vercel/speed-insights`, and — only if needed — a lightweight auth/email lib) are **pre-approved** by the assessment decisions; add them and note each in `BUILD_LOG.md`.

## Hard safety rails
- Never merge or push to `main`; never force-push; never rewrite history; never `gh auth switch` or change git identity.
- Push only `build/overnight` and open **one** PR → `main` (personal account):
  `GH_TOKEN=$(gh auth token --user marcossnikel) gh pr create --base main --head build/overnight --title "Overnight build: Phase 3 M0–M3" --body "<summary + BUILD_LOG.md>"`
  If no remote/PR is available, push the branch and write the PR instructions into `BUILD_LOG.md`.
- Tests/verify run against a LOCAL sqlite file ONLY — never export `TURSO_*` into the test env; never run `npm run seed` against the shared Turso DB.
- Honor the Phase 1 guidelines and the product decisions: identity/auth/telemetry seams resolve to the single owner; **no `athlete_id` columns yet**; **auth = email/password or magic-link only, no social OAuth**; observability + Speed Insights now, usage analytics deferred behind the telemetry seam.
- Parallel in-flight work may exist (Phase 6: `blocks.ts`, `race-compare.tsx`, `races/compare`). Branch off current `main`; if it has landed, re-check the churn-excluded findings before editing those files.

## Morning deliverable
One PR `build/overnight → main`. Its body + `BUILD_LOG.md` list, per task: **DONE / SKIPPED / BLOCKED**, the commit, verify result, and anything needing your decision. Highest-leverage, lowest-risk work is committed first so the branch is mergeable top-down.

## Start now — do not check in
Create `build/overnight`, commit the plan docs + an initial `BUILD_LOG.md`, then execute the backlog top to bottom, keeping the branch green. When you've done what you safely can (or run out of runway), finalize `BUILD_LOG.md`, open/refresh the PR, and stop.
