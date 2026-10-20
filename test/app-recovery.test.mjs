import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createStateSync } from "../plugins/morning-tab/src/app/state-sync.mjs";

const filename = new URL("../plugins/morning-tab/src/app/MorningTab.mjs", import.meta.url);
const source = (await readFile(filename, "utf8")).replace(/^import [^\n]*\n/gm, "");
function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
  };
}
async function harness({ failFirstRead = false } = {}) {
  const timers = new Map();
  let nextTimer = 0, app;
  let saved = { revision: 1, settings: { language: "zh", timezone: "UTC" }, edition: { id: "old-edition" } };
  let nextReadError = failFirstRead ? new Error("temporary read failure") : null;
  let sendReply = Promise.resolve({});
  const calls = [], messages = [], rendered = [];
  const elements = Object.fromEntries([
    "paper", "status", "refresh", "preferences", "preferences-dialog", "preferences-form",
  ].map((id) => {
    const classes = new Set();
    return [id, {
      ...eventTarget(), innerHTML: "", textContent: "", disabled: id === "refresh",
      classList: {
        toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
        contains: (name) => classes.has(name),
      },
    }];
  }));
  const document = { ...eventTarget(), hidden: false, documentElement: {}, getElementById: (id) => elements[id] };
  class App {
    constructor() { app = this; }
    async connect() {}
    async callServerTool(params) {
      calls.push(params);
      if (nextReadError) { const error = nextReadError; nextReadError = null; throw error; }
      return { structuredContent: saved };
    }
    async updateModelContext() {}
    async sendMessage(params) { messages.push(params); return sendReply; }
  }
  class OpenAIExtensions {
    constructor(instance) { this.message = { send: (params) => instance.sendMessage(params) }; }
  }
  const context = vm.createContext({
    App, OpenAIExtensions, document, window: { parent: {} }, Error, Date, console,
    SettingsSchema: { parse: (value) => value }, escapeHtml: String, demo: {},
    renderPaper(next) { rendered.push(next); return `edition:${next.edition?.id ?? "none"}`; },
    createStateSync: (options) => createStateSync({ ...options,
      setTimer(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
      clearTimer(id) { timers.delete(id); },
    }),
  });
  await vm.runInContext(`(async () => {\n${source}\n})()`, context, { filename: filename.pathname });
  async function tick() {
    assert.equal(timers.size, 1, "one retry/poll must be scheduled");
    const [id, fn] = timers.entries().next().value;
    timers.delete(id);
    await fn();
  }
  if (calls.length === 0) await tick();
  return {
    app, calls, messages, rendered, elements, document, timers, tick,
    failNextRead() { nextReadError = new Error("temporary read failure"); },
    setState(next) { saved = next; },
    holdMessage() {
      let resolve;
      sendReply = new Promise((r) => { resolve = r; });
      return resolve;
    },
    clickRefresh() { return elements.refresh.listeners.get("click")(); },
  };
}
test("a failed first read retries and recovers without reopening", async () => {
  const h = await harness({ failFirstRead: true });
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.size, 1, "first read failure must not disable polling permanently");
  await h.tick();
  assert.equal(h.elements.paper.innerHTML, "edition:old-edition");
  assert.equal(h.elements.status.classList.contains("error"), false);
  assert.equal(h.elements.refresh.disabled, false);
  await h.app.onteardown();
});
test("a recovered poll clears the connection error and keeps the edition", async () => {
  const h = await harness();
  const previousPaper = h.elements.paper.innerHTML;
  h.failNextRead();
  await h.tick();
  assert.equal(h.elements.status.classList.contains("error"), true);
  assert.equal(h.elements.paper.innerHTML, previousPaper);
  const errorText = h.elements.status.textContent;
  await h.tick();
  assert.equal(h.elements.status.classList.contains("error"), false);
  assert.notEqual(h.elements.status.textContent, errorText);
  await h.app.onteardown();
});
test("ordinary successful polls preserve the waiting-for-edition notice", async () => {
  const h = await harness();
  await h.clickRefresh();
  const waiting = h.elements.status.textContent;
  assert.ok(waiting.length > 0);
  assert.equal(h.elements.status.classList.contains("error"), false);
  assert.equal(h.elements.refresh.disabled, true);
  await h.tick(); await h.tick();
  assert.equal(h.elements.status.textContent, waiting);
  assert.equal(h.elements.refresh.disabled, true);
  await h.app.onteardown();
});
test("one refresh sends one request, new edition completes it, teardown stops polling", async () => {
  const h = await harness();
  const release = h.holdMessage();
  const first = h.clickRefresh(), duplicate = h.clickRefresh();
  assert.equal(h.messages.length, 1);
  release({});
  await Promise.all([first, duplicate]);
  assert.equal(h.messages[0].role, "user");
  assert.equal(h.messages[0]._meta["openai/message"].target, "active");
  assert.equal(h.messages[0]._meta["openai/message"].send, true);
  h.setState({ revision: 2, settings: { language: "zh", timezone: "UTC" }, edition: { id: "new-edition" } });
  await h.tick();
  assert.equal(h.elements.paper.innerHTML, "edition:new-edition");
  assert.equal(h.elements.refresh.disabled, false);
  assert.equal(h.messages.length, 1);
  assert.ok(h.calls.every((call) => call.name === "morning_tab_get_state"));
  await h.app.onteardown();
  assert.equal(h.timers.size, 0);
  assert.equal(h.document.listeners.has("visibilitychange"), false);
});
