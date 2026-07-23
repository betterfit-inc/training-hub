/**
 * Backfill script: computes training load (TSS) for every confirmed activity
 * from the current athlete thresholds and writes it to activity_load. Only auto
 * rows are touched — manual overrides stay put — so this is safe to re-run.
 *
 *   npm run backfill:load
 */
import { ensureMigrated, listActivityLoadsForPmc, recomputeAllLoads } from "../src/lib/db";

/**
 * Guard against backfilling a remote (shared/prod Turso) database. Resolves the DB
 * URL exactly like src/lib/db.ts (TURSO_DATABASE_URL → DATABASE_URL → local file). A
 * file: URL (local dev) runs normally; a remote URL refuses unless the writer
 * explicitly opts in with ALLOW_REMOTE_DB=1 or --force.
 */
function assertLocalDb(): void {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:data/app.db";
  if (url.startsWith("file:")) return;
  if (process.env.ALLOW_REMOTE_DB === "1" || process.argv.includes("--force")) return;
  let host = url;
  try {
    host = new URL(url).host || url;
  } catch {
    // Not a parseable URL; fall back to showing the raw value.
  }
  console.error(
    `Refusing to backfill a remote database (${host}). This protects the shared/prod DB. ` +
      `Re-run with ALLOW_REMOTE_DB=1 to override.`
  );
  process.exit(1);
}

async function main() {
  assertLocalDb();
  await ensureMigrated();

  const { count } = await recomputeAllLoads();
  console.log(`Computed training load for ${count} confirmed activities.`);

  const sample = (await listActivityLoadsForPmc()).slice(0, 8);
  if (sample.length > 0) {
    console.log("Sample TSS values:");
    for (const row of sample) {
      console.log(`  ${row.started_at}  ${row.tss} TSS`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
