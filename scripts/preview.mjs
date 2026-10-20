import http from "node:http";
import { build } from "esbuild";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const port = 47854;
const dir = await mkdtemp(path.join(tmpdir(), "morning-tab-ui-test-"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    fileURLToPath(
      new URL("../plugins/morning-tab/dist/server.mjs", import.meta.url),
    ),
  ],
  env: { ...process.env, MORNING_TAB_DATA_DIR: dir },
  stderr: "inherit",
});
const client = new Client({
  name: "morning-tab-ui-test-host",
  version: "0.1.0",
});
await client.connect(transport);
const demo = JSON.parse(
  await readFile(new URL("../examples/edition.json", import.meta.url), "utf8"),
);
const host = await build({
  entryPoints: ["test/host-app.mjs"],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) {
    res.writeHead(403);
    return res.end();
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "POST") {
      if (
        req.headers.origin &&
        req.headers.origin !== `http://127.0.0.1:${port}`
      )
        throw Error("Invalid origin");
      let result;
      if (req.url === "/tool") {
        let body = "";
        for await (const c of req) {
          body += c;
          if (body.length > 20000) throw Error("Too large");
        }
        const args = JSON.parse(body);
        if (
          ![
            "morning_tab_open",
            "morning_tab_get_state",
            "morning_tab_update_preferences",
          ].includes(args.name)
        )
          throw Error("Test host tool not allowed");
        result = await client.callTool(args);
      } else if (["/publish-example", "/edit-example"].includes(req.url)) {
        const current = await client.callTool({
          name: "morning_tab_read_plan",
          arguments: {},
        });
        result = await client.callTool({
          name: "morning_tab_publish_edition",
          arguments: {
            edition: {
              ...demo,
              stories: demo.stories.map((story, i) =>
                i === 0 && req.url === "/edit-example"
                  ? {
                      ...story,
                      title: `Conversation edit ${current.structuredContent.revision + 1}: ${story.title}`,
                    }
                  : story,
              ),
            },
            expectedRevision: current.structuredContent.revision,
          },
        });
      } else throw Error("Unknown path");
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(result));
    }
  if (req.url === "/host.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(host.outputFiles[0].text);
    }
    if (req.url === "/app.html") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        await readFile(
          new URL("../plugins/morning-tab/dist/app.html", import.meta.url),
          "utf8",
        ),
      );
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><meta charset="utf-8"><title>Morning Tab — MCP test host</title><style>body{margin:0;background:#e3e1d8;font:13px system-ui}header{padding:12px 20px;background:#fff}p{margin:4px 0}iframe{display:block;border:0;width:100%;height:calc(100vh - 110px);margin:12px auto;background:#f3f0e6}</style><header><b>MCP integration test host</b><p id="host-status">Connecting…</p><p id="event">This is a local test harness, not the ChatGPT/Codex UI.</p><button id="edit-example">Simulate conversation edit</button><button id="interrupt">Simulate read failure</button><span id="view-count"></span></header><iframe id="frame" title="Morning Tab app"></iframe><script type="module" src="/host.js"></script>',
    );
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`MCP UI test host: http://127.0.0.1:${port}`),
);
async function stop() {
  server.close();
  server.closeAllConnections();
  await client.close();
  await rm(dir, { recursive: true, force: true });
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
