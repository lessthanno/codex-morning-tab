// Browser test host, not a production or model-backed host. Uses the real MCP stdio server.
import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
const call = async (name, args = {}) => {
  const r = await fetch("/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  return r.json();
};
const iframe = document.getElementById("frame");
const failFirstRead = new URLSearchParams(location.search).has("fail-first-read");
let failedReads = failFirstRead ? 1 : 0;
document.getElementById("interrupt").addEventListener("click", (event) => {
  failedReads = failedReads === Infinity ? 0 : Infinity;
  event.currentTarget.textContent = failedReads ? "Restore connection" : "Simulate read failure";
});
let frameLoads = 0;
iframe.addEventListener("load", () => {
  document.getElementById("view-count").textContent =
    `View loads: ${++frameLoads}`;
});
document.getElementById("edit-example").addEventListener("click", async () => {
  const result = await fetch("/edit-example", { method: "POST" });
  if (result.ok)
    document.getElementById("event").textContent =
      "Conversation edit saved via MCP. The existing newspaper should update without opening a view.";
});
if (location.search.includes("narrow")) iframe.style.width = "390px";
const bridge = new AppBridge(
  null,
  { name: "Morning Tab browser test host", version: "0.1.0" },
  { serverTools: {}, openLinks: {}, message: { text: {} }, logging: {} },
  { hostContext: { theme: "light", displayMode: "fullscreen" } },
);
bridge.oncalltool = (params) => {
  if (params.name === "morning_tab_get_state" && failedReads > 0) {
    failedReads--;
    return { isError: true, content: [{ type: "text", text: "Simulated temporary connection failure" }] };
  }
  return call(params.name, params.arguments);
};
bridge.onopenlink = async ({ url }) => {
  document.getElementById("event").textContent = `Link requested: ${url}`;
  return {};
};
bridge.onmessage = async (params) => {
  document.getElementById("event").textContent =
    "Refresh message received by the test host. A public fixture edition will be saved; no model call is made.";
  await fetch("/publish-example", { method: "POST" });
  return {};
};
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} });
  if (!failFirstRead) await bridge.sendToolResult(await call("morning_tab_open"));
  document.getElementById("host-status").textContent =
    "Real MCP connection active; conversation generation is simulated.";
};
await bridge.connect(
  new PostMessageTransport(iframe.contentWindow, iframe.contentWindow),
);
iframe.src = "/app.html";
