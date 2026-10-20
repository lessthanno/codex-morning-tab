import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getRequestListener } from "@hono/node-server";
import { createMorningTabServer } from "./register.mjs";
import { createStore } from "./store.mjs";
import packageInfo from "../../package.json" with { type: "json" };

const port = Number(process.env.MORNING_TAB_PORT ?? 47855);
if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535)
  throw Error("Invalid MORNING_TAB_PORT");
const store = createStore(process.env.MORNING_TAB_DATA_DIR ||
  path.join(homedir(), ".local", "share", "codex-morning-tab"));
const html = await readFile(new URL("./app.html", import.meta.url), "utf8");
await store.read();
// One shared store serializes writes from every client and protects revisions.
const handler = createMcpHandler(() => createMorningTabServer({ store, html }), {
  maxRequestBodySize: 4 * 1024 * 1024,
  onerror: (error) => console.error(error.message),
});
let boundPort;
const server = createServer(getRequestListener(async (request) => {
  const hosts = [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];
  const origin = request.headers.get("origin");
  if (!hosts.includes(request.headers.get("host")) ||
      (origin !== null && !hosts.some((host) => origin === `http://${host}`)))
    return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    try {
      const state = await store.read();
      return Response.json({ service: "morning-tab", version: packageInfo.version,
        status: "ok", pid: process.pid, uptimeSeconds: Math.floor(process.uptime()),
        revision: state.revision, hasSavedEdition: Boolean(state.edition) },
      { headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json({ service: "morning-tab", status: "data-unavailable" }, { status: 503 });
    }
  }
  if (url.pathname !== "/mcp") return new Response("Not found", { status: 404 });
  return handler.fetch(request);
}, { overrideGlobalObjects: false }));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.on("error", (error) => { console.error(error.message); process.exit(1); });
server.listen(port, "127.0.0.1", () => {
  boundPort = server.address().port;
  console.log(`Morning Tab ${packageInfo.version} listening on http://127.0.0.1:${boundPort}/mcp`);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await handler.close();
  server.closeAllConnections();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
