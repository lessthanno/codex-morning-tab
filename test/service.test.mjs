import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("service negotiates HTTP MCP, rejects hostile origins, serializes concurrent saves and preserves data across restart", { timeout: 30_000 }, async () => {
  const data = await mkdtemp(path.join(tmpdir(), "morning-tab-http-test-"));
  const demo = JSON.parse(await readFile(new URL("../examples/edition.json", import.meta.url), "utf8"));
  let child;
  const clients = [];
  async function start() {
    child = spawn(process.execPath, [fileURLToPath(new URL("../plugins/morning-tab/dist/service.mjs", import.meta.url))], {
      env: { ...process.env, MORNING_TAB_PORT: "0", MORNING_TAB_DATA_DIR: data },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    return new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", () => reject(Error(`Service exited: ${errors}`)));
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/);
        if (match) resolve(new URL(match[0]));
      });
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  async function connect(url) {
    const client = new Client({ name: "service-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(url));
    clients.push(client);
    return client;
  }
  try {
    const url = await start();
    const healthUrl = new URL("/health", url);
    const health = await (await fetch(healthUrl)).json();
    assert.equal(health.status, "ok");
    assert.equal(health.revision, 0);
    // Node fetch derives Host from its URL. Use an actual wire-level override.
    const hostileHostStatus = await new Promise((resolve, reject) => {
      const req = request(healthUrl, { headers: { Host: "hostile.example" } }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(healthUrl, { headers: { Origin: "https://hostile.example" } })).status, 403);
    const first = await connect(url), second = await connect(url);
    const inventory = await first.listTools();
    const open = inventory.tools.find((tool) => tool.name === "morning_tab_open");
    assert.deepEqual(open._meta["openai/ui"].entrypoints, [{ type: "global" }]);
    const resource = await first.readResource({ uri: open._meta.ui.resourceUri });
    assert.ok(resource.contents[0].text.includes("Retrying automatically"));
    const results = await Promise.all([first, second].map((client) => client.callTool({
      name: "morning_tab_publish_edition", arguments: { edition: demo, expectedRevision: 0 },
    })));
    assert.equal(results.filter((result) => !result.isError).length, 1);
    assert.equal(results.filter((result) => result.isError).length, 1);
    const before = await first.callTool({ name: "morning_tab_get_state", arguments: {} });
    for (const client of clients.splice(0)) await client.close();
    await stop();
    const restarted = await connect(await start());
    const after = await restarted.callTool({ name: "morning_tab_get_state", arguments: {} });
    assert.equal(after.structuredContent.revision, 1);
    assert.equal(after.structuredContent.edition.id, before.structuredContent.edition.id);
  } finally {
    for (const client of clients) await client.close();
    await stop();
    await rm(data, { recursive: true, force: true });
  }
});
