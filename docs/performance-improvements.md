# Performance improvements — page-to-page navigation latency

Not part of the health-readiness feature. A separate track to investigate later.

## Symptom
Navigating between pages (e.g. Settings → Log) takes a few seconds. It feels like each navigation refetches data before the page paints.

## Step 0: measure, and separate dev from prod FIRST
- `next dev` compiles routes on demand and does not prefetch links, so page-to-page is **always** slow in local dev. A large part of the "seconds" may be dev-only. Measure on the **prod** Vercel deployment before optimizing anything.
- On prod, use the browser Network/Performance panels + Vercel Speed Insights (already installed) to get: TTFB per navigation, server render time, and DB query time. Add lightweight timing around the RSC data loads (through the telemetry seam) to see per-page query cost and how many queries each page runs.
- Only optimize what the numbers actually show.

## Likely causes in this app
- Pages render dynamically (root layout is `force-dynamic`), so every navigation is a fresh server render that hits the database.
- Turso is **remote** — a network round-trip per query — and several pages run multiple queries (the layout also queries, e.g. the pending-review count). Round-trips add up.
- No server-data caching, and in dev no router-prefetch benefit.
- Serverless cold starts on Vercel can add latency to the first navigation after idle.

## Options (ranked, mix and match — it's a personal project, pick freely)
1. **Turso embedded replicas / edge.** Likely the single biggest win for a remote DB: keep a local libSQL replica so reads are near-instant and sync from the primary. Directly attacks the per-query network latency.
2. **Cut and parallelize per-page queries.** Audit each page's reads; run independent queries with `Promise.all`; we already deduped `countPending` via React `cache()` — extend that pattern and drop any over-fetching.
3. **Segment / data caching with targeted revalidation.** Cache the reads that don't need per-navigation freshness (gear lists, thresholds, zones) via `unstable_cache` / route segment config (or `use cache` if adopting `cacheComponents`), keyed by tag, and `revalidateTag`/`revalidatePath` on the relevant mutations so data stays correct. Keep the log/fitness views fresh; the app deliberately chose `force-dynamic` for freshness, so cache selectively.
4. **Prefetch + streaming UX.** Ensure `<Link>` prefetch on prod, and add `loading.tsx` / `Suspense` boundaries so a navigation paints instantly and data streams in. This fixes perceived speed even when a query is genuinely slow.
5. **Client-side cache (React Query or SWR).** If some reads move to client components, a query cache with stable query keys makes revisits instant and dedupes in-flight requests (prefetch on hover, `staleTime`, etc.). This is a bigger shift since the app is RSC-first, but it's the right tool for interactive, frequently-refetched views. Use per-resource query keys.
6. **Trim payloads.** Avoid selecting large columns you don't render (we already stopped pulling `raw_json` in the load recompute), paginate the log, and keep props small (rows are already flattened to plain objects).

## Suggested first pass
1. Measure on prod (Speed Insights + Network) and log per-page query time — confirm it's DB latency and not a dev artifact.
2. Add `loading.tsx` to the heavy pages for instant perceived navigation.
3. Try Turso embedded replicas (probably the biggest real win).
4. Then decide whether selective segment caching or a client query cache (React Query/SWR) is worth the change.
