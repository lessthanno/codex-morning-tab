// Install an optional, login-scoped macOS service without modifying plugin caches.
import { cp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") throw Error("The service installer requires macOS.");
const label = "com.lessthanno.morning-tab";
const target = `gui/${process.getuid()}/${label}`;
const source = fileURLToPath(new URL("../", import.meta.url));
const home = homedir();
const base = path.join(home, "Library", "Application Support", "MorningTab");
const service = path.join(base, "service");
const marketplace = path.join(base, "marketplace");
const plugin = path.join(marketplace, "plugins", "morning-tab");
const data = path.join(home, ".local", "share", "codex-morning-tab");
const logs = path.join(data, "service-logs");
const plist = path.join(home, "Library", "LaunchAgents", `${label}.plist`);
const url = "http://127.0.0.1:47855/mcp";
function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (!allowFailure && result.status !== 0)
    throw Error(`${command} failed: ${result.stderr || result.error?.message || result.stdout}`);
  return result;
}
const xml = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
async function healthy() {
  const response = await fetch("http://127.0.0.1:47855/health", { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw Error("Morning Tab is not healthy");
  return response.json();
}
const action = process.argv[2] || "status";
if (action === "status") {
  console.log(run("launchctl", ["print", target]).stdout);
  console.log(await healthy());
} else if (action === "restart") {
  run("launchctl", ["kickstart", "-k", target]);
  console.log("Morning Tab restart requested.");
} else if (action === "install") {
  await access(path.join(source, "plugins/morning-tab/dist/service.mjs"));
  // Keep the already working launchd runtime when upgrading; a GUI login
  // session can reject a different Homebrew/NVM executable even if CLI works.
  const priorRuntime = run("plutil", ["-extract", "ProgramArguments.0", "raw", "-o", "-", plist], { allowFailure: true });
  const runtime = process.env.MORNING_TAB_NODE ||
    (priorRuntime.status === 0 ? priorRuntime.stdout.trim() : process.execPath);
  await access(runtime, constants.X_OK);
  const version = JSON.parse(await readFile(path.join(source, "plugins/morning-tab/package.json"), "utf8")).version;
  const backup = path.join(base, "backups", new Date().toISOString().replaceAll(":", "-"));
  await mkdir(backup, { recursive: true });
  const preserved = new Set();
  const wasRunning = run("launchctl", ["print", target], { allowFailure: true }).status === 0;
  for (const [from, name] of [[service, "service"], [marketplace, "marketplace"], [plist, "agent.plist"]]) {
    try { await access(from); } catch { continue; }
    await cp(from, path.join(backup, name), { recursive: true });
    preserved.add(name);
  }
  await mkdir(service, { recursive: true });
  await mkdir(logs, { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(plist), { recursive: true });
  await cp(path.join(source, "plugins/morning-tab"), plugin, { recursive: true });
  for (const name of ["service.mjs", "app.html", "THIRD-PARTY-LICENSES.txt"])
    await cp(path.join(plugin, "dist", name), path.join(service, name));
  const portable = { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { "morning-tab": { type: "streamable-http", url } } };
  await writeFile(path.join(plugin, "mcp.json"), JSON.stringify(portable, null, 2) + "\n");
  await writeFile(path.join(plugin, ".mcp.json"), JSON.stringify({ mcpServers: { "morning-tab": { url } } }, null, 2) + "\n");
  await mkdir(path.join(marketplace, ".agents", "plugins"), { recursive: true });
  await cp(path.join(source, ".agents/plugins/marketplace.json"), path.join(marketplace, ".agents/plugins/marketplace.json"));
  await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(runtime)}</string><string>${xml(path.join(service, "service.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(service)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer>
<key>ProcessType</key><string>Background</string>
<key>EnvironmentVariables</key><dict><key>MORNING_TAB_DATA_DIR</key><string>${xml(data)}</string><key>MORNING_TAB_PORT</key><string>47855</string></dict>
<key>StandardOutPath</key><string>${xml(path.join(logs, "stdout.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, "stderr.log"))}</string>
</dict></plist>\n`, { mode: 0o600 });
  run("plutil", ["-lint", plist]);
  run("launchctl", ["bootout", target], { allowFailure: true });
  try {
    run("launchctl", ["bootstrap", `gui/${process.getuid()}`, plist]);
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const state = await healthy();
        if (state.service === "morning-tab" && state.version === version) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw Error(`Service did not become healthy. Check ${logs}.`);
  } catch (error) {
    run("launchctl", ["bootout", target], { allowFailure: true });
    for (const [to, name] of [[service, "service"], [marketplace, "marketplace"], [plist, "agent.plist"]]) {
      if (preserved.has(name)) await cp(path.join(backup, name), to, { recursive: true });
    }
    if (!preserved.has("agent.plist")) await rm(plist, { force: true });
    if (wasRunning && preserved.has("agent.plist")) run("launchctl", ["bootstrap", `gui/${process.getuid()}`, plist]);
    throw Error(`${error.message} Previous service files restored from ${backup}.`);
  }
  const sources = JSON.parse(run("codex", ["plugin", "marketplace", "list", "--json"]).stdout).marketplaces;
  const previous = sources.find((item) => item.name === "morning-tab-plugins")?.marketplaceSource;
  if (previous && previous.source !== marketplace)
    run("codex", ["plugin", "marketplace", "remove", "morning-tab-plugins", "--json"]);
  try {
    run("codex", ["plugin", "marketplace", "add", marketplace, "--json"]);
  } catch (error) {
    if (previous && previous.source !== marketplace)
      run("codex", ["plugin", "marketplace", "add", previous.source, ...(previous.ref ? ["--ref", previous.ref] : []), "--json"]);
    throw error;
  }
  run("codex", ["plugin", "add", "morning-tab@morning-tab-plugins", "--json"]);
  const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
  const cached = path.join(codexHome, "plugins/cache/morning-tab-plugins/morning-tab", version, "dist/app.html");
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  if (digest(await readFile(cached)) !== digest(await readFile(path.join(plugin, "dist/app.html"))))
    throw Error("Installed plugin differs from this build. Bump the package version and reinstall; the running service is healthy.");
  // Remove only the duplicate manual connection to this exact service.
  const existing = run("codex", ["mcp", "get", "morning-tab", "--json"], { allowFailure: true });
  if (existing.status === 0 && JSON.parse(existing.stdout).transport?.url === url)
    run("codex", ["mcp", "remove", "morning-tab"]);
  console.log(`Morning Tab ${version} service is running at ${url}. Plugin installed from ${marketplace}.`);
  console.log("Existing open app documents keep their JavaScript; reopen the newspaper once to load this release.");
} else throw Error("Usage: node scripts/service.mjs install|status|restart");
