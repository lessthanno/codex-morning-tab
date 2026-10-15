import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SettingsSchema, validateEdition } from "../newspaper/contracts.mjs";
const defaultSettings = () =>
  SettingsSchema.parse({
    language: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
export function createStore(directory) {
  let queue = Promise.resolve();
  const filename = path.join(directory, "state.json");
  const read = async () => {
    try {
      const data = JSON.parse(await readFile(filename, "utf8"));
      const settings = SettingsSchema.parse(data.settings);
      return { ...data, settings };
    } catch (err) {
      if (err.code === "ENOENT")
        return { settings: defaultSettings(), edition: null, revision: 0 };
      throw Error(
        "Stored data could not be read. Restore state.json from your backup before saving new changes.",
      );
    }
  };
  const change = (fn) => {
    const result = queue.then(async () => {
      const before = await read();
      const after = await fn(before);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temp = path.join(directory, `state-${randomUUID()}.tmp`);
      try {
        await writeFile(temp, JSON.stringify(after, null, 2), { mode: 0o600 });
        await rename(temp, filename);
      } finally {
        await rm(temp, { force: true });
      }
      return after;
    });
    queue = result.catch(() => {});
    return result;
  };
  return {
    read,
    updateSettings: (patch) =>
      change((before) => ({
        ...before,
        settings: SettingsSchema.parse({ ...before.settings, ...patch }),
        revision: before.revision + 1,
      })),
    publish: (input, expectedRevision) =>
      change((before) => {
        if (expectedRevision !== before.revision)
          throw Error(
            "Reading preferences or the edition changed during generation. Read the current plan again, revalidate the edition and retry.",
          );
        const edition = {
          ...validateEdition(input, before.settings),
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        };
        return { ...before, edition, revision: before.revision + 1 };
      }),
  };
}
