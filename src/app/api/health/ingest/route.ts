// Machine-to-machine ingest for the source-agnostic health layer.
//
// A standalone sync service (the Garmin GitHub Action today; a Coros adapter
// later) POSTs a normalized health snapshot here. Auth is NOT the user session —
// it is a shared machine token in the Authorization header, checked constant-time
// against HEALTH_INGEST_SECRET. src/proxy.ts allowlists this path so the page
// gate never redirects the machine caller; this handler is the only thing
// guarding it, so the token check is mandatory.
//
// The route is intentionally thin: parse -> authorize -> normalize (the pure
// src/lib/health.ts) -> idempotent upsert. Re-posting a day overwrites that
// day's rows for that source, so a trailing-window re-sync backfills cleanly.
import type { NextRequest } from "next/server";
import { constantTimeEqual } from "@/lib/crypto";
import { snapshotToMetrics } from "@/lib/health";
import { replaceHealthMetricsForDaySource } from "@/lib/db";
import { logger } from "@/lib/telemetry";

const BEARER = "Bearer ";

/** True only when the request carries the exact shared token (constant-time). */
function isAuthorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith(BEARER)) return false;
  return constantTimeEqual(header.slice(BEARER.length), secret);
}

export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.HEALTH_INGEST_SECRET ?? "";
  // Unconfigured = closed. Without a secret there is no way to authenticate the
  // caller, so refuse rather than accept anonymous writes.
  if (!secret) {
    logger.error("health.ingest.unconfigured");
    return Response.json({ ok: false, error: "ingest not configured" }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    logger.warn("health.ingest.unauthorized");
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const normalized = snapshotToMetrics(body, new Date().toISOString());
  if ("error" in normalized) {
    return Response.json({ ok: false, error: normalized.error }, { status: 400 });
  }

  const { rows } = normalized;
  if (rows.length === 0) {
    // A well-formed snapshot with no usable readings: accept it as a no-op rather
    // than error, and leave any existing rows for the day untouched.
    logger.info("health.ingest.empty", { date: (body as { date?: string }).date });
    return Response.json({ ok: true, count: 0 });
  }

  const { date, source } = rows[0];
  await replaceHealthMetricsForDaySource(date, source, rows);
  logger.info("health.ingest.ok", { date, source, count: rows.length });
  return Response.json({ ok: true, date, source, count: rows.length });
}
