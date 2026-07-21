import {
  CableIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  KeyRoundIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SyncButton } from "@/components/sync-button";
import {
  DisconnectButton,
  GearMatcher,
  ManualActivityForm,
} from "@/components/settings-forms";
import { getMeta, listShoes } from "@/lib/db";
import { isStravaConnected, stravaConfigured, tryFetchGear } from "@/lib/strava";
import { fmtDate, fmtDateLong, fmtTime } from "@/lib/format";

export const metadata = { title: "Settings" };

const CALLBACK_ERRORS: Record<string, string> = {
  denied: "Strava authorization was cancelled.",
  state: "The authorization state did not match. Try connecting again.",
  exchange: "Exchanging the authorization code failed. Check your API keys and try again.",
  missing_env: "Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET before connecting.",
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const params = await searchParams;
  const configured = stravaConfigured();
  const connected = isStravaConnected();
  const athleteName = getMeta("athlete_name");
  const lastSync = getMeta("last_sync_at");
  const baselineDate = getMeta("baseline_date");
  const gear = connected ? await tryFetchGear() : null;
  const shoes = listShoes();

  const justConnected = params.connected === "1";
  const errorKey = typeof params.error === "string" ? params.error : null;
  const errorMessage = errorKey ? CALLBACK_ERRORS[errorKey] ?? "Something went wrong." : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Strava connection, gear matching and manual corrections.
      </p>

      <div className="mt-6 space-y-6">
        {justConnected ? (
          <Alert className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2Icon />
            <AlertTitle>Strava connected</AlertTitle>
            <AlertDescription>
              Press Sync to pull your activities, then link each shoe to its Strava gear below.
            </AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Connection failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Strava</CardTitle>
            <CardDescription>
              Read only. Training Hub never writes anything to Strava.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!configured ? (
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <KeyRoundIcon className="size-4 text-wear-worn" aria-hidden />
                  API keys missing
                </p>
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  <li>
                    Create an API application at{" "}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      strava.com/settings/api
                    </a>{" "}
                    with Authorization Callback Domain set to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">localhost</code>
                  </li>
                  <li>
                    Copy <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.example</code> to{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code> and fill in the Client ID and Client Secret
                  </li>
                  <li>Restart the dev server and come back here to connect</li>
                </ol>
              </div>
            ) : connected ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <span aria-hidden className="size-2 rounded-full bg-positive" />
                    Connected{athleteName ? ` as ${athleteName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lastSync
                      ? `Last sync ${fmtDate(lastSync)} at ${fmtTime(lastSync)}. Syncs run automatically when the app loads after more than an hour.`
                      : "Never synced. Press Sync to pull your activities."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SyncButton connected={connected} />
                  <DisconnectButton />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <span aria-hidden className="size-2 rounded-full bg-muted-foreground/40" />
                    Not connected
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Authorize with the activity:read_all scope to sync your training history.
                  </p>
                </div>
                <Button asChild>
                  <a href="/api/strava/connect">
                    <CableIcon data-icon="inline-start" /> Connect Strava
                  </a>
                </Button>
              </div>
            )}

            {baselineDate ? (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                Shoe baselines were set on {fmtDateLong(baselineDate)}. Synced activities from
                before that date show up in the log as history but add no shoe mileage, because
                the baselines already include them.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Gear matching</CardTitle>
              <CardDescription>
                Link each shoe to its Strava gear so synced activities pick the right shoe
                automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {gear && gear.length > 0 ? (
                <GearMatcher
                  shoes={shoes.map((s) => ({
                    id: s.id,
                    name: s.name,
                    role: s.role,
                    retired: !!s.retired_at,
                    gearId: s.strava_gear_id,
                  }))}
                  gear={gear}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {gear === null
                    ? "Could not load your gear list from Strava right now. Try again later."
                    : "No shoes found on your Strava profile."}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Manual adjustment</CardTitle>
            <CardDescription>
              Backfill or correct shoe mileage with a manual confirmed entry. Use a negative
              distance to subtract kilometers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {shoes.length > 0 ? (
              <ManualActivityForm
                shoes={shoes.map((s) => ({
                  id: s.id,
                  name: s.name,
                  role: s.role,
                  retired: !!s.retired_at,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Add a shoe first.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
