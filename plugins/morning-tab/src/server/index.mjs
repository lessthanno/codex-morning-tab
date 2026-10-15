import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createStore } from "./store.mjs";
import { createMorningTabServer } from "./register.mjs";
const dataDir =
  process.env.MORNING_TAB_DATA_DIR ||
  path.join(homedir(), ".local", "share", "codex-morning-tab");
const store = createStore(dataDir);
const html = await readFile(new URL("./app.html", import.meta.url), "utf8");
serveStdio(() => createMorningTabServer({ store, html }));
