import { exec, one } from "./helpers";

export async function getMeta(key: string): Promise<string | null> {
  const row = await one<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await exec(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

export async function deleteMeta(key: string): Promise<void> {
  await exec("DELETE FROM app_meta WHERE key = ?", [key]);
}
