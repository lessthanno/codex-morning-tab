import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const demo = JSON.parse(
  await readFile(new URL("../examples/edition.json", import.meta.url), "utf8"),
);
test("built distribution negotiates MCP, declares native entrypoints/settings and persists an edition", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "morning-tab-mcp-"));
  const isolated = path.join(directory, "plugin");
  await cp(
    fileURLToPath(new URL("../plugins/morning-tab/dist/", import.meta.url)),
    isolated,
    { recursive: true },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(isolated, "server.mjs")],
    cwd: isolated,
    env: { ...process.env, MORNING_TAB_DATA_DIR: directory },
    stderr: "pipe",
  });
  const client = new Client({ name: "morning-tab-test", version: "0.1.0" });
  let logs = "";
  transport.stderr?.on("data", (c) => (logs += c));
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const open = tools.tools.find((t) => t.name === "morning_tab_open");
    assert.ok(open);
    assert.deepEqual(open._meta["openai/ui"].entrypoints, [{ type: "global" }]);
    const panel = tools.tools.find((t) => t.name === "morning_tab_open_panel");
    assert.deepEqual(panel._meta["openai/ui"].entrypoints, [
      { type: "thread" },
    ]);
    for (const name of [
      "morning_tab_publish_edition",
      "morning_tab_get_state",
      "morning_tab_read_plan",
      "morning_tab_update_preferences",
    ]) {
      const tool = tools.tools.find((t) => t.name === name);
      assert.ok(tool, `${name} is registered`);
      assert.equal(
        tool._meta?.ui?.resourceUri,
        undefined,
        `${name} must not open a view`,
      );
      assert.equal(tool._meta?.["openai/outputTemplate"], undefined);
    }
    const caps = client.getServerCapabilities();
    const settingCap =
      caps.extensions?.["openai/settings"] ||
      caps.experimental?.["openai/settings"];
    assert.ok(settingCap, "native settings capability advertised");
    const native = await client.callTool({
      name: settingCap.readTool,
      arguments: {},
    });
    assert.ok(native.structuredContent.schema.properties.sourceUrls);
    assert.ok(native.structuredContent.values.timezone);
    const initial = await client.callTool({
      name: "morning_tab_read_plan",
      arguments: {},
    });
    assert.equal(initial.structuredContent.revision, 0);
    const saved = await client.callTool({
      name: "morning_tab_publish_edition",
      arguments: { edition: demo, expectedRevision: 0 },
    });
    assert.ok(!saved.isError, JSON.stringify(saved));
    assert.equal(saved.structuredContent.edition.stories.length, 4);
    const failed = await client.callTool({
      name: "morning_tab_publish_edition",
      arguments: { edition: demo, expectedRevision: 0 },
    });
    assert.equal(failed.isError, true);
    const reopened = await client.callTool({
      name: "morning_tab_open",
      arguments: {},
    });
    assert.equal(
      reopened.structuredContent.edition.id,
      saved.structuredContent.edition.id,
    );
    // Multiple typed conversation edits use only data tools. One already-open view reads each revision.
    let revision = saved.structuredContent.revision;
    for (const title of ["A shorter lead", "A second conversation edit"]) {
      const edited = structuredClone(demo);
      edited.stories[0].title = title;
      const editedResult = await client.callTool({
        name: "morning_tab_publish_edition",
        arguments: { edition: edited, expectedRevision: revision },
      });
      assert.ok(!editedResult.isError, JSON.stringify(editedResult));
      revision = editedResult.structuredContent.revision;
      const viewState = await client.callTool({
        name: "morning_tab_get_state",
        arguments: {},
      });
      assert.equal(viewState.structuredContent.edition.stories[0].title, title);
      assert.equal(viewState.structuredContent.revision, revision);
      assert.equal(editedResult._meta?.ui?.resourceUri, undefined);
    }
    const resource = await client.readResource({
      uri: open._meta.ui.resourceUri,
    });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.ok(resource.contents[0].text.includes("Update newspaper"));
    assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains, []);
  } catch (e) {
    e.message += `\nserver stderr: ${logs}`;
    throw e;
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
