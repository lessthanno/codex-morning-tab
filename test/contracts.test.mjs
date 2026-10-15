import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SettingsSchema,
  safeUrl,
  validateEdition,
} from "../plugins/morning-tab/src/newspaper/contracts.mjs";
import { renderPaper } from "../plugins/morning-tab/src/newspaper/render.mjs";
import { createStore } from "../plugins/morning-tab/src/server/store.mjs";
const demo = JSON.parse(
  await readFile(new URL("../examples/edition.json", import.meta.url), "utf8"),
);
const settings = SettingsSchema.parse({ language: "en", timezone: "UTC" });
test("URL gate excludes local, credential and blocked destinations", () => {
  for (const u of [
    "http://example.com",
    "file:///etc/passwd",
    "https://127.1/",
    "https://0x7f000001/",
    "https://[::1]/",
    "https://router.internal/",
    "https://a:secret@example.com/",
    "https://example.com/?access_token=private",
    "https://accounts.mail.google.com/",
  ])
    assert.throws(() => safeUrl(u, ["mail.google.com"]));
  assert.equal(
    safeUrl("https://github.com/openai#readme"),
    "https://github.com/openai",
  );
});
test("edition links need successfully read provenance; duplicate stories collapse", () => {
  const edition = structuredClone(demo);
  edition.stories.push({ ...edition.stories[0] });
  assert.equal(
    validateEdition(edition, settings).stories.length,
    demo.stories.length,
  );
  edition.stories[0].readFrom = "https://example.com/not-read";
  assert.throws(() => validateEdition(edition, settings), /successfully read/);
});
test("plain text cannot inject executable markup or links into rendered newspaper", () => {
  const edition = structuredClone(demo);
  edition.stories[0].title = "<script>alert(1)</script>";
  edition.stories[0].summary = "<img src=x onerror=alert(1)>";
  const clean = validateEdition(edition, settings);
  const html = renderPaper({
    settings,
    edition: { ...clean, createdAt: "2026-10-15T02:00:00Z" },
  });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});
test("failed or stale refresh keeps the previous stored edition intact", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "morning-tab-store-"));
  try {
    const store = createStore(dir);
    const first = await store.publish(demo, 0);
    assert.ok(first.edition.id);
    const before = await readFile(path.join(dir, "state.json"), "utf8");
    const failed = structuredClone(demo);
    failed.sources.forEach((s) => (s.status = "failed"));
    await assert.rejects(store.publish(failed, 1), /No source/);
    assert.equal(await readFile(path.join(dir, "state.json"), "utf8"), before);
    await store.updateSettings({ masthead: "A new title" });
    await assert.rejects(store.publish(demo, 1), /changed during generation/);
    assert.equal((await store.read()).edition.id, first.edition.id);
    const parallel = await Promise.allSettled([
      store.publish(demo, 2),
      store.publish(demo, 2),
    ]);
    assert.equal(parallel.filter((s) => s.status === "fulfilled").length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("settings are validated before a source becomes available to the reading plan", () => {
  assert.throws(() =>
    SettingsSchema.parse({
      ...settings,
      sourceUrls: "https://docs.google.com/private",
    }),
  );
  assert.throws(() =>
    SettingsSchema.parse({ ...settings, timezone: "invalid/timezone" }),
  );
});
